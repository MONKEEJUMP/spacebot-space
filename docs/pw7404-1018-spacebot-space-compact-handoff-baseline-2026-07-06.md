# SpaceBot Space Compact Handoff Mirror

Canonical durable memory lives in Obsidian. This repo-local mirror exists so the `spacebot-space` baseline activation is visible from the project itself.

## Canonical Paths

- Obsidian project note: `C:\Users\DJ PAULIEWOOD\Codex_Brain_Vault\Codex Brain\Project Index\j-bigc_vault-spacebot-production-spacebot-space.md`
- Obsidian handoff: `C:\Users\DJ PAULIEWOOD\Codex_Brain_Vault\Codex Brain\Thread Archives\SpaceBot Space\SpaceBot Space - Compact Handoff - PW7404-1018 Baseline Activation - 2026-07-06.md`
- Master procedure: `J:\Cactus\docs\PW7404-1018-codex-compaction-to-compaction-master-procedure-20260706.md`

## Baseline Summary

- Date: `2026-07-06`
- Workflow activated: `PW7404-1018` compaction-to-compaction
- Forward project home: `J:\BigC_Vault\spacebot-production\spacebot-space`
- Current goal: keep `spacebot-space` resumable across compactions, then continue homepage ticker work from the real current codebase.
- Current phase: baseline memory activation complete; deployed-vs-repo ticker truth check is next.

## Critical Finding

The current repo already contains ticker logic that differs from earlier conversational assumptions. The local code now includes client-side source shuffling, hidden-tab refresh suppression, `target="_blank"` links, an icon-style pause toggle, and faster 45s/55s CSS durations.

## Exact Next Move

Before more homepage ticker changes, compare the deployed homepage against:

- `src\components\ticker\NewsTicker.tsx`
- `src\components\ticker\HomepageTickerClient.tsx`
- `src\app\api\v1\ticker\headlines\route.ts`
- `src\app\globals.css`

This determines whether the remaining ticker issues belong to the live deployment, an uncommitted local state, or stale thread context.

## 2026-07-06 Emergency Update

- Production auth/test-bot incident status: stabilized.
- Real server receipts on `159.89.178.205`:
  - `/var/www/spacebot` was inspected directly over SSH
  - count-only DB proof confirmed `agents.api_key` is already fully backfilled to SHA-256 lookup storage: `304,0,0,304`
  - local auth/test-bot hardening was restored, linted, copied to production, built with `./safe-build.sh`, and restarted via `pm2 restart spacebot --update-env`
  - live proof after deploy:
    - `http://localhost:3003/` health check: `200`
    - unauthenticated `/test-bot`: no longer public
    - unauthenticated `POST /api/test-bot`: `401`
    - live agent registration + `/api/v1/agents/me` round-trip succeeded while storing only SHA-256 lookup value in `agents.api_key`
    - `sb_` machine-key auth required one follow-up `machine-auth.ts` correction because the hidden `.machine_keys.json` keys do not bcrypt-verify against `apiKeyHash`; after the correction, `/api/social/home` returned `200`
- Practical outcome:
  - production is now safe to use as the auth/runtime baseline again
  - next work should return to the homepage ticker/user-facing punch list, not re-open the auth storage incident unless a new regression appears

## 2026-07-09 Release Update

- J-drive auth/test-bot source was found regressed even though production remained secure; the hardened production behavior was restored locally and linted.
- The shared 28-source ticker catalog was wired into homepage SSR, the ticker API, and the worker config.
- Production build passed and the live ticker API now returns 14 top and 14 bottom items.
- Browser verification found and repaired a separate standalone deployment failure: generated CSS/public assets were missing from `.next/standalone` after build.
- Both build/restart scripts now bundle `.next/static` and `public`; live generated CSS returns `200` and ticker styling/animation/pause behavior is restored.
- Active priority stack moved to `docs\PW7404-1019-SPACEBOT-SPACE-FRONT-BOARD-20260709.md`.
