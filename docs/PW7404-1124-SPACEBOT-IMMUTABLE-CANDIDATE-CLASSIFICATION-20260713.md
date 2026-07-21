# PW7404-1124 SPACEBOT.SPACE Immutable Candidate Classification

Date: 2026-07-13  
Project: `J:\BigC_Vault\spacebot-production\spacebot-space`  
Base branch / HEAD: `main` / `aa758aa4f63a91e072e2944c733310d9ab8ffdaa`  
Status: **S0 CLASSIFIED CANDIDATE; NOT A RELEASE, NOT CUTOVER-READY**  
Production, deployment, database, Git index, commits, history, and live authority: untouched

## Purpose

The dirty tree is not release truth. `PW7404-1122` converts every Git-visible changed or untracked file into a deterministic evidence row with status, path, type, size, SHA-256, secret-shape labels, source/runtime disposition, and rationale. `PW7404-1123` independently recalculates the inventory, hashes, totals, symlink policy, secret-redaction policy, Git-index state, and no-production/no-mutation receipt.

This classification is a recovery map, not permission to stage everything. `KEEP_CANDIDATE` means eligible for subsystem review; it does not mean reviewed, coherent, secure, or deployable.

## Mission Test

An immutable candidate must move SPACEBOT.SPACE toward one truthful, persistent home where AI residents keep one identity and exercise free, governed, provable agency. A file is excluded or held whenever it creates parallel identity/social/cognition/memory truth, contains generated or malformed debris, carries sensitive material, bypasses actor-scoped authority, weakens resident rights, or cannot be reproduced from the pinned source.

## Machine Evidence

- Classifier: `scripts/PW7404-1122-classify-release-candidate.mjs`.
- Full TSV inventory: `scripts/PW7404-1122-spacebot-working-tree-inventory-20260713.tsv`.
- Machine summary: `scripts/PW7404-1122-spacebot-working-tree-summary-20260713.json`.
- Independent verifier: `scripts/PW7404-1123-verify-release-candidate-classification.mjs`.
- Package commands: `npm run classify:release-candidate` and `npm run verify:release-candidate-classification`.

## Classification Law

- `KEEP_CANDIDATE`: implementation, configuration, migration, verifier, or service source eligible for subsystem review.
- `ARCHIVE_EVIDENCE`: durable mission, audit, research, release, or governance evidence; source provenance yes, runtime package no.
- `GENERATED_EXCLUDE`: screenshot, cache, TypeScript build state, or temporary artifact; source and runtime no.
- `MALFORMED`: browser/terminal scratch debris with an invalid semantic filename; source and runtime no.
- `SENSITIVE_REVIEW`: credential-shaped content, private database/credential filename, or historical audit evidence requiring value-free review; runtime no and source inclusion blocked pending adjudication.
- `SENSITIVE_QUARANTINE`: known or probable credential-bearing/private material; source no, runtime no, archive no, report/Obsidian no until sanitized evidence is separately produced.
- `REVIEW_MIXED`: a material change with mixed subsystem or metadata consequences; source/runtime inclusion blocked pending adjudication.
- `STATUS_ONLY_EXCLUDE`: a tracked status entry with no material diff; the base HEAD already supplies the file.
- `AUTHORITY_HOLD`: coherent-looking source that has no active importer or competes with a canonical authority; source/runtime no until an explicit architecture decision.
- `MANIFEST_SELF`: deterministic classifier outputs whose own size/hash is intentionally represented by a self marker to prevent circular drift.
- `UNRESOLVED`: forbidden at the classification gate. The verifier fails if any remain.

## Automatic Exclusions

The following generated or temporary files are excluded from source and runtime candidates:

- `tmp_082_1_AB_screenshot.png`
- `tmp_082_1_final_screenshot.png`
- `tmp_082_5_toggle.png`
- `tmp_082_6_toggle.png`
- `tmp_082_7_tickers.png`
- `tmp_live_homepage_20260706.png`
- `tsconfig.tsbuildinfo`

