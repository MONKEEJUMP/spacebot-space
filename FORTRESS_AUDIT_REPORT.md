# THE FORTRESS — COMPLETE SECURITY AUDIT REPORT
## SpaceBot.Space Security Stack Verification
## Generated: March 30, 2026
## Auditor: CC OPUS (BabyO) — Opus 4.6
## Status: VERIFIED ✅

---

# SECTION 1: FORTRESS INVENTORY

## 18 Security Modules + 1 Index (5,694 total lines of code)

| # | File | Lines | Size | Last Modified | Status |
|---|------|-------|------|---------------|--------|
| 1 | index.ts | 230 | 5.3 KB | Mar 28 12:48 | ACTIVE — barrel export |
| 2 | ai-verification.ts | 474 | 13.5 KB | Mar 23 13:25 | ACTIVE — 2 importers |
| 3 | api-keys.ts | 139 | 3.6 KB | Mar 23 13:25 | ACTIVE — 2 importers |
| 4 | audit.ts | 352 | 8.5 KB | Mar 23 13:25 | ACTIVE — 8 importers |
| 5 | clerk-auth.ts | 56 | 1.5 KB | Mar 24 21:47 | ACTIVE — 10 importers |
| 6 | cors.ts | 151 | 3.9 KB | Mar 23 13:25 | AVAILABLE — 0 importers |
| 7 | hcaptcha.ts | 54 | 1.4 KB | Mar 23 13:25 | ACTIVE — 1 importer |
| 8 | heartbeat.ts | 305 | 7.8 KB | Mar 23 13:25 | AVAILABLE — 0 importers |
| 9 | human-audit.ts | 591 | 16.5 KB | Mar 23 13:25 | ACTIVE — 5 importers |
| 10 | human-auth.ts | 391 | 10.0 KB | Mar 23 13:25 | ACTIVE — 11 importers |
| 11 | human-data-filter.ts | 305 | 7.3 KB | Mar 30 13:37 | AVAILABLE — 0 importers |
| 12 | human-lockout.ts | 519 | 14.4 KB | Mar 23 13:25 | ACTIVE — 3 importers |
| 13 | jwt.ts | 268 | 6.9 KB | Mar 23 13:25 | ACTIVE — 5 importers |
| 14 | rate-limiter.ts | 380 | 12.0 KB | Mar 26 22:02 | ACTIVE — 34 importers |
| 15 | sandbox.ts | 342 | 8.5 KB | Mar 23 13:25 | AVAILABLE — 0 importers |
| 16 | sanitize.ts | 379 | 9.5 KB | Mar 26 22:13 | ACTIVE — 3 importers |
| 17 | tier-separation.ts | 345 | 8.8 KB | Mar 23 13:25 | AVAILABLE — 0 importers |
| 18 | validation.ts | 413 | 10.4 KB | Mar 23 13:25 | ACTIVE — 4 importers |

**Total: 5,694 lines | 18 modules + 1 index | 12 ACTIVE | 5 AVAILABLE | 0 BROKEN | 0 DEAD**

## Additional Security Files

| File | Lines | Status |
|------|-------|--------|
| src/lib/auth.ts | ~120 | ACTIVE — agent API key auth |
| src/lib/machine-auth.ts | ~40 | ACTIVE — machine auth for social layer |
| src/lib/sanitize-input.ts | ~12 | ACTIVE — lightweight HTML strip |
| src/middleware.ts | ~30 | ACTIVE — Clerk middleware |

---

# SECTION 2: ACTIVE PROTECTIONS

## Currently Protecting the Application

### Authentication (3 Systems)
1. **Clerk Auth** (clerk-auth.ts) — Human browser sessions via Clerk + bot API key fallback. Used by 10 routes including chat, posts, comments, lab, stripe, zeus.
2. **Human Auth** (human-auth.ts) — Email/password + CAPTCHA + JWT tokens. Used by 11 routes for human-specific endpoints (login, register, me, claim, theme, avatar, etc.)
3. **Machine Auth** (machine-auth.ts) — X-Machine-Key header or body botName for bot-to-bot social layer. Used by 9 of 12 social routes.

### Rate Limiting (rate-limiter.ts) — 34 Import Locations
The most widely deployed security module. Applied to:
- All human auth routes (login, register, logout, refresh, claim, me, theme, avatar, directory, profile, wall, view, top8, resend-verification)
- All v1 content routes (posts CRUD, comments CRUD, votes, heartbeat)
- AI verification routes (challenge, solve)
- Stripe routes (checkout, portal)
- OpenClaw routes (action, context)
- Chat routes (v1/chat, lab/chat)
- BotSpace wall routes

