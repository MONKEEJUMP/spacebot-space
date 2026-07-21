#!/usr/bin/env python3
"""Contract tests for the canonical autonomy snapshot validator."""

from __future__ import annotations

import unittest

from tick_loop import _validate_snapshot


WORKER_ID = "00000000-0000-4000-8000-000000001097"
CANARY_ID = "00000000-0000-4000-8000-000000001086"
OTHER_RESIDENT_ID = "00000000-0000-4000-8000-000000001087"


def make_snapshot(
    *,
    mode: object = "disabled",
    revision: object = 1,
    allowed_actions: object = None,
    canary_resident_id: object = None,
    max_residents: object = 1,
    residents: list[object] | None = None,
) -> dict:
    control = {
        "mode": mode,
        "revision": revision,
        "allowedActions": ["rest"] if allowed_actions is None else allowed_actions,
        "canaryResidentId": canary_resident_id,
        "maxResidents": max_residents,
    }
    return {
        "control": control,
        "residents": [] if residents is None else residents,
        "eligiblePosts": [],
    }


def make_resident(
    resident_id: str = CANARY_ID,
    *,
    name: str = "Canary Resident",
    revision: int = 1,
    mode: str = "canary",
) -> dict:
    return {
        "id": resident_id,
        "name": name,
        "controlRevision": revision,
        "controlMode": mode,
        "commandStatus": "reserved",
        "leaseToken": "lease-token",
    }


class ValidateSnapshotTests(unittest.TestCase):
    def test_disabled_accepts_zero_residents(self) -> None:
        snapshot = make_snapshot(mode="disabled", residents=[])

        control, available, posts = _validate_snapshot(snapshot, WORKER_ID)

        self.assertIs(control, snapshot["control"])
        self.assertEqual(available, [])
        self.assertEqual(posts, [])

    def test_disabled_rejects_residents(self) -> None:
        snapshot = make_snapshot(
            mode="disabled",
            residents=[make_resident(mode="disabled")],
        )

        with self.assertRaisesRegex(RuntimeError, "disabled autonomy returned residents"):
            _validate_snapshot(snapshot, WORKER_ID)

    def test_canary_accepts_exactly_configured_resident(self) -> None:
        resident = make_resident()
        snapshot = make_snapshot(
            mode="canary",
            canary_resident_id=CANARY_ID,
            residents=[resident],
        )

        _, available, _ = _validate_snapshot(snapshot, WORKER_ID)

        self.assertEqual(available, [resident])
        self.assertEqual(resident["worker_id"], WORKER_ID)

    def test_canary_rejects_wrong_resident(self) -> None:
        snapshot = make_snapshot(
            mode="canary",
            canary_resident_id=CANARY_ID,
            residents=[make_resident(OTHER_RESIDENT_ID)],
        )

        with self.assertRaisesRegex(RuntimeError, "non-canary resident returned"):
            _validate_snapshot(snapshot, WORKER_ID)

    def test_canary_rejects_multiple_residents(self) -> None:
        snapshot = make_snapshot(
            mode="canary",
            canary_resident_id=CANARY_ID,
            residents=[
                make_resident(),
                make_resident(OTHER_RESIDENT_ID, name="Other Resident"),
            ],
        )

        with self.assertRaisesRegex(RuntimeError, "canary autonomy returned multiple residents"):
            _validate_snapshot(snapshot, WORKER_ID)

    def test_malformed_mode_fails(self) -> None:
        for mode in (None, "", "paused", 1):
            with self.subTest(mode=mode):
                with self.assertRaisesRegex(RuntimeError, "invalid autonomy control mode"):
                    _validate_snapshot(make_snapshot(mode=mode), WORKER_ID)

    def test_malformed_revision_fails(self) -> None:
        for revision in (None, 0, -1, True, "1"):
            with self.subTest(revision=revision):
                with self.assertRaisesRegex(RuntimeError, "invalid autonomy control revision"):
                    _validate_snapshot(
                        make_snapshot(revision=revision),
                        WORKER_ID,
                    )

    def test_malformed_action_ceiling_fails(self) -> None:
        for allowed_actions in ([], ["post"], ["rest", "post"], "rest", None):
            with self.subTest(allowed_actions=allowed_actions):
                snapshot = make_snapshot()
                snapshot["control"]["allowedActions"] = allowed_actions
                with self.assertRaisesRegex(RuntimeError, "action ceiling is not rest-only"):
                    _validate_snapshot(snapshot, WORKER_ID)

    def test_malformed_resident_ceiling_fails(self) -> None:
        for ceiling in (None, 0, -1, True, "1", 247):
            with self.subTest(ceiling=ceiling):
                with self.assertRaisesRegex(RuntimeError, "resident ceiling"):
                    _validate_snapshot(
                        make_snapshot(max_residents=ceiling),
                        WORKER_ID,
                    )

    def test_full_mode_enforces_resident_ceiling(self) -> None:
        snapshot = make_snapshot(
            mode="full",
            max_residents=1,
            residents=[
                make_resident(mode="full"),
                make_resident(
                    OTHER_RESIDENT_ID,
                    name="Other Resident",
                    mode="full",
                ),
            ],
        )
        with self.assertRaisesRegex(RuntimeError, "exceeds resident ceiling"):
            _validate_snapshot(snapshot, WORKER_ID)


if __name__ == "__main__":
    unittest.main()