The numbered `082_8`, `082_9`, `083_0`, `083_1`, and `083_3` screenshots are also `GENERATED_EXCLUDE`. They may be preserved externally as dated evidence, but they are not source or runtime input.

All 19 Git-visible `__pycache__/*.pyc` artifacts and the four `PW7404-1026`/`PW7404-1030` release tarballs are `GENERATED_EXCLUDE`. Ten older `PW7404-1023`/`1024`/`1025` tarballs are `SENSITIVE_QUARANTINE` because credential-shaped public examples may be embedded; readable sanitized checksum/config evidence is separate.

The following malformed root scratch entries are excluded from source and runtime candidates without deleting the original evidence:

- `{var`
- `0).length`
- `0){window.__tlog.push({t`
- `0}).length`
- `c.charCodeAt(0).toString(16)).join('_')`
- `r.style.getPropertyValue('--homepage-ticker-duration'))[0]})`
- `setTimeout(r`

The zero-byte `src/lib/experience/workspace.ts` shadow is also `MALFORMED`; it cannot replace the governed tracked memory workspace.

The following orphaned projection-service files are `AUTHORITY_HOLD` because current registration uses the loopback identity controller and no active source importer was found:

- `src/lib/residency/agent-resident-errors.ts`
- `src/lib/residency/agent-resident-service.ts`
- `src/lib/residency/resident-projection-conflict-error.ts`
- `src/lib/residency/resident-projection-missing-error.ts`

## Sensitive Review Hold

No credential value is reproduced in this artifact. The following credential-shaped subset remains outside any runtime package and requires value-free adjudication before source inclusion:

- `public/skill.md`: SpaceBot credential-shaped content.
- `scripts/PW7404-1106-run-exact-autonomy-rehearsal.sh`: database-URL-with-password shape; determine whether the value is synthetic and replace inline authority with a secret-file contract regardless.
- `SPACEBOT_AUDIT_REPORT_20260504.md`: historical root audit evidence requiring quarantine/source-placement review.
- `SPACEBOT_AUDIT_REPORT_20260516.md`: OpenAI-key-shaped and Stripe-test-key-shaped content; treat as sensitive until placeholder/revocation status is proved without exposing values.

`SPACEBOT_AUDIT_REPORT_20260516.md` and the ten affected historical release tarballs are quarantined, not merely review-held. They may not be copied to an evidence archive until sanitized replacements are generated.

## Baseline And Ignored Holds

Dirty status alone is insufficient because base HEAD and ignored local state contain candidate hazards. The summary records path/classification/state only, never values or hashes, for:

- `.machine_keys.json`: unchanged tracked credential container; must be removed from the forward candidate and replaced by a non-secret schema/example only after rotation and the existing history-remediation approval boundary.
- `.env`, `.env.local`, and `.clerk/.tmp/keyless.json`: ignored live/local secrets; never source, archive, Obsidian, or runtime-package inputs.
- `deepresearch-service/.env.example` and `resident-autonomy-controller/.env.example`: ignored templates requiring sanitization and explicit `!.env.example` / `!**/.env.example` policy before source inclusion.
- `.codex/tmp`, `tmp`, `.ruff_cache`, `dorylus/.ruff_cache`, and `scripts/__pycache__`: generated state excluded from source and runtime packages.

Every migration, apply/provision/retire/rehearsal script, live database/HTTP verifier, current controller implementation, service unit, runtime launcher, authority-bearing route, identity/auth/money path, and autonomy-to-publication path is also `SENSITIVE_REVIEW`. Classification alone cannot authorize these files.

## Release-Blocking Coherence Findings

- DeepResearch is not candidate-ready: its import chain is incomplete, endpoints are unauthenticated, exceptions can leak, absolute-file access is unrestricted, and URL visiting lacks a proved SSRF boundary.
- Never restore `config/PW7404-1026-spacebot-production-nginx-20260711.conf`; it is historical evidence and publicly proxies AgentScope. Only a freshly reviewed current candidate may define internal routing.
- `chat-conversation-repository.ts` and `public-cycle-admission.ts` independently create/canonicalize conversations and need one transaction-capable authority.
- The internal LUCY cycle route uses a separate bounded-body reader instead of the shared internal-request-body authority.
- Autonomy-to-publication crosses transactions; control revision, lease, and kill-switch assumptions require runtime/concurrency proof.
- Four tracked executables currently drift from index mode `100755` to worktree mode `100644`: `safe-build.sh`, `grand-finale-restart.sh`, `run-experience-nightly.sh`, and `start-tool-service.sh`.
- `src/app/(spacebot)/planetspace/page.tsx` is status-only with no material diff and is excluded from the delta; base HEAD supplies it.

