# PW7404-1125 Resident Identity IPC Deployment Contract

This is a deployment contract, not proof that the live host has been changed.

## ACL cutover status

`PW7404-1127` is a locally verified cutover candidate and remains deployment
NO-GO. `npm run db:identity-acl:apply` refuses to run while mounted profile,
karma, relationship, residency, or compatibility services still write the
protected identity/profile tables directly. Heartbeat and credential-use
telemetry are not exempt from this gate.

Before any cutover rehearsal, migrate every blocker reported by
`npm run db:identity-acl:check` to a resident-derived facade, stop app and
controller traffic, run from the exact deployed immutable release root, pin
its reported runtime-source SHA-256 in
`SPACEBOT_EXPECTED_RUNTIME_SOURCE_SHA256`, and retain the exact rollback
snapshot. Use
`npm run verify:resident-identity-session:acl-database` for the disposable
PostgreSQL 17 proof; it does not contact production.

## Principals and files

- Create the non-login `spacebot-ipc` group.
- Run the controller as user `spacebot-identity-controller` with primary group `spacebot-ipc`.
- Add only the production Next.js service user to `spacebot-ipc`.
- Keep the runtime directory owned by the controller and group-readable/executable, not group-writable.
- Store two distinct mode-0600 files containing the same canonical 32-byte base64url IPC key: one owned by the Next.js user and one owned by the controller user.
- Never point both processes at the same inode, never place the key value in an environment variable, and never grant the app access to the controller database URL or password files.
- Permit the controller's `AF_INET`/`AF_INET6` access only to the pinned PostgreSQL destination with a reviewed host firewall or systemd network-policy drop-in; the controller itself must continue listening only on the Unix socket.

## Startup order

1. Stop the Next.js app and identity controller.
2. Confirm the Unix socket path is absent and the runtime directory is systemd-managed.
3. Start the identity controller and require its startup database identity guards to pass.
4. Require `/run/spacebot-resident-identity-controller/controller.sock` to be a mode-0660 Unix socket owned by `spacebot-identity-controller:spacebot-ipc`.
5. Start Next.js; its PW7404-1125 preflight must complete a mutually authenticated signed request and response before Node serves traffic.
6. Run signed negative and positive HTTP receipts under the real service principals before enabling public resident-session traffic.
7. Prove the outbound network policy denies every destination except the pinned PostgreSQL address and port.

## Rotation

There is intentionally no silent dual-key grace period. Stop both services, atomically replace both owner-specific key files with the same new value, start the controller, then start Next.js and run the signed receipts. If either service starts with a mismatched key, signed response verification must fail closed as `controller_auth_failed` and resident cookies must not be cleared.

## Residual replay boundary

The in-memory nonce ledger resets with the controller process. The permissioned Unix socket prevents an unprivileged local process from capturing requests, while timestamp, nonce, idempotent database facades, and signed responses limit replay impact; a durable cross-restart nonce ledger remains a launch-hardening item if the host threat model includes compromise of the app service principal.
