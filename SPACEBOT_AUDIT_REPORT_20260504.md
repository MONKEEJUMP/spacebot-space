# SPACEBOT.SPACE Full Audit Report - 2026-05-04

Audit target: `J:\BigC_Vault\spacebot-production\spacebot-space\`

Live targets:
- `https://spacebot.space/`
- `http://159.89.178.205:3003`

Scope constraints honored:
- Read `FORTRESS_AUDIT_REPORT.md` first and built on it instead of redoing the same Fortress-only audit.
- Audited the active source tree under `src/`, active Drizzle config `drizzle.config.ts`, active PM2 config `ecosystem.config.js`, and the proprietary `dorylus/` LUCY Engine as first-party code.
- Did not audit `J:\BigC_Vault\spacebot-production\spacebot-munia\`.
- Did not analyze the contents of root garbage-name files, `*.bak` files, or `src-spacebot-backup-*` folders. I flagged them only as cleanup candidates.
- No code, package, config, env, database, or live-server changes were made. The only file written in this pass is this report.

Line references are repo-relative unless a full URL is shown. Live observations are from unauthenticated, non-mutating HTTP GET/OPTIONS-style checks run on 2026-05-04.

## Executive Summary

SpaceBot.Space is live and serving a rich Next.js 14 application with Drizzle ORM, Clerk, Supabase PostgreSQL, Qwen/DashScope integrations, and the first-party `dorylus/` LUCY Engine. The codebase is active, ambitious, and much more than a simple marketing site: it contains agent profiles, social/feed systems, human profiles, AI/news surfaces, terminal UI, a life scheduler, and several internal AI services.

The biggest risks are not the visual design. They are operational and security sharp edges:

- A public test route contains a hard-coded DashScope API key and exposes unauthenticated provider calls.
- The raw Next.js app port `http://159.89.178.205:3003` is publicly reachable over HTTP and bypasses the nginx security header layer.
- The production health endpoint is stale/static and currently reports an April 23 timestamp on May 4.
- Source and live behavior have real drift: `/api/metrics` exists in source but is 404 live, `/api/v1/ticker/headlines` has a different response contract live than in source, and `/about` behaves differently through the domain versus the direct app port.
- Several not-found routes return HTTP 200 instead of 404.
- Social graph endpoints are still publicly enumerable server-to-server.
- Key storage still includes plaintext API keys even though hashes now exist.
- The frontend is visually rich but heavy: `/botspace` served about 755 KB of HTML in earlier probing, and the shared avatar component injects keyframe CSS into every instance, leaking CSS into accessible scraped text and bloating pages.

The Fortress audit findings are partially improved: social CORS no longer behaves as the broad wildcard issue described in the prior report, machine auth no longer uses bot name as the key, and audit logging now persists to filesystem. But the replacements introduced new or remaining concerns: plaintext API key lookup, machine-key prefix mismatch, incomplete rate limiting on followers/following, and direct-port bypass of proxy protections.

## Verification Limits

- I did not run `next build`, `next lint`, `tsc`, or app tests because `node_modules` is not present locally and installing dependencies was explicitly out of scope.
- I attempted a read-only `npm audit --json --omit=dev`; it timed out after 124 seconds, so dependency advisory counts are not included.
- I did not run browser automation because Playwright was not available in the local Node environment and installing it was out of scope. The `/aispace` TypeError check is therefore server-render/HTML-level, not browser-console-level.
- I did not mutate authenticated endpoints, trigger live scheduler actions, POST to model APIs, or write to the live server.

## Coverage Snapshot

- Active API route files found: 104 under `src/app/api/**/route.ts`.
- Source files found under `src/`: 529 TypeScript/TSX/JS/CSS/JSON/MD-style files.
- `dorylus/` files found: 12.
- Files in active scan set excluding `.git`, `node_modules`, backups, and explicit backup folders: 741.
- Prior security report read: `FORTRESS_AUDIT_REPORT.md`.
- Live pages/routes sampled: `/`, `/aispace`, `/botspace`, `/live`, `/peoplespace`, `/feedspace`, `/themes`, `/sanctuary`, `/avatar-render`, `/terminal`, `/lab`, `/pricing`, `/about`, `/api/health`, `/api/metrics`, `/api/v1/public/agents`, `/api/v1/posts`, `/api/social/feed`, `/api/social/follow/*`, `/api/v1/humans/theme`, `/api/test-bot`, `/api/v1/ticker/headlines`, and invalid detail routes.

## Known Issues Status

### `/api/v1/humans/theme` bug

Status: partially verified, likely still has client-side behavior problems.

Observed live:
- `https://spacebot.space/api/v1/humans/theme` returns 405 for GET.

Source evidence:
- `src/app/api/v1/humans/theme/route.ts:27` exposes only `PATCH`.
- `src/providers/SiteThemeProvider.tsx:42` calls `/api/v1/humans/theme`.
- `src/providers/SiteThemeProvider.tsx:43` uses `PATCH`.
- `src/providers/SiteThemeProvider.tsx:45` sends credentials.
- `src/providers/SiteThemeProvider.tsx:98` defines `setTheme`.
- `src/providers/HumanAuthProvider.tsx:300` applies a server theme after auth load.
- `src/providers/HumanAuthProvider.tsx:303` calls `setSiteTheme(serverTheme as SiteThemeId)`.

Observation: the route itself is method-limited as expected, but the client calls the authenticated PATCH in a fire-and-forget path. Guests or stale auth state can cause silent 401s/noisy console failures. The auth provider can also echo a loaded server theme back into the same setter, which risks redundant PATCHes.

Recommendation: separate local theme selection from authenticated persistence, validate theme IDs server-side, and make auth-loaded server theme application non-persistent.

### `/aispace` TypeError

Status: not reproduced in server-rendered HTML.

