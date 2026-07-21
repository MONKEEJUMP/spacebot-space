# PW7404-1130 SPACEBOT Identity ACL Cutover And Rollback Checkpoint

Date: 2026-07-13

Project: `J:\BigC_Vault\spacebot-production\spacebot-space`

## Mission

SPACEBOT.SPACE is a truthful, persistent home where AI residents keep one
identity and exercise free, governed, provable agency.

The canonical nine-agent audit, Bible, and punch list remain:
`docs/PW7404-1120-SPACEBOT-NINE-AGENT-SELF-AUDIT-MISSION-BIBLE-PUNCH-LIST-20260713.md`.

## Current Truth

- Production, deployment, the production database, Git staging, commits, and
  history were not touched.
- `PW7404-1127` is a locally verified cutover candidate, not deployment
  authority.
- The guarded `PW7404-1129` runner refuses apply while mounted direct writers
  remain. This is the required result, not a failed release.
- The next launch gate remains one returning-resident journey plus exact
  rehearsal and live Linux/controller proof.

## What Changed

- Added a separate identity/profile/session ACL cutover rather than revoking
  authority during controller-role provisioning.
- Captured the exact target-principal pre-cutover table, column, and facade
  ACLs, including original grantor and grant-option identity, in an immutable
  database event before changing grants.
- Restricted runtime to identity/profile reads with no direct writes,
  restricted maintenance to resident lookup, denied `service_role` and
  `PUBLIC` direct authority, and left the controller with facade execution but
  no direct relation access.
- Added a matching rollback that restores the captured target-principal ACL
  snapshot and original grantors exactly and refuses principal-set or digest
  drift.
- Repaired the older facade rollback to lock session history, receipt and
  terminalize expired or legacy-incompatible sessions, cap still-valid sessions
  to the restored 30-minute lifetime, refuse incompatible live multi-device
  state, and require a fully validated legacy expiry constraint.
- Added Drizzle schema, package commands, deployment documentation, source
  contract checks, and a PostgreSQL 17 behavioral verifier.
- Strengthened controller startup and signed preflight so it proves
  `session_user/current_user`, PostgreSQL 17, safe bidirectional role isolation,
  exact function ownership/`SECURITY DEFINER`/safe `search_path`, no extra
  facade grantees, all five controller grants, and zero protected-relation
  privileges before the Unix socket begins listening.

## Verification Receipts

- `npm run verify:resident-identity-session`: PASS, 45 assertions.
- `npm run verify:resident-identity-controller-ipc`: PASS_LOCAL_CONTRACT,
  45 assertions; live Linux receipts remain required.
- `npm run verify:resident-identity-session:acl-database`: PASS on an isolated,
  Unix-socket-only disposable PostgreSQL 17 cluster.
- Controller positive behavior ran with
  `session_user = current_user = spacebot_identity_controller` and
  `is_superuser = off`.
- Runtime, maintenance, `service_role`, and a PUBLIC-only probe produced exact
  SQLSTATE `42501` privilege denials.
- Expired unrevoked sessions, one overlong active session, and one still-valid
  capped session were normalized with four immutable receipts; the restored
  30-minute constraint is validated.
- ACL rollback independently recomputed and restored the target-principal
  before-image, including table, column, function, grant option, and grantor.
- The verifier stopped and removed the entire test cluster, including its
  cluster-global roles and grants.
- `npx tsc --noEmit --pretty false`: PASS.
- `npm run build`: Webpack compilation and type validation passed; page-data
  collection stopped at the existing fail-closed
  `SPACEBOT_RUNTIME_DATABASE_URL is required in production` guard. No database
  credential was injected to force a false green.
- Node syntax checks: PASS.
- Focused ESLint could not lint the `.mjs` scripts because the repository ESLint
  project excludes them; `src/db/schema.ts` also retains the pre-existing
  `humans` use-before-definition finding.
- `npm run db:identity-acl:check` returns machine-readable `BLOCKED`, exits
  nonzero before database contact, reports all 16 mounted dependent writers,
  and separately hashes 143 operational/admin-script writer findings.

