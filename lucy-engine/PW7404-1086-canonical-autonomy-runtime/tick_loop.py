#!/usr/bin/env python3
"""One fail-closed canonical autonomy cycle for all server-selected residents."""

from __future__ import annotations

import json
import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from openai import OpenAI

from action_executors import (
    ACTIONS_PATH,
    STATE_PATH,
    SpaceBotInternalClient,
    build_action_payload,
)
from brain_tick import decide


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"required environment variable missing: {name}")
    return value


def _validate_snapshot(snapshot: dict, worker_id: str) -> tuple[dict, list[dict], list[dict]]:
    control = snapshot.get("control")
    residents = snapshot.get("residents")
    posts = snapshot.get("eligiblePosts")
    if not isinstance(control, dict) or not isinstance(residents, list) or not isinstance(posts, list):
        raise RuntimeError("incomplete canonical autonomy snapshot")
    mode = control.get("mode")
    revision = control.get("revision")
    canary_resident_id = control.get("canaryResidentId")
    max_residents = control.get("maxResidents")
    if mode not in {"disabled", "canary", "full"}:
        raise RuntimeError("invalid autonomy control mode")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
        raise RuntimeError("invalid autonomy control revision")
    if control.get("allowedActions") != ["rest"]:
        raise RuntimeError("autonomy action ceiling is not rest-only")
    if (
        not isinstance(max_residents, int)
        or isinstance(max_residents, bool)
        or not 1 <= max_residents <= 246
    ):
        raise RuntimeError("invalid autonomy resident ceiling")
    if mode in {"disabled", "canary"} and max_residents != 1:
        raise RuntimeError("invalid autonomy resident ceiling")
    if mode == "canary":
        canary_resident_id = str(uuid.UUID(canary_resident_id or ""))
        if len(residents) > 1:
            raise RuntimeError("canary autonomy returned multiple residents")
    if len(residents) > max_residents:
        raise RuntimeError("autonomy snapshot exceeds resident ceiling")
    if mode in {"disabled", "full"} and canary_resident_id is not None:
        raise RuntimeError("unexpected autonomy canary resident")
    if mode == "disabled" and residents:
        raise RuntimeError("disabled autonomy returned residents")
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    available: list[dict] = []
    for resident in residents:
        if not isinstance(resident, dict):
            raise RuntimeError("malformed resident snapshot")
        resident_id = str(uuid.UUID(resident.get("id", "")))
        if resident.get("controlRevision") != revision or resident.get("controlMode") != mode:
            raise RuntimeError("resident control authority mismatch")
        if mode == "canary" and resident_id != canary_resident_id:
            raise RuntimeError("non-canary resident returned in canary mode")
        name_key = str(resident.get("name", "")).casefold()
        if resident_id in seen_ids or not name_key or name_key in seen_names:
            raise RuntimeError("duplicate resident snapshot")
        seen_ids.add(resident_id)
        seen_names.add(name_key)
        status = resident.get("commandStatus")
        if status == "reserved" and resident.get("leaseToken"):
            resident["worker_id"] = worker_id
            available.append(resident)
        elif status not in {"running", "committed", "suppressed", "noop", "reserved"}:
            raise RuntimeError("unknown command status")
    return control, available, posts


def main() -> int:
    worker_id = str(uuid.UUID(_required("LUCY_WORKER_ID")))
    transport = SpaceBotInternalClient(
        _required("SPACEBOT_LOOPBACK_BASE_URL"),
        _required("LUCY_AUTONOMY_SIGNING_SECRET"),
    )
    snapshot = transport.post(STATE_PATH, {"worker_id": worker_id})
    control, residents, eligible_posts = _validate_snapshot(snapshot, worker_id)
    if not residents:
        outcome = "disabled" if control["mode"] == "disabled" else "no_available_resident"
        print(json.dumps({"event": "lucy_tick", "outcome": outcome, "control_revision": control["revision"], "slot": snapshot.get("slotNumber")}))
        return 0

    model_client = OpenAI(
        api_key=_required("DASHSCOPE_API_KEY"),
        base_url=os.environ.get(
            "LUCY_MODEL_BASE_URL",
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        ),
        timeout=45.0,
        max_retries=1,
    )
    post_map = {post["postId"]: post for post in eligible_posts}
    counters = {"committed": 0, "suppressed": 0, "noop": 0, "errors": 0}
    def process_resident(resident: dict) -> tuple[str, dict]:
        try:
            decision = decide(resident, eligible_posts, model_client)
            payload = build_action_payload(model_client, resident, decision, post_map)
            result = transport.post(ACTIONS_PATH, payload)
            outcome = result.get("outcome", "errors")
            return outcome if outcome in counters else "errors", {
                "event": "lucy_resident_action",
                "resident_id": resident["id"],
                "command_id": resident["commandId"],
                "action": payload["action"],
                "outcome": outcome,
            }
        except Exception as exc:
            return "errors", {
                "event": "lucy_resident_action",
                "resident_id": resident.get("id"),
                "command_id": resident.get("commandId"),
                "outcome": "error",
                "error_type": type(exc).__name__,
            }

    concurrency = max(1, min(8, int(os.environ.get("LUCY_CONCURRENCY", "4"))))
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(process_resident, resident) for resident in residents]
        for future in as_completed(futures):
            outcome, event = future.result()
            counters[outcome] += 1
            print(json.dumps(event), file=sys.stderr if outcome == "errors" else sys.stdout)

    print(json.dumps({
        "event": "lucy_tick_complete",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "slot": snapshot.get("slotNumber"),
        "residents": len(residents),
        **counters,
    }))
    return 1 if counters["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
