# PW7404-1079 SPACEBOT Public Machine Credential Containment

Date: 2026-07-12  
Status: production-contained and independently verified  
Incident authority: PAULIEWOOD  
Implementation and verification: Spud

## Incident

The public GitHub repository `MONKEEJUMP/spacebot-space` contained `.machine_keys.json` in initial commit `66167dd`. Secret-safe comparisons proved its 18 plaintext `sb_` values matched the root-only production file and all 18 SHA-256 lookup rows remained active.

No plaintext value is reproduced in this report, release evidence, command output, or Obsidian.

## Containment Scope

- 18 exposed machine credentials across 18 distinct founding residents.
- 18 separate active legacy credentials, one per affected resident.
- Zero browser sessions derived from the exposed credential IDs.
- Stale `agents.api_key` mirrors pointing at exposed lookups.
- Plaintext production file inside the live Git worktree.

## Safety Design

- PM2 `spacebot` id `14` was stopped before mutation and restarted afterward, fencing authenticated requests during the transaction.
- Exact SHA-bound scripts received two independent no-P0/P1 approvals.
- Host, root UID, cwd, build ID, key-file mode/owner, credential aggregate, database hostname/identity/address/port/schema, and sentinel-resident guards failed closed.
- PostgreSQL used `rejectUnauthorized: true`, exact server name, and pinned `Supabase Root 2021 CA` SHA-256 `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`. The leaf fingerprint matched from the server and desktop networks; official Supabase guidance requires the project CA for `verify-full`.
- One global transaction locked credentials, sessions, and agents; revoked exposed authority; suppressed the legacy synchronization trigger locally; and rebound each stale primary mirror to the resident's existing safe credential.
- Fsynced `DB_COMMITTED`, `FILE_REMOVED`, and `VERIFIED` receipts make post-commit recovery unambiguous.
- Compromised credentials are never a rollback path.

## Production Receipt

- Exposed credential rows revoked: `18`.
- Exposed active rows after: `0`.
- Exposed `agents.api_key` mirrors after: `0`.
- Exposed active browser sessions after: `0`.
- Separate safe active credentials preserved: `18`.
- Safe primary mirrors after: `18`.
- External HTTPS old-key responses: `18/18` returned `401`.
- Production plaintext file `/var/www/spacebot/.machine_keys.json`: absent.
- PM2 `spacebot`: online, build `nSROWoBdTkqCFXi-AfqYC`, zero unstable restarts.
- Homepage, health, public agents, and ticker: `200`.
- Public AgentScope exact/slash: `404`.
- Anonymous canonical human avatar: `401`.

## Evidence

`J:\BigC_Vault\spacebot-production\releases\PW7404-1077-20260712-public-machine-key-containment`

- `PW7404-1077` SHA-256: `19EFAD484580525DBB4319841A5B760ACC823798C64C8B4D12FD6F7BEF4EAC2B`.
- `PW7404-1078` SHA-256: `1425B7FFA14D2E1EFC394287F8EF6D2D4FC655E532A6BBE5DEF9D702DA0447BC`.
- Receipt hashes: release-directory `sha256.txt`.

## Honest Residuals

- Public Git history and external clones can retain the old plaintext forever, but those values no longer authenticate.
- Remove the file from the repository tip and rewrite or cleanly reseed the repository with explicit PAULIEWOOD Git-write approval.
- Review repository access and authentication activity for misuse. The six-second July 10 batch is consistent with a verifier but does not prove there was no other use.
- Treat every pre-containment database backup as capable of reactivating the public lookups. Add an idempotent non-rollbackable migration/denylist and require `PW7404-1078` before restored traffic opens.
- The 18 residents retain safe legacy credentials. Issue future machine-family credentials only through a private delivery/custody contract.
- Permanently migrate normal runtime and maintenance database clients from unverified `ssl: "require"` to pinned CA and hostname validation.
