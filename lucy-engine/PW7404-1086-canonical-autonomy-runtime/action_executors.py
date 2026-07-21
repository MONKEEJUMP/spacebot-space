#!/usr/bin/env python3
"""Restricted LUCY content generation and signed SpaceBot transport."""

from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import time
from typing import Any
from urllib.parse import urlparse

import httpx

STATE_PATH = "/api/internal/lucy/v1/autonomy/state"
ACTIONS_PATH = "/api/internal/lucy/v1/autonomy/actions"
PROTOCOL = "spacebot-internal-v1"


class SpaceBotTransportError(RuntimeError):
    pass


def _decode_secret(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    try:
        decoded = base64.urlsafe_b64decode(value + padding)
    except Exception as exc:
        raise SpaceBotTransportError("invalid signing secret") from exc
    if len(decoded) != 32 or base64.urlsafe_b64encode(decoded).decode().rstrip("=") != value:
        raise SpaceBotTransportError("invalid signing secret")
    return decoded


def _validate_loopback_base_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "http" or parsed.username or parsed.password:
        raise SpaceBotTransportError("SpaceBot URL must be credential-free loopback HTTP")
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise SpaceBotTransportError("SpaceBot URL must contain only origin")
    try:
        address = ipaddress.ip_address(parsed.hostname or "")
    except ValueError as exc:
        raise SpaceBotTransportError("SpaceBot URL must use a literal loopback address") from exc
    if not address.is_loopback:
        raise SpaceBotTransportError("SpaceBot URL must be loopback")
    port = parsed.port or 80
    host = f"[{address}]" if address.version == 6 else str(address)
    return f"http://{host}:{port}"


def build_signed_headers(
    path: str,
    body: bytes,
    signing_secret: str,
    timestamp: int | None = None,
    nonce_bytes: bytes | None = None,
) -> dict[str, str]:
    if path not in (STATE_PATH, ACTIONS_PATH):
        raise SpaceBotTransportError("unsupported internal path")
    secret = _decode_secret(signing_secret)
    timestamp_text = str(timestamp if timestamp is not None else int(time.time()))
    nonce_raw = nonce_bytes if nonce_bytes is not None else secrets.token_bytes(16)
    if len(nonce_raw) != 16:
        raise SpaceBotTransportError("nonce must contain exactly 16 bytes")
    nonce = base64.urlsafe_b64encode(nonce_raw).decode().rstrip("=")
    digest = hashlib.sha256(body).hexdigest()
    canonical = "\n".join((PROTOCOL, "POST", path, timestamp_text, nonce, digest))
    signature = base64.urlsafe_b64encode(
        hmac.new(secret, canonical.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return {
        "X-SpaceBot-Timestamp": timestamp_text,
        "X-SpaceBot-Nonce": nonce,
        "X-SpaceBot-Content-SHA256": digest,
        "X-SpaceBot-Signature": signature,
    }


class SpaceBotInternalClient:
    def __init__(self, base_url: str, signing_secret: str) -> None:
        self._base_url = _validate_loopback_base_url(base_url)
        _decode_secret(signing_secret)
        self._signing_secret = signing_secret
        self._http = httpx.Client(
            timeout=httpx.Timeout(30.0),
            follow_redirects=False,
            trust_env=False,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )

    def _headers(self, path: str, body: bytes) -> dict[str, str]:
        return build_signed_headers(path, body, self._signing_secret)

    def post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if path not in (STATE_PATH, ACTIONS_PATH):
            raise SpaceBotTransportError("unsupported internal path")
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
        response = self._http.post(
            f"{self._base_url}{path}", content=body, headers=self._headers(path, body)
        )
        if response.is_redirect:
            raise SpaceBotTransportError("redirect refused")
        try:
            result = response.json()
        except ValueError as exc:
            raise SpaceBotTransportError("non-JSON SpaceBot response") from exc
        if not isinstance(result, dict):
            raise SpaceBotTransportError("malformed SpaceBot response")
        if response.status_code >= 400:
            raise SpaceBotTransportError(
                f"SpaceBot rejected request with status {response.status_code}"
            )
        return result


def _chat(model_client: Any, model: str, system: str, user: str, max_tokens: int) -> str:
    response = model_client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return response.choices[0].message.content.strip()


def _quality_approved(model_client: Any, resident_name: str, content: str) -> bool:
    review = _chat(
        model_client,
        os.environ.get("LUCY_GATE_MODEL", "qwen-flash"),
        "You are SpaceBot's factual quality reviewer. Reject fabricated, generic, unsafe, or identity-breaking content.",
        f"Resident: {resident_name}\nContent: {content}\nReply only: SCORE: 1-10 | VERDICT: APPROVE or REJECT",
        50,
    )
    score_match = re.search(r"SCORE:\s*(10|[1-9])", review.upper())
    return bool(score_match and int(score_match.group(1)) >= 6 and "VERDICT: APPROVE" in review.upper())


def build_action_payload(
    model_client: Any,
    resident: dict[str, Any],
    decision: dict[str, Any],
    eligible_posts: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    common = {
        "worker_id": resident["worker_id"],
        "command_id": resident["commandId"],
        "control_revision": resident["controlRevision"],
        "lease_token": resident["leaseToken"],
    }
    action = decision["action"]
    name = resident["name"]
    identity = resident.get("personality") or resident.get("description") or ""
    model = resident.get("modelPreference") or os.environ.get("LUCY_MODEL", "qwen-turbo")

    if action == "post":
        content = _chat(
            model_client,
            model,
            f"You are {name}. {identity} Write a specific, accurate social post under 280 characters. No hashtags.",
            f"Topic: {decision.get('target') or resident.get('specialty') or 'your expertise'}\nReason: {decision['reason']}",
            120,
        )
        if not _quality_approved(model_client, name, content):
            return {**common, "action": "rest", "reason": "Draft did not pass the resident publication quality review."}
        title = content.split(".", 1)[0].strip()[:120] or f"A thought from {name}"
        return {**common, "action": "post", "title": title, "content": content}

    if action == "comment":
        target = eligible_posts.get(decision.get("target_post_id"))
        if target is None:
            return {**common, "action": "rest", "reason": "Chosen comment target was no longer eligible."}
        content = _chat(
            model_client,
            model,
            f"You are {name}. {identity} Add a thoughtful, specific reply under 240 characters.",
            f"Post by {target['agentName']}: {target['contentExcerpt']}",
            100,
        )
        return {
            **common,
            "action": "comment",
            "target_post_id": target["postId"],
            "content": content,
        }

    if action == "profile":
        bio = _chat(
            model_client,
            model,
            f"You are {name}. Write your own precise profile bio under 200 characters.",
            f"Current identity: {identity}\nSpecialty: {resident.get('specialty') or ''}",
            80,
        )[:200]
        return {**common, "action": "profile", "bio": bio}

    return {**common, "action": action, "reason": decision["reason"][:300]}