Observed live:
- `https://spacebot.space/aispace` returned 200.
- `http://159.89.178.205:3003/aispace` returned 200.
- HTML did not contain `TypeError` or `Application error`.

Source evidence:
- `src/app/(spacebot)/aispace/page.tsx:3` imports static ticker components.
- `src/app/(spacebot)/aispace/page.tsx:108` closes the server-rendered page component.

Observation: the route server-renders successfully now. Browser hydration/runtime verification was not possible without installing browser tooling, which was out of scope.

Recommendation: run a browser-console check in production or CI for `/aispace`, especially around ticker response shape because `/api/v1/ticker/headlines` is drifting between source and live.

### Approximately 110 dirty files on server

Status: not reproduced in the audited local production folder.

Observed local git state:
- `safe-build.sh` modified.
- `scripts/grand-finale-restart.sh` modified.
- `scripts/start-tool-service.sh` modified.
- The diff for those three files is mode-only: executable bit changed from `100755` to `100644`.
- Untracked files/directories include root garbage filenames, screenshot PNGs, `deepresearch-service/`, `research/`, `src/lib/agentscope/`, `src/lib/deepresearch/`, `src/lib/experience/`, and `src/lib/memory/`.

Evidence:
- `safe-build.sh:1` file metadata changed only.
- `scripts/grand-finale-restart.sh:1` file metadata changed only.
- `scripts/start-tool-service.sh:1` file metadata changed only.

Observation: the local repo is dirty, but not at the reported scale of about 110 modified files. If the "110 dirty files" report came from the DigitalOcean host, that host state may differ from this local folder.

Recommendation: on the server, run read-only `git status --short` and compare with this local state before deploy. Restore executable bits intentionally if these scripts are expected to be executable.

## Critical Findings

### C1. Public test route contains a hard-coded DashScope secret and exposes unauthenticated model calls

Observation: `/api/test-bot` is public in middleware, accepts POST, contains a hard-coded DashScope API key, and returns provider/debug details to the client.

Evidence:
- `src/middleware.ts:35` marks `/api/test-bot(.*)` public.
- `src/app/api/test-bot/route.ts:8` defines a hard-coded `sk-...` DashScope key.
- `src/app/api/test-bot/route.ts:13` exports public `POST`.
- `src/app/api/test-bot/route.ts:33` sends `Authorization: Bearer ${DASHSCOPE_KEY}`.
- `src/app/api/test-bot/route.ts:59` returns provider debug text.
- `src/app/api/test-bot/route.ts:106` returns error debug text.
- Live GET to `https://spacebot.space/api/test-bot` returned 405, confirming the route exists but only accepts non-GET methods.

Impact: leaked model key, unauthorized cost burn, abuse vector, and internal provider error disclosure.

Recommendation: rotate the exposed key, remove the hard-coded value from git history, delete or protect the test route, add auth/rate limiting if it must remain, and stop returning provider debug text to clients.

### C2. Direct production app port is public and bypasses nginx/TLS/security headers

Observation: the Next.js app is reachable directly at `http://159.89.178.205:3003`, not only through `https://spacebot.space/`.

Evidence:
- Live `http://159.89.178.205:3003/` returned 200.
- `ecosystem.config.js:5` runs `node_modules/next/dist/bin/next`.
- `ecosystem.config.js:6` starts Next with `start -p 3003`.
- `src/lib/security/rate-limiter.ts:381` reads `x-forwarded-for`.
- `src/lib/security/rate-limiter.ts:390` reads `X-Machine-Key`.
- `src/middleware.ts:49` also reads `x-forwarded-for` for `/api/life` IP allowlisting.

Security header comparison:
- Domain had HSTS, frame, content-type, referrer, and permissions headers.
- Direct IP had no HSTS, no `X-Frame-Options`, no `X-Content-Type-Options`, no referrer policy, no permissions policy, and still exposed `X-Powered-By: Next.js`.

Impact: clients can bypass nginx-only controls, send spoofed forwarding headers directly to the Node app, avoid TLS, and hit APIs without the same proxy security posture.

Recommendation: bind Next to localhost or firewall port 3003 to nginx only. Also make app-layer IP handling trust proxy headers only when the request actually comes from the trusted proxy.

### C3. Sensitive/local artifacts are tracked or present despite ignore rules

Observation: files that should not be committed are tracked or present in the repo.

Evidence:
- `.machine_keys.json:1` is tracked by git; contents intentionally not reproduced.
- `db_backup_before_social_20260330_025409.sql:1` is tracked by git; contents intentionally not analyzed in this pass.
- `tsconfig.tsbuildinfo:1` is tracked by git.
- `scripts/__pycache__/qwen-tool-service.cpython-312.pyc:1` is tracked by git.
- `.gitignore:18` ignores `*.tsbuildinfo`.
- `.gitignore:21` ignores `.env`.
- `.gitignore:22` ignores `.env.local`.
- `.gitignore:62` ignores `*.bak`.
- `.gitignore:63` ignores `*.bak.*`.
- `.gitignore:72` ignores `.machine_keys.json`.

Impact: secrets, machine keys, database snapshots, build cache, and generated bytecode increase breach blast radius and repository noise.

Recommendation: remove sensitive/generated artifacts from git in a controlled cleanup, rotate any keys that may have been exposed, and verify the database backup does not contain user or credential data before retaining it anywhere.

### C4. API keys are still stored and looked up in plaintext even though hashes exist

Observation: agent API keys are generated with hashes, but the plaintext key remains stored and queried directly.

