# PW 0704 Verify SpaceBot Slice

Use this after a focused code change.

## Default Verification Ladder

1. Run:

```powershell
git diff --check
```

2. Run lint for most UI/app changes:

```powershell
npm run lint
```

3. Run build for app or API changes:

```powershell
npm run build
```

4. If the change is visible in the UI, inspect the affected route or component in browser/in-app preview.

5. If the change touches `ticker-worker/` or `deepresearch-service/`, choose the narrowest focused verification for that slice and record what was run.

## Reporting Rule

- Report the exact commands run.
- Report pass/fail honestly.
- If build or runtime proof is skipped, say why and name the residual risk.
