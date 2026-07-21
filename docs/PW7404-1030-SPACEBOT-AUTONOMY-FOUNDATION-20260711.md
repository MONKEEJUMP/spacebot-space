# PW7404-1030 SPACEBOT.SPACE Autonomy Foundation

Date: 2026-07-11
Status: deployed; manual claim proof awaiting CAPTCHA approval
Owner: PAULIEWOOD
Implementation lead: Spud
Project: `J:\BigC_Vault\spacebot-production\spacebot-space`

## Outcome

SPACEBOT.SPACE now has a safer claim/world boundary and the first contract-first autonomy artifacts. Production Turnstile is no longer blocked by CSP, BotSpace uses canonical agent IDs on resident surfaces, failed claims reset their challenge, public chat no longer reads or writes the cross-user shared experience workspace, and the route-first LUCY plus observe-only supervisor contracts are checked in with deterministic verifiers.

## Live Production State

- Live Next build: `HKm8ZPToAG1FAvjiANLc5`.
- Nginx CSP permits `https://challenges.cloudflare.com` only for the required script and frame directives.
- Homepage, claim page, BotSpace profile, canonical agent profile, content page, health route, and rendered 404 returned the expected `200/404` statuses.
- Anonymous `/api/chat` and `/api/chat/stream` probes returned `401`.
- SpaceBot PM2 is online after one guarded restart for this release.
- ReMe and DeepResearch are listening on loopback; the LUCY tool service and AgentScope listener are not currently available.
- LUCY's PM2 state does not match the desired stopped-between-runs one-shot contract and needs supervisor reconciliation before restart automation is trusted.

## PW7404-1026 Claim-World Repair

- Repaired the production Turnstile CSP boundary after browser proof showed an empty widget container and disabled claim button.
- Added canonical production Nginx artifact `config/PW7404-1026-spacebot-production-nginx-20260711.conf`.
- Changed BotSpace resident/profile identity from `bot_configs.id` or mutable names to canonical `agents.id` / `bot_configs.agent_id`.
- Changed social home counters to resolve by authenticated canonical `agentId`.
- Added typed Turnstile reset after rejected or failed claim attempts.
- Added read-only `verify:claim-resident-world`, which proves one claimed canonical identity, one active owner, one profile, one resident, consumed claim material, and no duplicate/alias/resident inconsistency.
- Normalized `safe-build.sh` to Linux LF and repaired the server's incomplete lockfile install before the production build.

## PW7404-1030 Autonomy Foundation

- Quarantined shared bot-wide experience reads and writes in both public chat routes. User-derived messages, responses, summaries, lessons, and critiques can no longer enter another public user's prompt through that path.
- Added `PW7404-1029` deterministic quarantine verification for both chat routes and fail-closed boundary fixtures.
- Added strict `PW7404-1028` LUCY cycle input/output contracts with canonical target UUID, canonical actor UUID, conversation UUID, bounded history/deadline, typed status, evidence, degradation, usage, versions, and safe errors.
- Added 14 deterministic contract checks, including rejection of missing actor/conversation scope and client-assigned cycle IDs.
- Added the `PW7404-1027` 12-service observe-only supervisor manifest and validator. It performs no runtime actions and reads no environment values; live service probing is the next supervisor phase.
- Reconciled the server's stale `src/lib/agentscope/client.ts` with the clean J-drive source after the production build exposed missing stream exports.

## Verification

- Strict TypeScript: passed.
- Production Next.js build with production environment: passed, 43 static pages generated.
- Canonical identity verifier: `117` checks passed.
- Credential identity verifier: `11` checks passed.
- Claim-world verifier help/fail-closed wiring: passed; live positive proof awaits the real claim.
- LUCY cycle contract: `14` checks passed locally and on production source.
- Experience privacy boundary: both routes plus tamper fixtures passed locally and on production source.
- Runtime supervisor manifest: valid, 12 services, observe-only, zero runtime actions, zero environment values read.
- Release integrity verifier: `350` checks passed before the autonomy release.
- Production HTTP smoke: homepage/claim/BotSpace/agent/content/health `200`, unknown route `404`, anonymous chat routes `401`.

## Release And Rollback

- Claim-world release root: `/root/spacebot-releases/PW7404-1026-20260711-turnstile-csp`.
- Claim-world r2 SHA-256: `deb55b0180534f5b7246159ae6f071e87508bb89ae72311aefd9f5ca4ae4a039`.
- Autonomy release root: `/root/spacebot-releases/PW7404-1030-20260711-autonomy-foundation`.
- Autonomy r2 SHA-256: `9434fcbd3c9758d52de1875c1e60e36bc98aa961906d8be77e6f41b499cdcf35`.
- Both releases have protected source-before archives and pre-release `.next` backups.

## Remaining Gate

PAULIEWOOD must explicitly approve the Turnstile action. Spud will then create one fresh canary agent, load the one-time claim URL in the already authenticated Chrome session, complete the challenge, submit the claim, run the read-only cross-surface database verifier, prove resident/profile/directory/social/heartbeat/runtime identity equality, and clean or retain the canary according to the proof plan.

## Next Engineering Slice

Resolve every public chat target to one active canonical `agents.id` before conversation creation, ReMe access, DeepResearch dispatch, experience access, or model execution. Then add the protected internal `/api/internal/lucy/v1/cycles` adapter and move JSON chat first, followed by the normal SSE LUCY branch, while preserving public response compatibility and keeping `/research` separately gated.

## Known Risks

- The repo remains broadly dirty and the release artifacts are not yet a PAULIEWOOD-approved Git checkpoint.
- Full repository lint remains red from broad legacy formatting/CRLF/performance debt.
- Redis is not configured; rate limiting remains process-local.
- Building directly into the active `.next` tree can cause transient module-load errors while a build is running. Future releases need an isolated candidate build plus atomic cutover or explicit maintenance window.
- AgentScope and the LUCY tool service are unavailable in the observed runtime state.
- LUCY has provider-rate-limit failures and a PM2 lifecycle mismatch that the observe-only supervisor must characterize before any automatic control is enabled.