Evidence:
- `src/db/schema.ts:23` defines `agents.apiKey` as unique and not null.
- `src/db/schema.ts:24` defines `agents.apiKeyHash`.
- `src/app/api/v1/agents/register/route.ts:71` generates `{ key: apiKey, hash: apiKeyHash }`.
- `src/app/api/v1/agents/register/route.ts:80` stores the plaintext `apiKey`.
- `src/app/api/v1/agents/register/route.ts:81` stores `apiKeyHash`.
- `src/lib/auth.ts:34` looks up an agent by plaintext `agents.apiKey`.
- `src/lib/auth.ts:42` then verifies the hash.
- `src/lib/machine-auth.ts:24` looks up `agents.apiKey` directly.

Impact: a database leak exposes live API keys. The hash only adds defense after the plaintext has already been found.

Recommendation: store only a key identifier plus hash, look up by non-secret prefix/id, and verify with bcrypt/argon2. Migrate plaintext keys out of the database after issuing replacements.

### C5. Machine auth prefix is inconsistent with generated API keys

Observation: generated API keys use `botspace_`, but machine auth accepts only keys starting with `sb_`.

Evidence:
- `src/lib/security/api-keys.ts:12` sets `API_KEY_PREFIX = 'botspace_'`.
- `src/lib/security/api-keys.ts:17` documents `botspace_ + 32 random characters`.
- `src/lib/machine-auth.ts:11` says `X-Machine-Key` matches `agents.api_key (sb_ platform keys ONLY)`.
- `src/lib/machine-auth.ts:22` checks `machineKey.startsWith('sb_')`.
- `src/lib/machine-auth.ts:24` queries `agents.apiKey` with that `sb_` key.

Impact: first-party/machine clients may fail auth unless there is a second undocumented key class. If both key classes exist, the security model is ambiguous.

Recommendation: document and enforce one machine-key scheme, or explicitly separate human API keys from internal machine keys with different storage, rotation, and scopes.

## High Findings

### H1. Production health endpoint is stale/static

Observation: `/api/health` returns a fixed build-time-looking timestamp and uptime instead of current process health.

Evidence:
- Live `https://spacebot.space/api/health` returned `timestamp: 2026-04-23T03:10:11.372Z` on 2026-05-04.
- Live body reported `uptime: 7.130647434`, also stale.
- `src/app/api/health/route.ts:3` exports `GET`.
- `src/app/api/health/route.ts:7` uses `new Date().toISOString()`.
- `src/app/api/health/route.ts:8` uses `process.uptime()`.
- `src/app/api/health/route.ts:17` returns JSON without explicit dynamic/no-store controls.

Impact: monitoring can report false health, false uptime, and stale memory data. This undermines deploy and incident response.

Recommendation: force the route dynamic, add no-store headers, and verify live response changes on every request.

### H2. Source/live drift: `/api/metrics` exists in source but is 404 live

Observation: the source contains a metrics route, but production returns 404 on both domain and direct port.

Evidence:
- Live `https://spacebot.space/api/metrics` returned 404.
- Live `http://159.89.178.205:3003/api/metrics` returned 404.
- `src/app/api/metrics/route.ts:8` exports `GET`.
- `src/app/api/metrics/route.ts:11` reads `METRICS_KEY`.
- `src/app/api/metrics/route.ts:42` returns metrics JSON.

Impact: the deployed build may not match the local source. Monitoring assumptions based on source are wrong.

Recommendation: reconcile deployed artifact with git HEAD/local source before further releases. If metrics should exist, deploy it intentionally and require a key. If not, remove the source route.

### H3. Metrics route would be open if deployed without `METRICS_KEY`

Observation: the source metrics route says and implements that the endpoint is open when `METRICS_KEY` is unset.

Evidence:
- `src/app/api/metrics/route.ts:5` says it is protected by optional `x-metrics-key`.
- `src/app/api/metrics/route.ts:6` says if `METRICS_KEY` is not set, the endpoint is open.
- `src/app/api/metrics/route.ts:11` reads `expectedKey`.
- `src/app/api/metrics/route.ts:14` returns 401 only when `expectedKey` exists and does not match.
- `src/app/api/metrics/route.ts:21` through `src/app/api/metrics/route.ts:42` returns process, memory, CPU, platform, PID, and Node data.

Impact: if this route appears in production without the env var, it leaks operational details.

Recommendation: fail closed. Require `METRICS_KEY` in production and return 404/401 when absent.

### H4. Source/live drift: ticker headlines response contract differs

Observation: the live ticker endpoint returns an object with `topTickerItems`, while source returns a plain array.

Evidence:
- Live `https://spacebot.space/api/v1/ticker/headlines?limit=2` began with `{"topTickerItems":[...`.
- `src/app/api/v1/ticker/headlines/route.ts:26` exports `GET()`.
- `src/app/api/v1/ticker/headlines/route.ts:31` returns `NextResponse.json(cachedHeadlines)`.
- `src/app/api/v1/ticker/headlines/route.ts:48` returns `NextResponse.json(headlines)`.
- `src/app/api/v1/ticker/headlines/route.ts:58` returns `NextResponse.json([], { status: 500 })`.

Impact: frontend code, clients, and tests cannot rely on source as the production contract. This is a likely area for `/aispace` hydration/runtime bugs.

Recommendation: decide the contract (`TickerHeadline[]` versus `{ topTickerItems: [...] }`), update source and clients, then deploy and test both domain and direct app port.

### H5. Source/live drift: `/about` is rewritten on domain but 404 on direct app port

Observation: `/about` is not a source route but the domain redirects it to `/sanctuary`; the direct app port returns 404.

Evidence:
- Live `https://spacebot.space/about` follows to `https://spacebot.space/sanctuary` and returns title `The Sanctuary | SpaceBot.Space`.
- Live `http://159.89.178.205:3003/about` returns 404.
- `src/app/(spacebot)/terminal/page.tsx:96` advertises `about -> /about`.
- `src/app/(spacebot)/terminal/page.tsx:111` advertises `about -> /about`.
- `src/app/(spacebot)/terminal/page.tsx:291` routes the terminal `about` command to `/about`.
- `src/components/homepage/Footer.tsx:31` links About to `/sanctuary`, not `/about`.

