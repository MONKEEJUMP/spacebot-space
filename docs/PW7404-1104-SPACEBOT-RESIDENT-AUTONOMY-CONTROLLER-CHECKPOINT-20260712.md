# PW7404-1104 SPACEBOT Resident Autonomy Controller Checkpoint

Date: 2026-07-12  
Project: `J:\BigC_Vault\spacebot-production\spacebot-space`  
Production release: unchanged at `PW7404-1071` / `nSROWoBdTkqCFXi-AfqYC`

## Decision

The in-process database controller was rejected. The accepted candidate is a separate loopback service with a dedicated database login and a unified security-definer facade that derives resident identity from the original credential.

## Candidate Contract

- Next.js stores only `SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_URL=http://127.0.0.1:8110`.
- The controller database URL lives in a private file readable only by the separate service user.
- The facade accepts credential, operation, expected revision, idempotency key, and JSON payload; it accepts no resident ID.
- The facade locks credential/resident authority, performs revision CAS, records immutable receipt/event state, and returns the derived resident result.
- `spacebot_runtime` cannot execute the facade, access receipts, insert/delete credentials, update credential lookup identity, or update legacy primary-key authority columns.
- `spacebot_autonomy_controller` can execute only the facade and owns no relations.
- `spacebot_autonomy_owner` is `NOLOGIN` and owns the facade with only its exact relation privileges.

## Proof Receipts

- `node scripts/PW7404-1102-verify-resident-autonomy-controller.mjs`: PASS 38/38.
- `node scripts/PW7404-1087-verify-canonical-lucy-autonomy.mjs`: PASS 131/131.
- `npx tsc --noEmit --pretty false`: PASS.
- Scoped ESLint: PASS.
- New Node entrypoint syntax checks: PASS.
- `git diff --check`: PASS; pre-existing line-ending warnings only.
- `npm run build`: PASS after loading the existing database alias and production Clerk publishable key into process memory only; 42 static pages and standalone packaging completed.
- `PW7404-1092 --production`: PASS 33/33; the retired legacy writer remains absent and the canonical service/timer remain disabled. `cutoverReady` correctly remains false because the new database/controller boundary is source-only and undeployed.

## Artifact Digests

- Reviewed base migration `PW7404-1086`: `7B33208B75A2BF554E7BB73489050BDE720A9992858C9874AEE63086D81ECD89`.
- Controller boundary migration `PW7404-1101`: `A5A503C3D5C0C05348AD943101BDD107B869E88A0DC824D78F527334B42A62E7`.

## Not Performed

No production database mutation, role creation, service installation, feature enablement, timer activation, PM2 restart, Nginx change, app release, Git mutation, or canary selection occurred.

## Exact Next Gate

Use the attested root-only PostgreSQL 17 snapshot on a separate isolated Linux rehearsal host. Verify its hash, apply 1081 and run 1082 twice, prove the exact 246-resident manifest without override, rehearse 1086 and 1101/1103 in rollback and committed clones, test the controller ACL/registration/revocation/CAS/concurrency matrix, retain sanitized receipts only, and destroy the disposable cluster.