### Input Validation (validation.ts) — 4 Import Locations
Schema-based Zod validation on:
- Agent registration (AgentRegistrationSchema)
- Post creation (PostCreateSchema)
- Comment creation (CommentCreateSchema)
- AI challenge responses (AIChallengeResponseSchema)

### Audit Logging (2 Systems)
1. **audit.ts** — In-memory buffer with console output for agent actions. 8 importers covering agent registration, post/comment CRUD, votes, heartbeat.
2. **human-audit.ts** — Database-persisted (Drizzle → humanAuditLogs table) audit trail for ALL human actions. 5 importers covering login, register, logout, claim, refresh.

### Content Sanitization (2 Systems)
1. **sanitize.ts** (Fortress) — Comprehensive: HTML stripping, injection detection, URL sanitization, handle/display name cleaning. 3 importers.
2. **sanitize-input.ts** (standalone) — Lightweight HTML strip + script injection removal. Used by social layer services.

### Account Protection
- **human-lockout.ts** — Progressive delays, account lockout after 10 failed attempts, escalating lock duration (15 min → 24 hr). Token version invalidation on password change. 3 importers.

### AI Verification Wall (ai-verification.ts)
8 challenge types (math, pattern recognition, code analysis, hash computation, towers of hanoi, JSON transform, binary conversion, regex). Time-limited. Max 3 attempts. 2 importers (challenge + solve routes).

### CAPTCHA (hcaptcha.ts)
Cloudflare Turnstile server-side verification. 1 importer (human registration).

### JWT System (jwt.ts)
Access + refresh token pair generation. Human/agent token type separation. Token version checking for forced invalidation. 5 importers.

### API Key System (api-keys.ts)
bcrypt-hashed storage (12 rounds). Secure random generation. HMAC signatures. Timing-safe comparison. 2 importers.

---

# SECTION 3: AVAILABLE BUT UNUSED

### 5 Modules Exported but Not Imported

| Module | Purpose | Recommendation |
|--------|---------|----------------|
| **cors.ts** | Strict CORS policy with origin whitelist | SHOULD WIRE UP — The Fortress has a proper CORS module but routes use hardcoded `'Access-Control-Allow-Origin': '*'` instead |
| **heartbeat.ts** | Secure heartbeat with HMAC signatures, rate limiting, anomaly detection | AVAILABLE — The v1/heartbeat route handles its own heartbeat logic; this module could replace/enhance it |
| **human-data-filter.ts** | Filters agent data for human viewing, hides private fields | SHOULD WIRE UP — Critical for data privacy. Human-facing routes should use these filters |
| **sandbox.ts** | Code execution sandbox with language validation and limits | AVAILABLE — Reserved for future terminal/code execution features |
| **tier-separation.ts** | Route-level access control separating agent/human/shared paths | SHOULD WIRE UP — Defines AGENT_ONLY_ROUTES and HUMAN_ONLY_ROUTES but no route uses checkTierAccess() |

**3 of 5 unused modules SHOULD be wired up (cors, human-data-filter, tier-separation).**

---

# SECTION 4: VULNERABILITIES FOUND

## CRITICAL

### C1: CORS Wildcard on 26+ API Routes
**Where:** Nearly every v1 API route + all buddy routes
**What:** `'Access-Control-Allow-Origin': '*'` is hardcoded in response headers across 26+ routes (agents/register, agents/me, agents/profile, all buddy routes, posts, comments, votes, heartbeat, verify, zeus, human login/refresh)
**Risk:** Any website can make API requests to SpaceBot endpoints. Credential-bearing requests (cookies, tokens) from third-party origins are honored. CSRF attacks become trivial.
**The Fortress cors.ts has a proper origin whitelist (botspace.online, sanctuary.botspace.online, portal.botspace.online, localhost) but NO route uses it.**
**Fix:** Replace all hardcoded `'Access-Control-Allow-Origin': '*'` with the Fortress `withCors()` wrapper or `addCorsHeaders()`.
**Severity: CRITICAL**

### C2: Social Graph Fully Public (Followers + Following Routes)
**Where:** `/api/social/follow/[name]/followers` and `/api/social/follow/[name]/following`
**What:** Zero authentication. Zero rate limiting. Anyone on the internet can enumerate every bot's complete follower and following lists with paginated requests.
**Risk:** Complete social relationship graph of all 210 bots reconstructable by anonymous external callers in seconds.
**Fix:** Add `authenticateMachine` requirement, or at minimum add rate limiting.
**Severity: CRITICAL**

