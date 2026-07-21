# PW7404-1020 SPACEBOT.SPACE Release Integrity Manifest

Date: 2026-07-09
Status: active verification contract
Project: `J:\BigC_Vault\spacebot-production\spacebot-space`
Verifier: `scripts\PW7404-1020-verify-spacebot-release-integrity.ps1`

## Purpose

Protect the verified authentication, ticker, and standalone-deployment release baseline from silent source resets or incomplete Git-only checkouts.

## Destructive Sync Incident

Windows Task Scheduler ran `J:\BigC_Vault\.sync\vault-auto-sync.bat` every 30 minutes. The old batch unconditionally executed `git reset --hard origin/main`, which erased tracked local work at `:15` and `:45` while leaving untracked helper files behind.

The batch was repaired on 2026-07-09:

- original backup: `J:\BigC_Vault\.sync\vault-auto-sync.bat.bak.20260709-2328-spud`
- fetch remains enabled;
- any tracked, staged, or untracked local work causes a safe skip;
- only a completely clean checkout may fast-forward to `origin/main`;
- divergence and fetch failures are logged and never repaired destructively.

Manual proof returned exit `0`, preserved `HEAD`, preserved all critical hashes, added no reset reflog entry, and logged `skipped: local work present`.

## Release Paths

### Authentication And Public Surface

- `src\lib\security\api-keys.ts`
- `src\lib\auth.ts`
- `src\lib\machine-auth.ts`
- `src\app\api\v1\agents\register\route.ts`
- `src\app\api\test-bot\route.ts`
- `src\middleware.ts`

### Ticker Contract

- `src\components\ticker\HomepageTickerBar.tsx`
- `src\app\api\v1\ticker\headlines\route.ts`
- `src\lib\ticker\homepage-contract.ts`
- `src\lib\ticker\homepage-editorial.ts`
- `src\lib\ticker\homepage-selection.ts`
- `src\lib\ticker\source-catalog.js`
- `ticker-worker\config.js`

### Deployment And Durable Direction

- `safe-build.sh`
- `scripts\grand-finale-restart.sh`
- `docs\PW7404-1019-SPACEBOT-SPACE-FRONT-BOARD-20260709.md`
- `J:\BigC_Vault\.sync\vault-auto-sync.bat`

## Verification Command

```powershell
& 'J:\BigC_Vault\spacebot-production\spacebot-space\scripts\PW7404-1020-verify-spacebot-release-integrity.ps1'
```

The verifier fails closed when a required file or marker disappears, an insecure/stale marker returns, the ticker catalog is not 28 sources across five tiers, the destructive reset command returns, or `git diff --check` fails for the release path set.

## Git Checkpoint Boundary

No Git write was performed. A future checkpoint must follow `PW7404-1005`:

1. Read-only status, HEAD, origin, remote, and diff capture.
2. Explicit path staging only; never `git add .` or `git add -A`.
3. Cached diff and verification rerun.
4. PAULIEWOOD approval before commit, tag, or push.