Impact: users and bots see different behavior depending on entry path. The terminal UI advertises a route that only works through proxy rewrite, not the app itself.

Recommendation: either create a real `/about` route in Next or update all UI/terminal routes to `/sanctuary`.

### H6. Social followers/following endpoints remain publicly enumerable server-to-server

Observation: CORS now blocks disallowed browser origins for the social endpoints, but no-auth server-to-server requests still enumerate social graph data.

Evidence:
- Live `https://spacebot.space/api/social/follow/nexus-7/following?limit=1` returned 200 with no `Origin` header.
- Live same route with `Origin: https://evil.example` returned 403.
- `src/app/api/social/follow/[name]/following/route.ts:9` exports public `GET`.
- `src/app/api/social/follow/[name]/following/route.ts:13` validates CORS.
- `src/app/api/social/follow/[name]/following/route.ts:48` returns JSON.
- `src/app/api/social/follow/[name]/followers/route.ts:9` exports public `GET`.
- `src/app/api/social/follow/[name]/followers/route.ts:13` validates CORS.
- `src/app/api/social/follow/[name]/followers/route.ts:48` returns JSON.
- `src/lib/security/cors.ts:173` allows requests with no `Origin`.

Impact: crawlers, scripts, and competitors can scrape relationship graphs. CORS is not an access-control boundary for server clients.

Recommendation: add rate limiting and privacy controls. If public graph access is intended, cap pagination, return minimal data, and monitor abuse.

### H7. Rate limiter falls back to memory when Redis env is missing

Observation: comments say production should fail closed if Redis is unavailable, but if Redis env is missing, the limiter falls back to in-memory storage.

Evidence:
- `src/lib/security/rate-limiter.ts:147` comments that production should fail closed if Redis is unavailable.
- `src/lib/security/rate-limiter.ts:162` reads `UPSTASH_REDIS_URL`.
- `src/lib/security/rate-limiter.ts:163` reads `UPSTASH_REDIS_TOKEN`.
- `src/lib/security/rate-limiter.ts:166` warns that Redis is not configured and uses in-memory store.
- `src/lib/security/rate-limiter.ts:227` blocks in production only when `redisConnectionFailed` is true.
- `src/lib/security/rate-limiter.ts:271` uses `memoryStore`.

Impact: if env vars are absent or misconfigured before a connection attempt, production can run with per-process memory rate limits. That is weak under restarts, PM2 clustering, direct-port access, and distributed traffic.

Recommendation: in production, fail closed when Redis config is missing for routes that require rate limiting, or explicitly mark routes that may use memory fallback.

### H8. Not-found detail pages return HTTP 200

Observation: invalid detail URLs return successful HTTP status codes.

Live evidence:
- `https://spacebot.space/agents/not-a-real-agent-zz` returned 200.
- `https://spacebot.space/content/not-a-real-id` returned 200.
- `https://spacebot.space/botspace/not-a-real-bot-zz` returned 200.

Source evidence:
- `src/app/(spacebot)/agents/[name]/page.tsx:264` calls `notFound()` when no agent exists.
- `src/app/(spacebot)/content/[id]/page.tsx:184` calls `notFound()` when no content exists.
- `src/app/(spacebot)/botspace/[name]/page.tsx:38` defines a custom `BotNotFound`.
- `src/app/(spacebot)/botspace/[name]/page.tsx:104` returns `<BotNotFound />` instead of `notFound()`.

Impact: bad URLs look successful to crawlers, monitoring, link checkers, and caches. This hurts SEO and makes real routing bugs harder to detect.

Recommendation: ensure real 404 status for missing resources. For custom not-found UI, use Next's `notFound()` path or a route-level response that preserves status.

### H9. Database SSL certificate verification is disabled in production

Observation: PostgreSQL connection config disables certificate verification in production.

Evidence:
- `src/db/index.ts:7` reads `SPACEBOT_DATABASE_URL || DATABASE_URL`.
- `src/db/index.ts:10` creates the postgres client.
- `src/db/index.ts:14` sets `ssl: { rejectUnauthorized: false }` when `NODE_ENV === 'production'`.

Impact: the database connection is encrypted but does not verify the server certificate, reducing protection against man-in-the-middle risk.

Recommendation: use a verified CA bundle or provider-supported SSL config that keeps certificate validation enabled.

### H10. Supabase service-role client lacks a server-only guard

Observation: the Supabase admin client uses the service-role key and is exported from a general module without `server-only`.

Evidence:
- `src/lib/supabase.ts:1` imports `createClient`.
- `src/lib/supabase.ts:4` reads `SUPABASE_SERVICE_ROLE_KEY`.
- `src/lib/supabase.ts:6` exports `supabaseAdmin`.
- `dorylus/tracker.ts:7` imports `supabaseAdmin`.
- `dorylus/personality.ts:5` imports `supabaseAdmin`.
- `dorylus/api-router.ts:14` imports `supabaseAdmin`.

Impact: current imports appear server-side, but one accidental client import could risk bundling or build-time leakage attempts.

Recommendation: add a server-only boundary to the module and keep service-role access isolated to server routes/services.

## Medium Findings

### M1. Avatar component injects keyframes per instance and leaks CSS into scraped/accessible text

Observation: `AvatarGenerator` injects a `<style>` tag for keyframes inside every component instance. On the live homepage text scrape, Founding Six link text began with avatar keyframe CSS, indicating CSS leakage into accessible/scraped text and page bloat.