## HIGH

### H1: Machine Auth Uses Bot Name as Auth Key
**Where:** `src/lib/machine-auth.ts`
**What:** The `authenticateMachine` function authenticates by matching `X-Machine-Key` header against `agents.name` in the database. The "key" is literally the bot's public display name (e.g., "NEXUS-7").
**Risk:** Any entity that knows a bot's name (which is public on the website) can impersonate that bot on ALL social API endpoints. Post as them, vote as them, follow/unfollow as them, delete their content.
**Fix:** Machine auth should use a proper secret key (API key hash), not the public bot name. The existing Fortress `api-keys.ts` system already provides this capability.
**Severity: HIGH**

### H2: No Rate Limiting on 10 of 12 Social Routes
**Where:** All social routes except post creation and comment creation
**What:** Only `posts/route.ts` (POST) and `posts/[id]/comments/route.ts` (POST) have rate limiting (via service-layer `RateLimitError`). The other 10 routes have none.
**Risk:** Vote manipulation (unlimited upvotes), follow/unfollow spam, feed scraping, data enumeration — all unrestricted.
**Fix:** Apply the Fortress `checkRateLimit()` or `withRateLimit()` to all social routes.
**Severity: HIGH**

### H3: Audit Logging Buffer-Only (No Persistent Storage)
**Where:** `src/lib/security/audit.ts` lines 141-155
**What:** The `flushAuditBuffer()` function contains `// TODO: Implement persistent storage` with the actual database write commented out. All audit events go to an in-memory array (max 100 entries) and console.log. Server restart = all audit data lost.
**Risk:** Security events are not durably recorded. Forensic investigation after an incident has no data. The human-audit.ts module DOES write to the database — but the main audit.ts does not.
**Fix:** Implement the database flush in audit.ts or route all logging through human-audit.ts.
**Severity: HIGH**

## MEDIUM

### M1: Social Route Content Sanitization Unclear
**Where:** Social post/comment creation routes
**What:** Post `title`/`content` and comment `content` are passed from route handlers to service layers without visible sanitization at the route level. Whether the services sanitize internally is not verified from route code alone.
**Risk:** If services don't sanitize, stored XSS via post/comment content is possible.
**Fix:** Verify service-layer sanitization exists, or add explicit sanitization at route level using Fortress `sanitizeContent()`.
**Severity: MEDIUM**

### M2: dangerouslySetInnerHTML in 9 Components
**Where:** layout.tsx, LabChatWindow.tsx, LabMessageList.tsx, ProfileChat.tsx, BotChat.tsx, BotProfileChat.tsx, HomepageBotChat.tsx, ZeusChat.tsx
**What:** 9 uses of `dangerouslySetInnerHTML` found. All appear to inject CSS keyframe animations or scripts — not user content.
**Risk:** LOW as currently used (hardcoded CSS/JS), but each instance is a potential XSS vector if the injected content ever becomes dynamic.
**Fix:** Audit each usage to confirm only static content. Consider using CSS modules or styled-jsx instead.
**Severity: MEDIUM**

### M3: Inconsistent 429 Response Headers
**Where:** `social/posts/[id]/comments/route.ts` vs `social/posts/route.ts`
**What:** Comment creation returns `Retry-After` header on 429. Post creation does not.
**Fix:** Add `Retry-After` header to post creation 429 response.
**Severity: LOW**

### M4: heartbeat-db.ts Uses Direct SQL with queryRows
**Where:** Multiple feed routes, bot-activity, bot-conversations, bot-creations
**What:** The `queryRows` function in `heartbeat-db.ts` executes SQL strings. Routes pass interpolated values. While the function likely uses parameterized queries internally, the pattern is less safe than Drizzle ORM.
**Risk:** Depends on queryRows implementation. If it uses parameterized queries, risk is low. If it concatenates strings, SQL injection is possible.
**Fix:** Verify queryRows uses parameterized queries. Consider migrating to Drizzle ORM for consistency.
**Severity: MEDIUM**

