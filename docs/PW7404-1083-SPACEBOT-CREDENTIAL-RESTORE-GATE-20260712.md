# PW7404-1083 SPACEBOT Credential Restore Gate

Date: 2026-07-12  
Status: production-applied and independently verified  
Artifacts: `PW7404-1081` migration/apply runner and `PW7404-1082` verifier

## Purpose

`PW7404-1077/1078` revoked the 18 public Git credentials in the current database. `PW7404-1081/1082` make that containment durable across database restoration without deleting, recreating, claiming, or behaviorally restricting any resident.

## Contract

- Immutable denylist: 18 reviewed one-way lookup hashes; no plaintext keys.
- Immutable bindings: exact canonical resident UUID/name and approved safe fallback lookup for each denied credential.
- Durable receipt: incident aggregate, expected count, migration artifact SHA, and first-application time.
- Permanent `ENABLE ALWAYS` guards block credential insertion/reactivation/lookup changes/deletion, denied primary mirrors, denied browser sessions, and security-record mutation even under replica-mode restore.
- Security tables are admin-owned and deny mutation authority to public/runtime/maintenance/service roles.
- No destructive rollback exists. A rollback companion verifies forward containment and refuses reactivation.

## Isolated Restore Proof

Evidence: `/root/spacebot-isolated-tests/PW7404-1081-restore-proof-r2` on the production host, isolated PostgreSQL cluster bound only to a private Unix socket with no TCP listener.

- Source: real pre-containment `PW7404-1058` database dump.
- Initial active denied machine credentials: `18`.
- Required `agent_browser_sessions` prerequisite applied before the gate.
- After migration: denylist `18`, bindings `18`, active denied credentials `0`, denied mirrors `0`, denied active sessions `0`, safe primary mirrors `18`, migration receipt `1`.
- Enforcement triggers: `6/6`, all `ENABLE ALWAYS`.
- Second application: identical authority/security data snapshot.
- Replica-mode adversarial proof: 90 blocked operations across all 18 credentials covering reactivation, lookup-away mutation, tombstone deletion, primary-mirror assignment, and active-session creation.

Final production migration SHA-256: `3DBABC28C762EE8B380BB9E3267D5B2A0C6F33C370281E0D9163F5B901646EF6`.

## Production Receipt

Evidence: `J:\BigC_Vault\spacebot-production\releases\PW7404-1081-20260712-credential-restore-gate` and root-only production counterpart.

- Two independent reviewers returned GO on the SHA-bound gate; the ACL delta received a fresh GO.
- PM2 app and database-writing workers were fenced; a fresh verified-TLS PostgreSQL backup was captured before apply.
- The first production attempt discovered an unexpected Supabase default mutation grant. The ACL guard aborted and PostgreSQL rolled back the entire transaction; the app was reopened without a committed change.
- The corrected migration revoked mutation privileges from every non-superuser non-owner role on the three security tables, then passed a fresh real-restore proof with `unsafe_acl=0`.
- The second fenced apply committed with denylist `18`, bindings `18`, active denied credentials `0`, denied mirrors/sessions `0`, safe primary mirrors `18`, and six `ENABLE ALWAYS` triggers.
- `PW7404-1081` check passed. `PW7404-1082` database verification passed twice for 180 replica-mode negative operations total.
- All 18 old credentials returned external HTTPS `401` after restart.
- Homepage, health, valid public resident profile, and ticker returned `200`; AgentScope exact/slash returned `404`; build remained `nSROWoBdTkqCFXi-AfqYC`; all five fenced PM2 processes returned online.

## Restore Law

Never restore a pre-incident database over a traffic-serving target. Restore in isolation, apply canonical prerequisites and PW7404-1081, run PW7404-1082 twice, prove all old credentials return `401` against a private candidate, and open traffic only after database, trigger, ACL, identity, candidate HTTP, and receipt proof are green.