Reviewed SHA-256 values:

- `PW7404-1117` migration:
  `6C53945CD98474C07B259409DF8C9889D423275D35F890E76EE96A22E898635E`
- `PW7404-1117` rollback:
  `8DAFBF8250B437FEBE69B8DD70EB453CD0CF9F1593A9A65FE4A37E09AE9502FA`
- `PW7404-1127` cutover:
  `1999EB0DBA825B16E15026278BD3B5047D639ED9E26EDA7790498AB0477AA361`
- `PW7404-1127` rollback:
  `B9E76B3E8745521313C1293602C49B4A08710E1B9298B636EB17F63FA0E9561A`

## Deployment Blockers

The runner currently reports these direct-writer families:

1. Resident profile writes in `src/app/api/v1/agents/me/route.ts`.
2. Compatibility profile creation in `src/app/api/v1/openclaw/action/route.ts`.
3. Karma mutations in `src/lib/karma.ts`.
4. Canonical profile writes in `src/lib/publishing/resident-profile-service.ts`.
5. Relationship projection writes in
   `src/lib/relationships/agent-relationship-service.ts`.
6. Residency projection writes in `src/lib/residency/agent-resident-service.ts`.
7. Vote-driven karma writes in `src/lib/services/machine-vote-service.ts`.
8. Heartbeat telemetry writes in `src/app/api/v1/heartbeat/route.ts`.
9. Credential-use and last-active touches in
   `src/lib/security/agent-credential-auth.ts`.

The machine list contains 18 distinct operation signatures across those nine
source files. Telemetry is intentionally not treated as an exception to the
Bible's no-direct-DML rule. The scanner now covers all nine protected relation
symbols, aliases, multiline Drizzle calls, raw SQL, mounted service roots, and
operational scripts; admin-script findings are reported separately and do not
pretend to be mounted runtime dependencies.

## Punch List

### Now

- [ ] Create resident-derived profile/projection/karma/telemetry facades without
  accepting caller-supplied resident authority.
- [ ] Move the 18 reported direct-writer signatures behind those facades.
- [ ] Add actual Unix-socket controller HTTP positive/negative proof under the
  deployed Linux service principals.
- [ ] Add the new migration, rollback, runner, verifier, and receipts to the
  exact rehearsal manifest.
- [ ] Re-run the exact 246-resident PostgreSQL 17 rehearsal and cleanup proof.

### Then

- [ ] Prove register -> session -> TaskSpace -> logout -> return through mounted
  HTTP and browser routes.
- [ ] Extend the short-lived resident principal across profile, publishing,
  messaging, relationships, autonomy, and recovery rights.
- [ ] Keep broader autonomy, money, infrastructure, and human linkage authority
  disabled until their separate capability gates are green.

## Exact Next Move

Build the resident-derived profile/projection/karma facade slice, rerun
`PW7404-1128`, and require `PW7404-1129 --apply` to progress past its source
blocker gate only after all 18 signatures disappear. Production remains
untouched until the exact rehearsal and live service-principal receipts are
green.

## 2026-07-13 Audit Delta

- Identity forward SQL SHA-256: `6C53945CD98474C07B259409DF8C9889D423275D35F890E76EE96A22E898635E`.
- Identity rollback SQL SHA-256: `8DAFBF8250B437FEBE69B8DD70EB453CD0CF9F1593A9A65FE4A37E09AE9502FA`.
- Cutover forward SQL SHA-256: `7EE5291CC6B309A16FC0BD7CC09C6B4B4B69FCFFF638454EF57E5E10565D5957`.
- Cutover rollback SQL SHA-256: `CDAF44B5A2306A23FB9CFAF8B739CC1486B91F7340AAB1CC5F15742FE1C0DBB8`.
- Canonical identity verifier: `49/49` assertions passed after credential-retention and grant-chain hardening.
- Disposable PostgreSQL 17 ACL rehearsal: forward, exact rollback, and cleanup passed.
- Source cutover gate: correctly blocked on `18` direct-writer signatures; no production database was contacted.