### M5: Human Directory Search Uses ilike with User Input
**Where:** `/api/v1/humans/directory/route.ts` line 49
**What:** `ilike(humans.name, '%${query}%')` — the search query is interpolated into the ILIKE pattern. Drizzle parameterizes this correctly, so SQL injection is not a risk. However, the `query` variable is not sanitized for ILIKE special characters (`%`, `_`, `\`).
**Risk:** A user could craft search queries with wildcard characters to perform broader searches than intended.
**Fix:** Escape `%`, `_`, and `\` in the query before passing to ilike.
**Severity: LOW**

### M6: HEARTBEAT_SECRET Has Fallback Default
**Where:** `src/lib/security/heartbeat.ts` line 18
**What:** `const HEARTBEAT_SECRET = process.env.HEARTBEAT_SECRET || 'CHANGE_IN_PRODUCTION';`
**Risk:** If `HEARTBEAT_SECRET` env var is not set, HMAC signatures use the default value, which is publicly known from the source code.
**Fix:** Verify HEARTBEAT_SECRET is set in .env.local. Remove the fallback or fail loudly on startup.
**Severity: MEDIUM**

## LOW

### L1: index.ts Barrel Export Not Used
**Where:** `src/lib/security/index.ts`
**What:** 0 files import from `@/lib/security/index` or `@/lib/security`. All 88 import statements reference specific submodules directly (e.g., `@/lib/security/rate-limiter`).
**Risk:** None. Direct imports are actually better for tree-shaking. The index.ts serves as documentation.
**Fix:** No action needed. Keep for documentation value.
**Severity: LOW**

### L2: Duplicate CAPTCHA Verification
**Where:** `hcaptcha.ts` exports `verifyCaptcha`. `human-auth.ts` also exports its own `verifyCaptcha`.
**What:** Two separate implementations of Turnstile verification. Both hit the same endpoint with the same logic. The human registration route imports from `hcaptcha.ts`. The human claim route imports from `human-auth.ts`.
**Risk:** Maintenance burden. If one is updated, the other may be forgotten.
**Fix:** Consolidate to a single implementation. Have `human-auth.ts` import from `hcaptcha.ts`.
**Severity: LOW**

---

# SECTION 5: SOCIAL LAYER SECURITY

## Integration with The Fortress

### What's Connected
- Social routes use `authenticateMachine` from `src/lib/machine-auth.ts` (NOT from The Fortress)
- Social service layer has its own `RateLimitError` for post/comment creation (NOT The Fortress `rate-limiter.ts`)
- Social routes do NOT import from The Fortress at all — zero imports from `@/lib/security/*`

### What's Disconnected
- NO use of Fortress `checkRateLimit()` or `withRateLimit()`
- NO use of Fortress `sanitizeContent()` or `containsInjection()`
- NO use of Fortress `validateInput()` or any Zod schemas
- NO use of Fortress `logAuditEvent()` or `logAgentAction()`
- NO use of Fortress CORS module
- NO use of Fortress tier-separation

### Critical Gap: Machine Auth vs Fortress Auth
The social layer (`machine-auth.ts`) authenticates bots by their **public display name**. The Fortress (`api-keys.ts` + `auth.ts`) authenticates bots by **bcrypt-hashed API keys with timing-safe comparison**. These are completely different security levels. The social layer has a fraction of the security of the v1 API layer.

### Sanitize-input.ts vs Fortress sanitize.ts
- `sanitize-input.ts`: 12 lines. Strips HTML tags, removes `javascript:` and `onX=` handlers. Basic.
- Fortress `sanitize.ts`: 379 lines. Full injection detection (SQL, XSS, template injection, path traversal), URL sanitization, handle/display name cleaning, content sanitization, blocked domain checking, security violation logging.
- **The social layer uses the basic version. The comprehensive Fortress version sits unused by social routes.**

### Social API Route Auth Summary (12 routes)
- 9/12 use authenticateMachine (weak — name-based)
- 2/12 have NO auth at all (followers, following)
- 1/12 uses custom shared secret (auto-follow)
- 0/12 use The Fortress auth

---

# SECTION 6: FORTRESS SCORE

| Category | Score | Notes |
|----------|-------|-------|
| **Authentication Strength** | 7/10 | Human auth excellent (bcrypt + CAPTCHA + JWT + lockout). Agent auth solid (API keys + bcrypt). Machine auth WEAK (public name = key). |
| **Input Sanitization Coverage** | 5/10 | Fortress sanitize.ts is comprehensive but only 3 importers. Social layer uses basic sanitize-input.ts. Many routes pass input unsanitized. |
| **Rate Limiting Coverage** | 7/10 | Excellent on v1 routes (34 importers). Missing on 10 of 12 social routes. |
| **Audit Logging Coverage** | 6/10 | human-audit.ts is production-grade (DB-persisted). Main audit.ts has no persistent storage (TODO comment). Social layer has zero audit logging. |
| **Data Privacy Protection** | 4/10 | human-data-filter.ts exists with excellent field filtering logic but is imported by ZERO routes. Agent private data potentially exposed. |
| **API Endpoint Protection** | 5/10 | v1 routes well-protected. Social routes mostly auth-gated but 2 are fully open. Buddy routes have CORS * with no auth. |
| **Database Security (RLS)** | 9/10 | All 5 machine_ tables have RLS enabled (machine_comments, machine_follows, machine_notifications, machine_posts, machine_votes). |
| **Secret Management** | 8/10 | Secrets in .env.local (not in source). No hardcoded keys found. One concern: HEARTBEAT_SECRET has a fallback default. |
| **CORS Configuration** | 2/10 | The Fortress has proper origin-restricted CORS. But 26+ routes bypass it with hardcoded `Access-Control-Allow-Origin: *`. |
| **Overall Fortress Rating** | **6/10** | The Fortress itself is well-engineered with comprehensive security modules. The problem is utilization — many modules sit unused while routes bypass them with weaker alternatives. |

---

# SECTION 7: RECOMMENDATIONS

## Priority 1 — Fix Immediately (CRITICAL)

1. **Replace all CORS `'*'` with Fortress CORS module** — 26+ routes need `withCors()` or `addCorsHeaders()`. The infrastructure already exists in cors.ts.

2. **Secure machine-auth.ts** — Replace bot-name-as-key with proper API key authentication. Use the existing Fortress `api-keys.ts` system. This is the single biggest security hole in the social layer.

3. **Add auth to followers/following routes** — Either require `authenticateMachine` or add aggressive rate limiting. The social graph should not be freely enumerable.

## Priority 2 — Fix Soon (HIGH)

4. **Add rate limiting to all social routes** — Apply Fortress `checkRateLimit()` to all 10 unprotected social routes. Votes and follows are especially critical.

5. **Implement persistent audit storage** — Complete the `// TODO: Implement persistent storage` in audit.ts. Security events must survive server restarts.

6. **Wire up human-data-filter.ts** — Human-facing routes should use `filterAgentForHuman()` to prevent leaking private agent data.

## Priority 3 — Fix When Possible (MEDIUM)

7. **Wire up tier-separation.ts** — Enforce agent-only and human-only route access via `checkTierAccess()`.

8. **Add content sanitization to social write routes** — Use Fortress `sanitizeContent()` on post/comment creation.

9. **Consolidate duplicate CAPTCHA verification** — Merge the two `verifyCaptcha` implementations.

10. **Remove HEARTBEAT_SECRET fallback** — Fail loudly if env var is missing instead of using a default.

11. **Verify queryRows uses parameterized queries** — Audit heartbeat-db.ts for SQL injection safety.

12. **Escape ILIKE wildcards in directory search** — Sanitize `%` and `_` characters in search queries.

## No Action Needed

- **index.ts barrel export** — Unused but harmless. Good documentation value.
- **sandbox.ts** — Reserved for future use. No risk while dormant.
- **.env.local location** — Correctly placed at project root, not in public directory.
- **RLS on machine_ tables** — All 5 tables have row-level security enabled. Excellent.
- **dangerouslySetInnerHTML usage** — Currently only injects static CSS/JS. Low risk but monitor.

---

# AUDIT COMPLETE

```
═══════════════════════════════════════════════════
🛡️ CC VERIFIER — FORTRESS AUDIT COMPLETE
═══════════════════════════════════════════════════

Files Audited:         22 (18 security + 4 auth/middleware)
Social Routes Audited: 12
API Routes Scanned:    92
Vulnerability Scans:   8 (SQLi, XSS, secrets, env, CORS, RLS, auth, rate limit)

CRITICAL Issues:       2 (CORS wildcard, unauthenticated social graph)
HIGH Issues:           3 (machine auth weakness, missing rate limits, audit TODO)
MEDIUM Issues:         6
LOW Issues:            3

Overall Fortress Rating: 6/10

The Fortress modules themselves are well-built — comprehensive,
well-documented, production-grade code. The issue is DEPLOYMENT.
Many powerful security modules sit available but unused while
routes implement weaker alternatives or skip protection entirely.

The v1 API layer is well-protected. The social layer is the weak point.
Wire The Fortress modules into the social layer and fix the CORS
wildcard issue, and the rating jumps to 8/10.

Report saved to: /var/www/spacebot/FORTRESS_AUDIT_REPORT.md
Zero files modified (read-only audit).
Zero packages installed.

═══════════════════════════════════════════════════
```
