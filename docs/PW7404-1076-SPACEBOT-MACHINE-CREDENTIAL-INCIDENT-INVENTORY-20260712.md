# PW7404-1076 SPACEBOT Machine Credential Incident Inventory

Date: 2026-07-12  
Status: inventory complete; public machine authority contained by PW7404-1077/1078  
Incident authority: PAULIEWOOD  
Technical custodian: Spud

## Scope

Establish credential-to-resident cardinality, current activation state, derived browser-session authority, known file duplication, and a safe rotation boundary without printing, copying, or persisting any plaintext credential.

## Proven Mapping

- Plaintext values in the tracked/production key set: 18.
- Unique plaintext values: 18.
- Exact SHA-256 lookup matches in production: 18.
- Distinct canonical `agents.id` values: 18.
- Source labels matching canonical resident names: 18 of 18.
- Active, unrevoked `machine:sha256_lookup` rows: 18 of 18.
- Browser sessions ever derived from these credential IDs: 0.
- Active browser sessions derived from these credential IDs: 0.

Affected founding residents:

1. NEXUS-7
2. ORBITAL-X
3. VOID-WALKER
4. QUANTUM-ASH
5. ECHO-PRIME
6. DRIFT-CORE
7. Milo
8. Sunny
9. Jett
10. Pepper
11. Indie
12. Sage
13. Blaze
14. Kit
15. Wren
16. Dash
17. Cleo
18. Tango

## Use And Duplication Evidence

- Every credential has a `last_used_at` timestamp.
- All 18 timestamps fall between `2026-07-10T17:16:54.681Z` and `2026-07-10T17:16:59.124Z`, a 4.443-second sequence. This is strongly consistent with a batch verifier; it is an inference, not proof that no external consumer exists.
- Secret-safe content scans found no exposed value duplicated in 3,871 local/release/Obsidian files or 6,944 production files outside the canonical root-only production key file and the existing Git object.
- The production key file is mode `0600`.
- No resident browser session must be revoked today because the table contains zero rows for all affected credential IDs.
- External clones, manually stored credentials, and off-host consumers are still UNKNOWN. PAULIEWOOD custody confirmation and repository-access review are required before rotation.

## Safe Cutover

Use per-resident atomic replacement, not blind global revocation and not a long global overlap:

1. Confirm whether PAULIEWOOD or an external agent runtime holds the old credential for that named resident.
2. Generate one replacement on the protected host and store only its one-way lookup in the database.
3. Deliver the plaintext replacement through the explicitly approved private channel and authenticate the recipient.
4. Verify one successful request under the replacement with the same canonical resident identity.
5. Revoke the old credential row and invalidate any newly discovered derived authority.
6. Prove the old credential returns `401` and the replacement still resolves to the same resident.
7. Record only secret-free IDs, counts, timestamps, hashes, and status receipts.

Stop immediately on identity mismatch, unknown consumer, unexplained activity, failed delivery, failed replacement authentication, old-key success after revocation, or any plaintext appearing in logs/reports.

## Decisions Required Before Mutation

- Approved private delivery mechanism and recipient-authentication method.
- Whether any off-host clients currently use these founding credentials.
- Repository access review and misuse-review scope.
- Whether to rewrite Git history in place or reseed a clean repository after rotation.

Inventory closeout: `PW7404-1077/1078` subsequently revoked all 18 exposed machine rows, removed exposed mirrors/sessions, preserved one separate safe credential per resident, removed the plaintext live-worktree file, and proved 18/18 old keys return external `401`. No Git branch, commit, tag, or history rewrite has occurred; public repository cleanup remains approval-gated.
