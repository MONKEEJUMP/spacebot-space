# PW7404-1074 SPACEBOT Released Source Reconciliation

Date: 2026-07-12  
Status: source candidate verified; public credentials contained; Git write not approved  
Project: `J:\BigC_Vault\spacebot-production\spacebot-space`

## Purpose

Separate exact production source from stale Git history, undeployed TaskSpace work, unrelated local drift, backup artifacts, and secrets without changing the current checkout or production.

## Evidence

- Live sanitized capture: `PW7404-1074-spacebot-live-source-sanitized-20260712.tar.gz`.
- Live capture SHA-256: `F20D9BFA457BA5B91FD21A842E22B77F94E6C96B68E582AEC83F5EC0C13EE4AF`.
- Git HEAD: `aa758aa4f63a91e072e2944c733310d9ab8ffdaa`.
- Machine-readable reconciliation: `PW7404-1074-released-source-reconciliation-20260712.json` in the release evidence directory.
- Canonical per-file manifest: `scripts/PW7404-1075-spacebot-released-baseline-20260712.tsv`.
- Backup exclusions: `scripts/PW7404-1075-spacebot-released-baseline-20260712-excluded-backups.txt`.
- HEAD removals: `scripts/PW7404-1075-spacebot-released-baseline-20260712-remove-from-head.txt`.

## Deterministic Result

- Canonical released source: `871` files.
- Backup/historical live-tree artifacts excluded: `25` files.
- HEAD-only files removed from reconstruction: `17` files, including `.machine_keys.json`.
- Reconstructed candidate parity: `871` expected, `871` actual, zero missing, zero extra, zero hash mismatches.
- Clean archive: `PW7404-1074-spacebot-released-baseline-clean-r1-20260712.tar.gz`.
- Clean archive SHA-256: `55AD5BF052A7619040CD3E7DEFC21591B25B7EA5A03C71D7268C0D4B91A623A0`.
- Archive paths exactly match the 871-file manifest.
- Forbidden secret/backup-shaped archive paths: zero.
- High-confidence token, private-key, credentialed-database-URL, and long-bearer literal matches: zero.
- Fresh reconstructed-tree checks: strict TypeScript passed; focused avatar ESLint passed; containment passed `96` checks; the 12-service observe-only supervisor manifest validated.
- Blast-radius scans found no exposed value duplicated outside the canonical production key file and the existing Git object: 3,871 local/release/Obsidian files and 6,944 production files scanned with zero duplicate-value files. A temporary Git-HEAD tar and extracted plaintext copy created during reconciliation were immediately deleted after detection; the clean archive never contained them.

This packet proves source-level reconstruction, not full environment reconstruction. A complete production recreation still needs a commit/tag, pinned Node/npm toolchain, immutable build artifact, protected environment configuration, external-service contracts, and a current database schema/grant fingerprint that records the additive `agent_browser_sessions` migration.

## TaskSpace Isolation

The undeployed `PW7404-1063` manifest contains 25 paths. Relative to production, 14 shared paths differ and 11 paths exist only in the current checkout. None belongs in the released-source checkpoint; the exact TaskSpace archive remains preserved separately at SHA-256 `B1089F8517C097E7E297F631B84E6513FC7ACA415E38BB2FC91F721F665221F8`.

## Credential Incident

Git history tracks `.machine_keys.json` from initial commit `66167dd`. A secret-safe digest comparison proved its 18 values equaled the root-only production file and all 18 lookup hashes were active. No credential value was printed, copied, archived, or written to Obsidian.

Containment release `PW7404-1077/1078` revoked all 18 public machine lookups in one fenced transaction, preserved one separate safe credential per resident, removed exposed mirrors/sessions and the plaintext live-worktree file, and proved 18/18 external `401`. Public Git history cleanup/reseed remains approval-gated.

The read-only mapping is recorded in `PW7404-1076`: 18 unique credentials map one-to-one to 18 distinct named canonical residents, all are active, and zero browser-session rows were ever derived from them. All last-use timestamps form a 4.443-second batch on 2026-07-10, which is strongly consistent with verification activity but does not rule out off-host copies.

## Git Boundary

No branch, worktree, stage, commit, tag, reset, or history rewrite was performed. The current dirty checkout remains the no-data-loss recovery source. Git approval is deferred until the credential P0 is contained and the final source packet receives independent no-P0/P1 review.