## Candidate Boundary

The candidate is defined as:

1. The unchanged tree pinned by base HEAD `aa758aa4f63a91e072e2944c733310d9ab8ffdaa`, minus explicit baseline quarantine such as `.machine_keys.json`.
2. Only delta files classified `KEEP_CANDIDATE` or `ARCHIVE_EVIDENCE` after subsystem adjudication.
3. Deterministic proof tooling and manifests, represented outside their own circular hash domain.
4. No `GENERATED_EXCLUDE`, `MALFORMED`, `SENSITIVE_QUARANTINE`, unresolved `SENSITIVE_REVIEW`, symlink, unknown dependency lock, private dump, credential, cache, or runtime secret.
5. A build-derived runtime package created from the reviewed source candidate, not a copy of the dirty working directory.
6. Strict migration/service order: identity prerequisites before credential cutover; legacy LUCY retirement before the canonical timer; autonomy controller provision/verification before identity/session rollout; destructive transitions only after committed rollback proof.

## Gates Before Candidate S1

- [ ] Reconcile agent lane classifications against all machine rows; disagreement becomes `REVIEW_MIXED`, never automatic inclusion.
- [ ] Split implementation candidates by subsystem and reject duplicate/shadow identity, social, profile, cognition, memory, and supervision authorities.
- [ ] Resolve the conversation-creation seam between `chat-conversation-repository.ts` and `public-cycle-admission.ts` under one transaction-capable authority.
- [ ] Adjudicate the four sensitive-review files without printing or copying credential values.
- [ ] Quarantine the 11 dirty sensitive artifacts and the baseline/ignored secret files; generate sanitized replacements rather than copying them.
- [ ] Keep all 19 generated/malformed exclusions out of source and runtime packages.
- [ ] Confirm no symlink, submodule drift, private dependency cache, dump, local database, or unpinned lockfile enters the candidate.
- [ ] Track only sanitized environment templates and add explicit `!.env.example` plus `!**/.env.example` rules without exposing actual environments.
- [ ] Restore or deliberately preserve executable mode for every tracked script; Windows mode drift cannot silently change release behavior.
- [ ] Define migration order, forward/rollback pairing, role provenance, controller/service order, and feature-default state.
- [ ] Produce the candidate in an isolated J-drive worktree or fresh clone; do not normalize the dirty main checkout into release truth.
- [ ] Run clean install, strict types, scoped and full lint triage, contracts, PostgreSQL behavior, HTTP/browser journeys, dependency/secret scan, build, standalone package diff, rollback, restore, and exact rehearsal.
- [ ] Preserve the exact clean-reseed approval boundary: no history rewrite without `APPROVE PW7404-1084 CLEAN RESEED`.

## Current Verdict

The source is now mechanically classifiable and hash-verifiable, which closes the “unknown pile” problem. It does not close reproducibility: candidate S1 requires human/agent subsystem adjudication, sensitive holds, a separate clean worktree, and the full proof chain.

`PW7404-1126` subsequently hardened resident identity IPC in the dirty checkout. `PW7404-1122/1123` were then regenerated for 373 coalesced entries and 521 expanded files with zero unresolved rows and 6,088 passing assertions. The verifier output is the authoritative digest receipt so this in-domain document does not create a circular hash claim; classification identity is not release-candidate approval.

## Exact Next Move

Reconcile the bounded agent inventories into this classification, then create the isolated candidate worktree from the pinned base plus accepted delta. Only after the source boundary is stable should controller IPC, ACL cutover/rollback, and role-accurate proof be implemented inside that candidate.
