# PW7404-1073 SPACEBOT Trust Containment Release

Date: 2026-07-12  
Status: live and production-verified  
Owner: PAULIEWOOD  
Implementation lead: Spud

## Scope

This is the smallest containment release for the two live findings identified by `PW7404-1068`:

- retire four unused, unauthenticated legacy HumHub avatar mutation handlers with side-effect-free no-store `404` responses;
- explicitly deny the public `/api/agentscope` path and subtree in Nginx while preserving direct internal loopback AgentScope calls.
- reconcile the checked-in supervisor contract so AgentScope is private and loopback-only.

The current Clerk/PostgreSQL PeopleSpace avatar builder remains unchanged. TaskSpace PW7404-1063 remains undeployed and is excluded from this manifest.

## Exact Manifest

`scripts/PW7404-1071-spacebot-trust-containment-release-paths-20260712.txt`

The manifest intentionally excludes `package.json`, the TaskSpace candidate, database schema, migrations, environment files, and unrelated dirty work.

The dedicated `PW7404-1071` Nginx artifact is based on the active production site file and changes only the AgentScope location block. It deliberately excludes the not-yet-live PW7404-1063 forwarding-header changes.

## Required Preflight

1. `node scripts/PW7404-1070-verify-avatar-agentscope-containment.mjs`
2. Focused ESLint on the five changed avatar TypeScript files.
3. `npx tsc --noEmit --incremental false`
4. Production build from a copy of exact live PW7404-1058 source with only the manifest app files overlaid.
5. Candidate HTTP proof using `PW7404-1072`; local Next normalization may return only the safe `/api/agentscope/` to `/api/agentscope` redirect.
6. Independent security and release review with no P0/P1 findings inside the 11-path containment manifest at review time.
7. Confirm production `AGENTSCOPE_URL` is unset or direct loopback, never the public `/api/agentscope` path.

## Backup Before Cutover

Create one timestamped root-owned release directory containing:

- exact live versions of the four avatar route files;
- active Nginx site configuration;
- complete current `.next` tree or the preserved previous build directory;
- current build ID;
- SHA-256 receipts for every backup and candidate artifact.

No environment values or credentials belong in this report.

## Cutover Order

1. Copy the candidate Nginx config to a temporary root-owned path.
2. Run `nginx -t` against the candidate configuration.
3. Install the explicit AgentScope deny and reload Nginx.
4. Prove all AgentScope path forms return `404`, not `502`.
5. Copy only the four route files plus shared helper to live source.
6. Atomically replace the live `.next` with the already-built candidate and restart only PM2 `spacebot`.
7. Run the full external HTTPS `PW7404-1072` proof with `PW7404_EXPECT_NGINX_DENY=true` so every AgentScope path must return strict `404`.
8. Compare live source hashes to the manifest subset and confirm the PM2 error log did not advance.

If app cutover fails, retain the successful Nginx containment and roll back only the app source/build.

## Rollback

- App: restore the four route files and prior `.next`, then restart only PM2 `spacebot`.
- Nginx: the public AgentScope deny is a non-rollbackable safety invariant. Restore other site configuration only through a candidate that preserves the exact/subtree deny; any future AgentScope exposure requires a separately authenticated, reviewed release.
- Database: no schema or data change exists in this release.

## Production Receipt

- Live build: `nSROWoBdTkqCFXi-AfqYC`.
- Previous build preserved at `/var/www/spacebot/.next-before-pw7404-1071-r1`: `V8voHdZRRlveJK58bu5a4`.
- Final archive: `/root/spacebot-releases/PW7404-1071-20260712-trust-containment/PW7404-1071-spacebot-trust-containment-r3-final-20260712.tar.gz`.
- Final archive SHA-256: `400F7D4B511105A602ABE25367CFDD1C7A73EFC245407AB7D9AC239BB2A00224`.
- Predeploy backup: `/root/spacebot-releases/PW7404-1071-20260712-trust-containment/predeploy-r1`.
- Previous Nginx SHA-256: `53A1AB84D4751A66265E1077CCF5F6CDBE1E46D44F7AA02162DA61D371520FE7`.
- Previous source subset SHA-256: `B28B1BB2EB5A0924123C76967A126E1239416EFA1E0698800400B8E5073450B3`.
- Active Nginx/candidate config SHA-256: `44B6FE231A1A1E5F0531BD22B96915C52CBFA8B7A8B74C9F46D682FAF0F23D62`.
- Nginx syntax passed before and after reload. Exact, trailing-slash, and subtree AgentScope paths return public `404` rather than redirect, proxy content, or `502`.
- Static containment verification passed `96` checks.
- Isolated Linux production build passed with `42` generated pages and packaged standalone assets.
- Candidate HTTP verification passed `114` checks.
- Live HTTPS verification passed `113` checks with strict Nginx-deny mode.
- Every ordinary method on all four retired avatar mutations returns generic no-store `404`.
- Anonymous canonical human avatar access remains `401`; PeopleSpace avatar builder remains `200`.
- Homepage, public agents, and ticker return `200`; protected test-bot page/API return `404/401`; public internal LUCY returns `403`.
- All `11` live manifest paths match the final candidate source. PM2 `spacebot` is online with zero unstable restarts, external port `3003` is closed, candidate port `3014` is closed, and the error log remained unchanged after final health probes.
- No database schema or data changed.

## Honest Residuals

- The read-only legacy `/api/v1/avatar/gallery` route remains outside this containment release and needs a separate privacy/product review.
- The repository still requires an immutable PW7404-1071 Git checkpoint and broad dependency remediation before TaskSpace or another feature release.
- Next.js 14 and the current dependency graph retain the critical/high findings documented in `PW7404-1068`.
- Post-release source reconciliation found that 18 active machine credentials predate this release and remain committed in Git history. `PW7404-1071` did not introduce or package them, but controlled replacement/revocation is now a separate P0 before feature deployment or baseline approval.