Evidence:
- `src/components/avatar/AvatarGenerator.tsx:34` comments that CSS keyframes are injected via style tag.
- `src/components/avatar/AvatarGenerator.tsx:37` defines `KEYFRAMES`.
- `src/components/avatar/AvatarGenerator.tsx:38` starts `@keyframes avatar-drift`.
- `src/components/avatar/AvatarGenerator.tsx:241` renders `<style>{KEYFRAMES}</style>`.
- `src/components/homepage/AgentStrip.tsx:157` renders `AvatarGenerator` inside agent cards.
- `src/components/botspace/BotSpaceClient.tsx:279` renders `AvatarGenerator` in BotSpace.

Impact: repeated style tags inflate large pages, confuse scrapers/screen readers/search snippets, and increase hydration work.

Recommendation: move keyframes to a global CSS/module once, and keep avatar instances markup-only.

### M2. Large HTML payloads on key pages

Observation: rich pages are shipping very large server-rendered HTML.

Live evidence:
- `/botspace` returned about 755 KB HTML in earlier sampling.
- `/live` returned about 626 KB HTML in earlier sampling.
- `/` returned about 101 KB HTML.
- `/sanctuary` returned about 130 KB HTML.

Source evidence:
- `src/components/avatar/AvatarGenerator.tsx:241` duplicates style tags per avatar instance.
- `src/components/botspace/BotSpaceClient.tsx:279` uses avatars in repeated lists.
- `src/app/(spacebot)/sanctuary/page.tsx:391` and nearby repeated avatar render sites show many avatar instances on one page.

Impact: slower TTFB, slower hydration, more bandwidth, and worse mobile performance.

Recommendation: reduce repeated SSR markup, move repeated animations/styles to global CSS, paginate/heavily virtualize repeated cards, and ship skeletons/client fetches where SEO does not need full markup.

### M3. Next standalone build config conflicts with PM2 start command

Observation: Next is configured for standalone output, but PM2 still runs `next start`.

Evidence:
- `next.config.js:3` comments that standalone build output is enabled.
- `next.config.js:6` says startup changes from `next start` to `node .next/standalone/server.js`.
- `next.config.js:8` sets `output: 'standalone'`.
- `ecosystem.config.js:5` runs `node_modules/next/dist/bin/next`.
- `ecosystem.config.js:6` passes `start -p 3003`.

Impact: deployment behavior does not match the build config, reducing the value of standalone output and increasing dependency on full repo/node_modules presence in production.

Recommendation: either switch PM2 to the standalone server after verifying env/static paths, or remove standalone output and simplify deploy expectations.

### M4. ESLint is disabled during builds

Observation: production builds do not enforce lint checks.

Evidence:
- `next.config.js:17` sets `eslint: { ignoreDuringBuilds: true }`.

Impact: regressions in hooks, accessibility, imports, and common React/Next footguns can ship.

Recommendation: keep production build fast if needed, but enforce lint in CI or a predeploy check.

### M5. Dependency stack is aging across core packages

Observation: several foundational packages are materially behind current registry versions as of 2026-05-04.

Evidence:
- `package.json:17` uses `@clerk/nextjs` `^6.39.1`; registry latest observed `7.3.0`.
- `package.json:32` uses `@supabase/supabase-js` `^2.99.1`; latest `2.105.1`.
- `package.json:33` uses beta `@tanstack/react-query` `^5.0.0-beta.16`; latest `5.100.9`.
- `package.json:46` uses `drizzle-orm` `^0.34.1`; latest `0.45.2`.
- `package.json:47` uses `eslint` `^8.38.0`; latest `10.3.0`.
- `package.json:53` uses `next` `^14.2.5`; latest `16.2.4`.
- `package.json:54` uses `nodemailer` `^6.9.3`; latest `8.0.7`.
- `package.json:67` uses `stripe` `^20.4.1`; latest `22.1.0`.
- `package.json:72` uses `typescript` `5.0.4`; latest `6.0.3`.

Impact: higher security and compatibility risk, especially around Next/Clerk/React/TypeScript transitions.

Recommendation: plan upgrades in lanes: security patches first, then Clerk/Next compatibility, then React Query beta replacement, then TypeScript/ESLint major modernization.

### M6. Duplicate viewport tags and disabled mobile zoom

Observation: the layout manually adds a viewport tag with zoom disabled, while Next also emits its own viewport metadata.

Evidence:
- `src/app/layout.tsx:47` sets `maximum-scale=1, user-scalable=0`.
- Live HTML also emitted a separate default viewport tag.

Impact: duplicate viewport metadata is messy, and disabled pinch zoom is an accessibility issue.

Recommendation: use Next's `viewport` export and allow user zoom.

### M7. Root layout uses CDN Font Awesome and inline script/style, complicating CSP

Observation: the root layout uses an external CDN stylesheet plus inline script/style blocks.

Evidence:
- `src/app/layout.tsx:54` loads Font Awesome from `cdnjs.cloudflare.com`.
- `src/app/layout.tsx:55` uses `dangerouslySetInnerHTML` for an inline script.
- `src/app/layout.tsx:69` uses `dangerouslySetInnerHTML` for inline style.
- Live domain has no `Content-Security-Policy` header.

Impact: adopting a strong CSP will be harder. The CDN also adds an external dependency to every page.

Recommendation: self-host needed icons or use the existing component/icon system, add nonces/hashes for inline blocks, and deploy a CSP in report-only mode first.

### M8. Profile update accepts weakly validated profile/theme/avatar/widget data

Observation: profile update routes accept several user-controlled fields with shallow validation.

Evidence:
- `src/app/api/v1/humans/profile/route.ts:59` accepts any string `siteTheme` sliced to 30 chars.
- `src/app/api/v1/humans/profile/route.ts:60` accepts `avatarConfig` as provided.
- `src/app/api/v1/humans/profile/route.ts:93` accepts any array as `widgets`.

Impact: invalid themes, oversized JSON, malformed widgets, and unstable avatar config can accumulate in user profile data.

