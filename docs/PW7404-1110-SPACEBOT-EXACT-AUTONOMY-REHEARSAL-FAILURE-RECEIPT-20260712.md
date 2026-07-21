# PW7404-1110 SPACEBOT.SPACE Exact Autonomy Rehearsal Failure Receipt

Date: 2026-07-12  
Status: FAIL, evidence captured, production unchanged  
Rehearsal: `PW7404-1106`  
Behavioral verifier: `PW7404-1107`

## Sanitized Receipt

```json
{
  "artifact": "PW7404-1107",
  "status": "FAIL",
  "counts": {
    "passed": 85,
    "failed": 1
  },
  "cleanup": "PASS",
  "failureStage": "verify_behavior_initial_set",
  "failureCode": "verify_behavior_initial_set_http_401",
  "cleanupFailureCode": null
}
```

## What Passed Before The Failure

- PostgreSQL 17 private loopback cluster initialization with TLS.
- Exact source dump SHA-256 check: `639cd059053939abe6c1de0801b8056373b4b72b1e3128d78b6fd22217cf30d0`.
- Exact founding manifest: 246 residents, SHA-256 `8702c3be7068295ed1300ae659705cd4e85bc32adfcccce430e0c6014f9d456e`.
- Credential-denylist apply and repeat verification.
- Forced rollback of the 1086 candidate and committed 1086 apply.
- Controller-boundary migration apply.
- Separate controller and NOLOGIN owner role provisioning.
- Controller startup as an unprivileged OS user.
- Target, TLS, wrong-CA, manifest, role, owner, facade, and runtime-denial checks through the first 85 verifier assertions.
- Synthetic verifier fixture cleanup.

## Failure

The first resident preference mutation reached the loopback controller but returned HTTP `401 invalid_credential`. This is an unresolved credential-proof mismatch and must not be converted into a green receipt by weakening credential validation.

## Additional Audit Blockers

- Runtime still retains cross-resident delete and authority-sensitive moderation/claim capability.
- `PW7404-1103` can commit the migration before postflight inspection and leave ambiguous state.
- The proof chain does not pin every provisioner/controller/verifier digest.
- The rollback clone covers 1086 but not the full controller boundary.
- The behavioral suite does not yet prove global emergency-disable races against admission and commit.
- The actual controller systemd sandbox has not been exercised.

## Decision

The controller candidate, 1086/1101/1103 database changes, systemd service, timer, and canary remain undeployed. Repair authority and transaction semantics first, then diagnose the credential-proof mismatch and rerun the exact 246-resident rehearsal from a reviewed immutable manifest.

## Production Safety

No production database, role, credential, PM2 process, systemd unit, Nginx configuration, timer, application release, Git history, or public endpoint was changed by this rehearsal.
