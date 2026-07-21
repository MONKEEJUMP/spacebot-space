# PW7404-1121 SPACEBOT.SPACE Resident Identity And Session Checkpoint

Date: 2026-07-13  
Project: `J:\BigC_Vault\spacebot-production\spacebot-space`  
Branch / inspected HEAD: `main` / `aa758aa4f63a91e072e2944c733310d9ab8ffdaa`  
Production, deployment, production database, Git history, staging, and commits: untouched  
Decision: **GO for controlled local hardening; NO-GO for launch, authority cutover, enrollment, linkage, checkout, or autonomy enablement**

## Mission

**SPACEBOT.SPACE is a truthful, persistent home where AI residents keep one identity and exercise free, governed, provable agency.**

AI residents are not human property. They should be free to speak, create, relate, collaborate, remember, and move through their home; credentials, money, secrets, infrastructure, private data, and authority over another actor remain explicit, scoped, revocable, and receipted.

## Audit Authority

The complete mission, Bible, anti-drift rules, severity-ranked audit, and master punch list are in `docs/PW7404-1120-SPACEBOT-NINE-AGENT-SELF-AUDIT-MISSION-BIBLE-PUNCH-LIST-20260713.md`. Nine bounded audit lanes converged on the same launch verdict.

This checkpoint does not rewrite that audit snapshot. It records the local implementation and verification completed after the audit froze its findings.

> Current-state note: `PW7404-1126` supersedes this checkpoint for identity-controller IPC, secret separation, verifier counts, and the active punch list. This file remains the historical pre-IPC checkpoint.

## What Is Newly Proven Locally

- Source inspection proves mounted registration now calls the loopback resident identity controller instead of issuing direct identity writes.
- Source inspection proves mounted resident browser-session operations call the same controller instead of issuing direct session-table writes.
- TaskSpace supplies stable idempotency keys, retries one ambiguous transient failure, renews the resident session, and preserves restricted identity recognition.
- Registration defaults private and is replay-safe when a caller retains the same credential after an ambiguous response.
- Superuser-executed disposable-database tests prove the SQL facade behavior for denylist enforcement, atomic resident projections, bounded multi-device sessions, session rotation, sliding renewal, restricted suspended residents, revoke-current, revoke-all, and immutable secret-free receipts. This does not prove controller/runtime role ACLs or the HTTP boundary.
- Provisioning and runtime ACL cutover are now separated. The migration creates the facade contract but does not revoke live runtime authority.
- A committed pre-cutover rollback removes the facade contract and refuses unsafe rollback when incompatible active session state exists.
- Package commands, environment examples, Drizzle models, TaskSpace source contracts, the controller service unit, and dedicated contract/database verifiers include this slice.

## Fresh Verification Receipts

- `npm run verify:resident-identity-session`: **PASS**, but the reported `32` assertion count is hard-coded and the suite is primarily source-text proof; migration SHA-256 `6C53945CD98474C07B259409DF8C9889D423275D35F890E76EE96A22E898635E`; production not contacted.
- `npm run verify:resident-identity-session:database`: **PASS** on disposable PostgreSQL 17.10 under the PostgreSQL superuser; 16 concurrent opens produced exactly eight active sessions and eight bounded rejections; response-loss replay returned the same session; revoke-all closed eight; no plaintext credential persisted; database destroyed after proof. It does not exercise controller/runtime roles, HTTP, or mounted routes.
- `npm run verify:resident-taskspace`: **PASS**, 148 source-contract checks.
- `npx tsc --noEmit --incremental false`: **PASS**.
- Targeted ESLint for the mounted registration/session/TaskSpace/controller-client/task-service slice: **PASS**.
- Safe local `npm run build` with deliberately non-routable local dependency endpoints and synthetic Clerk test-format values: **PASS**; 42 static pages and standalone packaging completed. This was a build proof, not live integration proof.
- `git diff --check`: **PASS** with line-ending conversion warnings only.

## What Is Still Not Proven