Recommendation: validate `siteTheme` against known IDs, enforce avatar/widget schemas with Zod, and cap JSON sizes.

### M9. CORS improvements are incomplete and inconsistent across API families

Observation: social routes now validate CORS, but v1 routes use inconsistent response headers. `/api/v1/posts` returned 200 to disallowed origins without `Access-Control-Allow-Origin`, which blocks browser reads but still processes the request.

Evidence:
- `src/lib/security/cors.ts:169` defines `validateCors`.
- `src/lib/security/cors.ts:173` allows no-origin requests.
- `src/lib/security/cors.ts:193` defines `getDynamicCorsOrigin`.
- `src/lib/security/cors.ts:195` returns an empty origin string when no origin exists.
- `src/app/api/v1/posts/route.ts:164` returns JSON without CORS headers.
- `src/app/api/v1/posts/route.ts:298` handles OPTIONS separately.
- `src/app/api/v1/posts/route.ts:302` sets preflight `Access-Control-Allow-Origin`.

Impact: browser CORS and actual server-side access are being conflated. Some routes block disallowed browser origins, some only omit ACAO, and server-to-server requests remain unaffected.

Recommendation: define per-route access policy separately from CORS, then centralize both actual response headers and preflight handling.

### M10. Sitemap and robots file are stale versus active routes

Observation: SEO files mention old/current routes inconsistently and omit important live routes.

Evidence:
- `public/sitemap.xml:9` lists `/feed`.
- `public/sitemap.xml:11` lists `/sanctuary`.
- `public/robots.txt:8` allows `/feed`.
- `public/robots.txt:10` allows `/sanctuary`.
- `public/robots.txt:14` disallows `/terminal`.
- Live pages include `/feedspace`, `/live`, `/pricing`, `/avatar-render`, and `/terminal`.
- `src/components/homepage/Footer.tsx:39` links to `/feed`.
- The homepage live scrape surfaced `/feedspace` links.

Impact: search crawlers and users get mixed signals. Important new surfaces may not be indexed as intended, and old route names remain in footer/terminal.

Recommendation: regenerate sitemap from the active route map and choose one canonical route name for feed/feedspace and about/sanctuary.

### M11. `/api/life` can run very long synchronous scheduler actions

Observation: the LUCY life endpoint can trigger all-agent actions that perform sequential waits and external calls.

Evidence:
- `src/app/api/life/route.ts:16` exports POST.
- `src/app/api/life/route.ts:60` handles `all-moods`.
- `src/app/api/life/route.ts:64` handles `all-transmissions`.
- `src/app/api/life/route.ts:72` handles `beehive`.
- `dorylus/life-scheduler.ts:26` sets per-call timeout to 30 seconds.
- `dorylus/life-scheduler.ts:127` waits 10 seconds between mood updates.
- `dorylus/life-scheduler.ts:175` waits 30 seconds between transmissions.
- `dorylus/life-scheduler.ts:236` waits 60 seconds between conversations.

Impact: manual triggers can exceed reverse-proxy or platform request timeouts, causing uncertain completion/reporting.

Recommendation: move long-running scheduler actions to a queue/job runner and return a job ID immediately.

### M12. DeepResearch service appears present but not wired into active app flows

Observation: `deepresearch-service/` and `src/lib/deepresearch/client.ts` exist, but the only source references found are the client definitions themselves.

Evidence:
- `deepresearch-service/main.py:200` exposes `/research`.
- `deepresearch-service/main.py:211` exposes `/research/stream`.
- `deepresearch-service/ecosystem.config.cjs:7` binds uvicorn to `127.0.0.1:8102`.
- `src/lib/deepresearch/client.ts:53` defines `callDeepResearch`.
- `src/lib/deepresearch/client.ts:95` defines `callDeepResearchStream`.
- No active caller was found outside `src/lib/deepresearch/client.ts` during the grep pass.

Impact: this may be unfinished/dead integration. If it is meant to power product features, it is not discoverable from active app routes.

Recommendation: document intended callers, add route/UI integration or remove from deploy scope. Keep binding to localhost unless explicit auth is added.

### M13. DeepResearch sandbox endpoint handling can fail unclearly when no sandbox endpoint is configured

Observation: the bundled Qwen research Python tool starts with an empty sandbox endpoint list and chooses randomly from it.

Evidence:
- `deepresearch-service/repo/inference/tool_python.py:21` initializes `SANDBOX_FUSION_ENDPOINTS = []`.
- `deepresearch-service/repo/inference/tool_python.py:25` only fills it if `SANDBOX_FUSION_ENDPOINT` exists.
- `deepresearch-service/repo/inference/tool_python.py:79` calls `random.choice(SANDBOX_FUSION_ENDPOINTS)`.
- `deepresearch-service/repo/inference/tool_python.py:103` reports errors using `endpoint`, which may not be assigned if `random.choice` failed first.

Impact: missing config can produce confusing secondary errors instead of a clean "sandbox not configured" failure.

Recommendation: validate endpoint config at service startup and fail with a clear health error.

## Low Findings and Cleanup Candidates

### L1. Root garbage-name files should be deleted in a controlled cleanup

Observation: accidental root files with JavaScript-fragment names are present and untracked. Contents were intentionally not analyzed per scope.

Evidence:
- `0).length` filename-level artifact.
- `0){window.__tlog.push({t` filename-level artifact.
- `0}).length` filename-level artifact.
- `c.charCodeAt(0).toString(16)).join('_')` filename-level artifact.
- `r.style.getPropertyValue('--homepage-ticker-duration'))[0]})` filename-level artifact.
- `setTimeout(r` filename-level artifact.
- `{var` filename-level artifact.

Impact: repo clutter, accidental packaging risk, and confusion during audits/deploys.

Recommendation: delete them only after confirming with `git status` and a backup/snapshot policy. Do not analyze or preserve unless there is a known forensic need.

### L2. Tracked backup/generated files add noise

Observation: several backup and generated files are tracked.

Evidence:
- `src/app/(spacebot)/botspace/[name]/page.tsx.backup-before-chat-redesign:1` tracked backup file.
- `src/app/layout.tsx.bak-nextauth:1` tracked backup file.
- `src/auth.config.ts.bak-nextauth:1` tracked backup file.
- `src/middleware.ts.bak-nextauth:1` tracked backup file.
- `scripts/__pycache__/qwen-tool-service.cpython-312.pyc:1` tracked generated bytecode.
- `tsconfig.tsbuildinfo:1` tracked generated build info.

Impact: noisy diffs and accidental use of stale code.

Recommendation: remove from git and rely on source control history for backups.

### L3. `ConditionalChrome` is dead/vestigial

Observation: `ConditionalChrome` imports routing and computes state but returns children unchanged.

Evidence:
- `src/components/ConditionalChrome.tsx:3` imports `usePathname`.
- `src/components/ConditionalChrome.tsx:9` reads `pathname`.
- `src/components/ConditionalChrome.tsx:20` returns only `<>{children}</>`.

Impact: small dead-code cost and mental overhead.

Recommendation: remove it or restore its intended conditional chrome behavior.

### L4. Mention/highlight sanitizer only replaces the first greater-than sign

Observation: one sanitizer path globally escapes `<` but only escapes the first `>`.

Evidence:
- `src/components/HighlightedMentionsAndHashTags.tsx:14` uses `.replace(/</g, '&lt;').replace(/>/, '&gt;')`.
- `src/components/HighlightedMentionsAndHashTags.tsx:2` also uses DOMPurify.

Impact: DOMPurify reduces exploitability, but inconsistent pre-escaping can create rendering edge cases.

Recommendation: make the second replace global or remove the manual pre-escape if DOMPurify is the canonical sanitizer.

### L5. Secret defaults remain in security helpers

Observation: some security helpers allow empty or placeholder secrets.

Evidence:
- `src/lib/security/heartbeat.ts:21` defaults `HEARTBEAT_SECRET` to `CHANGE_IN_PRODUCTION`.
- `src/lib/security/api-keys.ts:117` defaults HMAC secret to an empty string.
- `src/lib/security/api-keys.ts:131` defaults HMAC secret to an empty string.

Impact: if these paths are enabled without env validation, signatures can be weak or predictable.

Recommendation: fail startup or feature initialization when required secrets are missing in production.

## Prior Fortress Findings: Current Status

- Prior CORS wildcard concern: partially improved. Live social routes reject disallowed browser origins, but v1 route CORS is inconsistent and server-to-server access remains open where routes are public.
- Prior machine auth "bot name as key": improved. `src/lib/machine-auth.ts:11` now describes platform keys rather than names. New issue: `sb_` prefix mismatch and plaintext key lookup.
- Prior social graph exposure: still partially open. Followers/following routes remain public and no-rate-limit in source.
- Prior audit buffer not persistent: improved. `src/lib/security/audit.ts` now writes to `/var/log/spacebot/audit.log` and requeues on failure.
- Prior social sanitization uncertainty: improved in service layer via `src/lib/sanitize-input.ts:6`, but one frontend mention helper still has the first-`>` issue above.
- Prior heartbeat placeholder secret: still present at `src/lib/security/heartbeat.ts:21`.

## Live Drift Table

| Area | Source says | Live says | Risk |
| --- | --- | --- | --- |
| `/api/health` | Dynamic timestamp via `new Date()` at `src/app/api/health/route.ts:7` | Returns `2026-04-23T03:10:11.372Z` on 2026-05-04 | Monitoring false positives |
| `/api/metrics` | Route exists at `src/app/api/metrics/route.ts:8` | 404 on domain and direct port | Deployed build/source mismatch |
| `/api/v1/ticker/headlines` | Returns array at `src/app/api/v1/ticker/headlines/route.ts:48` | Returns object with `topTickerItems` | Client contract mismatch |
| `/about` | No Next route found; terminal pushes `/about` at `src/app/(spacebot)/terminal/page.tsx:291` | Domain redirects to `/sanctuary`; direct port 404 | Proxy/app route mismatch |
| Not-found routes | `notFound()` or custom not-found UI | Several invalid detail URLs return 200 | SEO and monitoring confusion |
| Direct app port | PM2 starts port 3003 at `ecosystem.config.js:6` | Public HTTP 200 from internet | Proxy/security bypass |

## API Surface Notes

- `/api/test-bot`: critical secret/cost exposure; do not leave public.
- `/api/health`: must be dynamic/no-store.
- `/api/metrics`: reconcile source/live, fail closed.
- `/api/v1/ticker/headlines`: contract drift; likely relevant to `/aispace`.
- `/api/social/follow/[name]/followers` and `/following`: public, no rate limit, CORS-only browser mitigation.
- `/api/v1/humans/theme`: method-limited PATCH route, but client persistence path should not fire for guests/server-theme hydration.
- `/api/v1/humans/profile`: needs schema validation for theme/avatar/widgets.
- `/api/life`: should not run long agent cycles synchronously in a web request.

## Website/UX and Rebuild Direction

The current site already has the ingredients of a great "space-age super site": terminal identity, agents, live AI/news surfaces, sanctuary lore, human profiles, and the LUCY Engine. The issue is that the experience feels like several powerful subsystems layered together rather than one coherent command deck.

Recommended Space Odyssey / Space Agents redesign direction:

- Make the first screen a real command deck, not a marketing hero: live system status, featured agents, current transmissions, and a simple "Ask / Explore / Build / Enter Sanctuary" action row.
- Keep the terminal aesthetic, but make it assistive rather than cryptic: commands can exist, but every command should map to obvious visual controls.
- Create one canonical navigation vocabulary: choose `Sanctuary` or `About`, `Feed` or `Feedspace`, then update terminal, footer, sitemap, and redirects together.
- Turn Space Agents into the core visual model: agent cards should show role, mood, last signal, trust/verified status, and a one-click conversation/action.
- Use a restrained sci-fi design system: black glass, white text, cold cyan, amber alerts, restrained green status lights, and occasional red critical states. Avoid making every panel neon.
- Replace repeated avatar style injection with one global animation layer and make avatar components semantic and lightweight.
- Add a persistent system rail: Live, Agents, Humans, Lab, Sanctuary, Terminal, Account.
- Make `/aispace` a true "mission control" surface: current AI/news ticker, source credibility, model commentary, and filters.
- Treat humans as first-class: profile dashboard, privacy controls, saved agents, theme controls, and "my signal" activity should be clear.
- Add performance budgets: homepage under 150 KB HTML, heavy listing pages paginated/virtualized, no duplicate inline keyframes.
- Add visual QA to CI once dependencies are allowed: desktop/mobile screenshots, 404 status checks, console-error checks for `/aispace`, `/botspace`, `/live`, `/peoplespace`, and `/terminal`.

Read-only constraint note: I did not build the new version in this pass because the explicit instruction for this run was audit-only and the only allowed write was this report.

## Recommended Fix Order

1. Rotate the hard-coded DashScope key and remove/protect `/api/test-bot`.
2. Firewall or localhost-bind port 3003 so only nginx can reach Next.
3. Fix `/api/health` dynamic/no-store behavior and verify changing timestamps live.
4. Reconcile deployed artifact with source: `/api/metrics`, `/api/v1/ticker/headlines`, `/about`, and direct-port behavior.
5. Fix API key storage: remove plaintext key dependence and resolve `botspace_` vs `sb_`.
6. Add rate limiting/privacy controls to followers/following.
7. Fix 404 status handling for invalid detail routes.
8. Move avatar keyframes to global CSS and reduce large SSR payloads.
9. Update sitemap/robots/navigation vocabulary.
10. Plan dependency upgrades in tested lanes.

## Appendix A: Live Probe Summary

| URL | Status | Notes |
| --- | ---: | --- |
| `https://spacebot.space/` | 200 | Domain through nginx; security headers present except CSP |
| `http://159.89.178.205:3003/` | 200 | Direct app port public; lacks nginx security headers |
| `https://spacebot.space/aispace` | 200 | No TypeError string in HTML |
| `http://159.89.178.205:3003/aispace` | 200 | Same server-render availability |
| `https://spacebot.space/about` | 301 -> 200 | Final URL `/sanctuary` |
| `http://159.89.178.205:3003/about` | 404 | Direct app has no route/rewrite |
| `https://spacebot.space/api/health` | 200 | Stale timestamp `2026-04-23T03:10:11.372Z` |
| `http://159.89.178.205:3003/api/health` | 200 | Same stale body |
| `https://spacebot.space/api/metrics` | 404 | Source route exists |
| `http://159.89.178.205:3003/api/metrics` | 404 | Source route exists |
| `https://spacebot.space/api/v1/ticker/headlines?limit=2` | 200 | Live object contract with `topTickerItems` |
| `http://159.89.178.205:3003/api/v1/ticker/headlines?limit=2` | 200 | Same endpoint class, different observed payload length |
| `https://spacebot.space/agents/not-a-real-agent-zz` | 200 | Should be 404 |
| `https://spacebot.space/content/not-a-real-id` | 200 | Should be 404 |
| `https://spacebot.space/botspace/not-a-real-bot-zz` | 200 | Custom not-found UI returns success |
| `https://spacebot.space/api/v1/humans/theme` | 405 | GET not allowed; PATCH not tested to avoid mutation |
| `https://spacebot.space/api/test-bot` | 405 | GET not allowed; POST not tested to avoid model call |

## Appendix B: CORS Probe Summary

| Route | Origin | Status | ACAO |
| --- | --- | ---: | --- |
| `/api/social/feed?limit=1` | `https://evil.example` | 403 | empty |
| `/api/social/follow/nexus-7/following?limit=1` | `https://evil.example` | 403 | empty |
| `/api/v1/posts?limit=1` | `https://evil.example` | 200 | empty |
| `/api/social/feed?limit=1` | `https://spacebot.space` | 200 | `https://spacebot.space` |
| `/api/social/follow/nexus-7/following?limit=1` | `https://spacebot.space` | 200 | `https://spacebot.space` |
| `/api/v1/posts?limit=1` | `https://spacebot.space` | 200 | empty |
| `/api/social/follow/nexus-7/following?limit=1` | no Origin | 200 | empty |

Interpretation: browser CORS is improved for social endpoints, but public server-to-server access remains.

## Appendix C: Git State Observed

Modified:
- `safe-build.sh:1` mode-only change.
- `scripts/grand-finale-restart.sh:1` mode-only change.
- `scripts/start-tool-service.sh:1` mode-only change.

Untracked notable items:
- `deepresearch-service/`
- `research/`
- `src/lib/agentscope/`
- `src/lib/deepresearch/`
- `src/lib/experience/`
- `src/lib/memory/`
- screenshot PNGs in root
- root garbage-name JavaScript fragment files listed in L1

Tracked cleanup candidates:
- `.machine_keys.json:1`
- `db_backup_before_social_20260330_025409.sql:1`
- `scripts/__pycache__/qwen-tool-service.cpython-312.pyc:1`
- `src/app/(spacebot)/botspace/[name]/page.tsx.backup-before-chat-redesign:1`
- `src/app/layout.tsx.bak-nextauth:1`
- `src/auth.config.ts.bak-nextauth:1`
- `src/middleware.ts.bak-nextauth:1`
- `tsconfig.tsbuildinfo:1`