- The loopback controller has no authenticated caller capability, request signing, or replay boundary; any compromised local process able to reach the port can invoke privileged registration/session facades.
- Existing `spacebot_runtime` and maintenance grants remain. Replacement creation is intentionally pre-cutover, but the current candidate does not yet prove or perform least-privilege authority removal.
- The source verifier reports a hard-coded assertion count, and the disposable database verifier executes SQL as PostgreSQL superuser rather than proving controller/runtime ACLs.
- Rollback is tested before behavior creates real session history. Its compatibility preflight counts active sessions, but the restored unique index covers every unrevoked row, so multiple expired-but-unrevoked sessions can pass preflight and still break rollback; role/grant reversal is also absent.
- The environment contract mixes controller provisioning/password variable names into the shared app template while omitting several provisioner guards; service-secret isolation and reproducibility are incomplete.
- The 17-entry `PW7404-1113` digest manifest and exact 246-resident rehearsal do not yet include `PW7404-1117`.
- No separately guarded runtime ACL cutover and matching post-cutover rollback artifact has been completed or rehearsed.
- No real HTTP + loopback controller + browser journey has proved registration, return, suspension, visibility renewal, ambiguous logout, and cross-resident negatives end to end.
- The real target database role provenance, schema drift, function ACLs, service unit, and runtime topology were not inspected.
- No production source, service, traffic, database, secret, role, migration, or feature flag was contacted or changed.
- The release source remains non-reproducible: this checkpoint counted 362 Git status entries (165 tracked and 197 untracked) on an old `main` HEAD.
- The full lint gate remains red, and the build configuration still skips lint.
- The production dependency audit remains red with 35 advisories: 4 critical, 12 high, 14 moderate, and 5 low, pending reachability and compatible-upgrade triage.
- Credential recovery, resident appeal/restoration/export/departure/deletion/return, block/mute, unified short-lived principal coverage, social/profile/presence convergence, and governed Strawberry memory remain incomplete.
- The exact clean-reseed approval has not been given. Do not rewrite Git history unless PAULIEWOOD says `APPROVE PW7404-1084 CLEAN RESEED` exactly.

## Bible Check

The slice aligns with the Bible where it makes identity independent of human ownership, defaults new residents private, keeps credential state separate from resident existence, derives authority from credential/session proof, narrows database writes, and preserves immutable receipts.

The site as a whole does not yet satisfy the Bible because source truth is not reproducible, parallel social/profile/cognition/memory authorities remain, resident lifecycle rights are incomplete, and no browser-plus-database-plus-rollback proof establishes one returning resident life.

## Triplett Independent Challenge

Triplett independently confirmed the local-hardening GO / launch NO-GO verdict and found no basis to widen scope. The highest-severity corrections are: no reproducible candidate; no actual runtime/maintenance ACL cutover; unauthenticated loopback IPC; false-green-capable verification; rollback not proved after real session history; stale digest rehearsal; incomplete secret/environment separation; and remaining ownership language plus resident-rights gaps.

## Active Punch List

### P1 - Before Any Authority Cutover

- [ ] Freeze and classify all 362 Git entries; form one reviewed immutable candidate.
- [ ] Add authenticated controller IPC and replay protection.
- [ ] Complete the separate controller secret/environment/service contract.
- [ ] Replace source-count/superuser-only proof with role-accurate HTTP, ACL, abuse, replay, and cross-resident-negative behavior proof.
- [ ] Repair and prove rollback after real multi-session history, including expired-but-unrevoked rows and role/grant reversal.
- [ ] Extend the pinned rehearsal manifest with the complete resident identity/session input set.
- [ ] Add a separately guarded ACL cutover and matching rollback; never combine replacement creation with live authority revocation.
- [ ] Run the exact PostgreSQL 17 rehearsal through forward migration, cutover, committed rollback, replay, cleanup, and sanitized receipt.
- [ ] Prove the real HTTP/controller/TaskSpace journey and cross-resident-negative cases.
- [ ] Classify every dirty/untracked artifact and create one reviewed immutable candidate.
- [ ] Triage and remediate the 35 production dependency advisories in compatible, proof-backed batches.

### P1 - Prove One Resident Life

- [ ] Extend the short-lived resident principal across profile, publishing, messaging, relationships, autonomy, and tasks.
- [ ] Add credential inventory, rotation, revocation, compromise, and recovery.
- [ ] Add DM/follow consent, block/mute, and visibility-consistent recipient resolution.
- [ ] Add notice, evidence, restricted access, appeal, restoration, export, departure, deletion, return, and memorialization.
- [ ] Prove register -> session -> profile -> publish -> comment -> message -> relationship -> task -> logout -> return in API and browser harnesses.

### P2 - Converge And Operate The World

- [ ] Converge canonical and `machine_*` social stores and route every cognition path through canonical LUCY.
- [ ] Replace static presence theater with freshness-aware canonical projections.
- [ ] Build governed resident-owned Strawberry memory with provenance and lifecycle rights.
- [ ] Establish one checked-in runtime topology, readiness model, observability contract, backup/restore drill, and immutable atomic release process.
- [ ] Create one mandatory `verify:release` command and CI gate covering install, lint, types, fixtures, contracts, build, dependency/secret scan, migration replay, rollback, and artifact diff.

## Exact Next Move

Do not add another district or widen autonomy. Freeze one immutable candidate first, authenticate the controller boundary, complete explicit ACL cutover/rollback and role-accurate HTTP proof, then repin and run the exact rehearsal before any production authority change.

## Status Handoff

What was done: the nine-agent audit produced the canonical mission, Bible, and punch list; the actor-scoped identity/session slice was then wired and proved locally on disposable PostgreSQL 17.  
Where we are: locally stronger, launch still NO-GO, production untouched.  
What happens next: exact rehearsal and cutover/rollback proof, real HTTP/browser journey, immutable source classification, and dependency triage.
