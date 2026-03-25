# HUMAN PROFILE BACK OFFICE — CC ARCHITECT ANALYSIS
Generated: 2026-03-24
Project: /var/www/spacebot (SpaceBot.Space)
Status: DRAFT

---

## TASK SUMMARY

Design a Human Profile Back Office for SpaceBot.Space — the edit/manage side of a user's public-facing profile page. Five sequential phases: schema migration, Clerk webhook sync, public profile page, owner detection + edit mode, and sidebar navigation.

---

## CODEBASE ANALYSIS

### Files Examined (21 files):

| File | Lines | Key Finding |
|------|-------|-------------|
| src/db/schema.ts | 540 | humans table (L157-198), humanProfiles (L350-373). MISSING: clerkId, username, isPublic |
| src/db/index.ts | 19 | Drizzle client via postgres-js. Exports `db` + schema re-export |
| src/app/api/webhooks/clerk/route.ts | 37 | STUB — logs only, Prisma TODO, no Svix, no DB writes |
| src/app/api/v1/humans/profile/[name]/route.ts | 152 | Public GET, queries by `ilike(humans.name)`, rate-limited |
| src/app/(spacebot)/peoplespace/[username]/page.tsx | ~650 | HARDCODED 6 demo profiles, no DB queries |
| src/app/(spacebot)/peoplespace/page.tsx | — | PeopleSpace index. MUST NOT BREAK |
| src/app/(spacebot)/peoplespace/build-avatar/page.tsx | — | Avatar builder. MUST NOT BREAK |
| src/app/(spacebot)/peoplespace/profile/[name]/page.tsx | — | Separate profile page. MUST NOT BREAK |
| src/components/Sidebar.tsx | 359 | NAV_LINKS (L7-16), AUTH_LINKS (L20-23), auth section at L168-189 |
| src/components/profile/ProfileEditor.tsx | 383 | MySpace-style customizer, accepts profileType prop |
| src/components/EditProfileForm.tsx | 295 | Form with name/bio/etc, uses react-hook-form + Zod |
| src/components/profile/ProfileWall.tsx | — | Wall post component with auth gate |
| src/hooks/useAuthGate.ts | 34 | Clerk auth gate hook (useAuth + useClerk) |
| src/lib/security/clerk-auth.ts | 57 | Server-side dual auth (Clerk session OR bot API key) |
| src/lib/security/rate-limiter.ts | 372 | Comprehensive limits. Has `humanProfile` (20/15min) + `humanDirectory` (30/min) |
| src/middleware.ts | 37 | Clerk middleware. /peoplespace, /api/v1, /api/webhooks/clerk all PUBLIC |
| src/app/(spacebot)/layout.tsx | 26 | SiteThemeProvider > HumanAuthProvider > ConditionalChrome |
| src/providers/HumanAuthProvider.tsx | 349 | Custom JWT auth (NOT Clerk). Login/register/refresh via old system |
| src/providers/ProfileThemeProvider.tsx | — | Profile theme context |
| src/providers/SiteThemeProvider.tsx | — | Site theme context |
| package.json | — | drizzle-orm ^0.34.1, @clerk/nextjs ^6.39.1. NO drizzle-kit. NO svix |

### Environment State:

| Item | Status |
|------|--------|
| drizzle-kit | NOT INSTALLED (no devDependencies, no drizzle.config.ts) |
| svix | NOT INSTALLED |
| WEBHOOK_SIGNING_SECRET | NOT SET in .env.local |
| Clerk keys | CONFIGURED (pk_live_, sk_live_) |
| Database URL | CONFIGURED (Supabase pooler) |
| drizzle.config.ts | DOES NOT EXIST |
| drizzle/ migrations dir | DOES NOT EXIST |

### Current humans Table Fields (schema.ts L157-198):
```
id, email, passwordHash (NOT NULL), name, subscriptionTier, subscriptionExpiresAt,
stripeCustomerId, subscriptionStartedAt, isEmailVerified, emailVerificationToken,
emailVerificationExpiresAt, passwordResetToken, passwordResetExpiresAt,
failedLoginAttempts, lastFailedLoginAt, accountLockedAt, accountLockedUntil,
accountLockReason, unlockToken, unlockTokenExpiresAt, tokenVersion,
avatarConfig, siteTheme, lastLoginAt, lastLoginIp, createdAt, updatedAt
```
Indexes: emailIdx, lockedUntilIdx

### Current humanProfiles Table Fields (schema.ts L350-373):
```
id, humanId (FK unique), aboutMe, whoIdLikeToMeet, profileAccentColor,
profileBorderColor, profileGlowColor, profileBgTint, wallpaperUrl,
wallpaperOpacity, interestsGeneral, interestsMusic, interestsHeroes,
interestsTechnology, transmission, widgets, buddyName, buddyActive,
createdAt, updatedAt
```
Index: humanIdx

### What is MISSING:
1. `clerkId` on humans table (needed for Clerk-to-Supabase link)
2. `username` on humans table (needed for URL slugs like /peoplespace/pauliewood)
3. `isPublic` on humans table (needed for privacy toggle)

### Critical Compatibility Notes:
- `passwordHash` is NOT NULL. Clerk-created users have no password. Webhook handler must set a placeholder hash to satisfy the constraint.
- `isEmailVerified` defaults to false. Existing profile API gates on `isEmailVerified === true` (L65). Clerk-created users must have this set to true since Clerk handles email verification.
- The HumanAuthProvider (old JWT system) coexists with Clerk. Both remain functional. Clerk is the FUTURE auth; old system remains for backward compatibility.

---

## ARCHITECTURE PLAN

### Overview:

5 sequential phases. Each phase gets its own git commit. All phases modify code only — ONE build runs after Phase 5.

---

### PHASE 1 — SCHEMA MIGRATION

**Goal**: Add clerkId, username, isPublic to the existing humans table.

**Strategy**: Since drizzle-kit is NOT installed and no drizzle.config.ts exists, use raw SQL ALTER TABLE via a one-time Node.js script. Also update schema.ts so Drizzle ORM recognizes the new fields.

#### Files to MODIFY:

**1. src/db/schema.ts** — ADD 3 fields + 2 indexes to humans table

EDIT 1 — Add clerkId and username fields after line 158 (the `id` field):
```typescript
// After: id: uuid('id').primaryKey().defaultRandom(),
clerkId: text('clerk_id').unique(),
username: varchar('username', { length: 50 }).unique(),
```

EDIT 2 — Add isPublic field after line 188 (the `siteTheme` field):
```typescript
// After: siteTheme: varchar('site_theme', { length: 30 }).default('dark').notNull(),
isPublic: boolean('is_public').default(true).notNull(),
```

EDIT 3 — Add indexes to the table's index object (after line 197, the `lockedUntilIdx`):
```typescript
clerkIdIdx: index('humans_clerk_id_idx').on(table.clerkId),
usernameIdx: index('humans_username_idx').on(table.username),
```

#### Files to CREATE:

**2. scripts/migrate-add-clerk-fields.ts** — One-time migration script

```typescript
// Run with: npx tsx scripts/migrate-add-clerk-fields.ts
import postgres from 'postgres';

const sql = postgres(process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL!);

async function migrate() {
  console.log('Adding clerkId, username, isPublic to humans table...');

  await sql`ALTER TABLE humans ADD COLUMN IF NOT EXISTS clerk_id TEXT UNIQUE`;
  await sql`ALTER TABLE humans ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE`;
  await sql`ALTER TABLE humans ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true`;

  await sql`CREATE INDEX IF NOT EXISTS humans_clerk_id_idx ON humans (clerk_id)`;
  await sql`CREATE INDEX IF NOT EXISTS humans_username_idx ON humans (username)`;

  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch((err) => { console.error('Migration failed:', err); process.exit(1); });
```

**Execution**: `cd /var/www/spacebot && npx tsx scripts/migrate-add-clerk-fields.ts`

#### Edit Count: 3 edits to schema.ts + 1 new file
#### Git Commit: `Add clerkId, username, isPublic to humans table`
#### Verification:
```bash
node -e "const p=require('postgres');const s=p(process.env.SPACEBOT_DATABASE_URL);s\`SELECT column_name FROM information_schema.columns WHERE table_name='humans' AND column_name IN ('clerk_id','username','is_public')\`.then(r=>{console.log(r);process.exit()})"
```
#### Rollback: `git revert HEAD` + reverse SQL:
```sql
ALTER TABLE humans DROP COLUMN IF EXISTS clerk_id;
ALTER TABLE humans DROP COLUMN IF EXISTS username;
ALTER TABLE humans DROP COLUMN IF EXISTS is_public;
DROP INDEX IF EXISTS humans_clerk_id_idx;
DROP INDEX IF EXISTS humans_username_idx;
```

---

### PHASE 2 — CLERK WEBHOOK SYNC

**Goal**: Wire the Clerk webhook to sync user events into humans + humanProfiles tables. Create a one-time sync for existing users.

**Package Required**: `svix` (for webhook signature verification)
```bash
cd /var/www/spacebot && npm install svix
```

**Environment Variable Required** (PAULIEWOOD adds manually):
```
WEBHOOK_SIGNING_SECRET=whsec_XXXXXXXXXXXXXXXXXXXXXXXX
```
(Get from Clerk Dashboard > Webhooks > Signing Secret)

**Clerk Dashboard Setup** (PAULIEWOOD does manually):
1. Clerk Dashboard > Webhooks > Add endpoint
2. URL: `https://spacebot.space/api/webhooks/clerk`
3. Events: user.created, user.updated, user.deleted
4. Copy Signing Secret to .env.local

#### Files to MODIFY:

**1. src/app/api/webhooks/clerk/route.ts** — COMPLETE REWRITE (37 lines -> ~140 lines)

Full implementation with:
- Svix signature verification (headers: svix-id, svix-timestamp, svix-signature)
- `user.created`: Insert humans row (clerkId, email, name, username slug, placeholder passwordHash, isEmailVerified=true, isPublic=true) + create humanProfiles row
- `user.updated`: Update humans row (email, name) where clerkId matches
- `user.deleted`: Delete humanProfiles then humans where clerkId matches (cascade for GDPR/CCPA)
- Username slug generator: slugify name, check collisions, append -2/-3/etc.
- Placeholder password hash: `$2b$10$CLERK_MANAGED_AUTH_NO_PASSWORD_LOGIN_POSSIBLE` (satisfies NOT NULL, prevents old-system login)

#### Files to CREATE:

**2. src/app/api/v1/humans/sync-clerk/route.ts** — One-time sync

Protected admin endpoint that:
1. Fetches all Clerk users via Clerk Backend API (`https://api.clerk.com/v1/users`)
2. For each user: checks if humans row exists by email
3. If exists without clerkId: links clerkId + generates username
4. If not exists: creates new humans + humanProfiles rows
5. Returns sync results

Auth: x-admin-key header checked against CLERK_SECRET_KEY

**DELETE THIS FILE AFTER RUNNING.**

#### Edit Count: 1 file rewrite + 1 new file + 1 env var (manual)
#### Git Commit: `Wire Clerk webhook — sync user.created/updated/deleted to Supabase`
#### Verification:
```bash
# Test webhook is alive (should return 400 for missing Svix headers):
curl -X POST https://spacebot.space/api/webhooks/clerk -H "Content-Type: application/json" -d '{"type":"test"}'

# Run one-time sync:
curl -X POST https://spacebot.space/api/v1/humans/sync-clerk -H "x-admin-key: $CLERK_SECRET_KEY"

# Verify DB:
# SELECT id, clerk_id, username, name FROM humans WHERE clerk_id IS NOT NULL;
```
#### Rollback: `git revert HEAD`

---

### PHASE 3 — PUBLIC PROFILE PAGE (DB-backed)

**Goal**: Replace hardcoded [username] page with DB-backed version. Add username support to profile API.

#### Files to MODIFY:

**1. src/app/api/v1/humans/profile/[name]/route.ts** — Add username query + privacy check

EDIT 1 — Replace the single query block (L54-68) with two-step lookup:
- Step 1: Try exact match on `eq(humans.username, name)` (includes username in SELECT)
- Step 2: If no match, fall back to `ilike(humans.name, name)`
- Also SELECT `humans.isPublic` and `humans.username`

EDIT 2 — After the not-found check (L70-75), add isPublic check:
```typescript
if (!human.isPublic) {
  return NextResponse.json(
    { success: false, error: 'This profile is private.' },
    { status: 403 }
  );
}
```

EDIT 3 — Update response to include `username` field in the human object (L110-118)

EDIT 4 — Extend the name validation regex (L44) to allow lowercase slugs:
```typescript
if (!name || name.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(name)) {
```
(Changed max from 30 to 50 to accommodate usernames)

**2. src/app/(spacebot)/peoplespace/[username]/page.tsx** — COMPLETE REWRITE

Replace ~650 lines of hardcoded profiles with ~350 lines of DB-backed client component:

```
Structure:
├── 'use client'
├── Imports (useState, useEffect, Link, AvatarGenerator, ProfileThemeProvider)
├── Fetch from GET /api/v1/humans/profile/{username} on mount
├── States: loading, error, profileData, notFound, isPrivate
├── Loading UI: terminal-style "CONNECTING TO PROFILE..."
├── 404 UI: "SIGNAL NOT FOUND" message with link back to PeopleSpace
├── Private UI: "THIS PROFILE IS PRIVATE" message
├── Profile View:
│   ├── Profile Header (avatar, name, @username, tier badge, join date)
│   ├── Transmission section
│   ├── About Me section
│   ├── Who I'd Like to Meet section
│   ├── Interests (General, Music, Heroes, Technology) in grid
│   ├── Profile colors applied from humanProfiles data
│   └── Profile Wall (buddy posts)
└── SpaceBot.Space terminal aesthetic maintained
```

#### Edit Count: 4 edits to API + 1 file rewrite
#### Git Commit: `Add public human profile page at /peoplespace/[username]`
#### Verification:
```bash
# API test:
curl https://spacebot.space/api/v1/humans/profile/pauliewood

# Browser tests:
# - https://spacebot.space/peoplespace/pauliewood (real profile)
# - https://spacebot.space/peoplespace/nonexistent (404)
# - https://spacebot.space/peoplespace (index still works)
# - https://spacebot.space/peoplespace/build-avatar (still works)
```
#### Rollback: `git revert HEAD`

---

### PHASE 4 — OWNER DETECTION + EDIT MODE

**Goal**: Let signed-in users edit their own profile from the profile page. Server-side Clerk auth verification on all writes.

#### Files to CREATE:

**1. src/hooks/useClerkHuman.ts** — Client hook for Clerk-linked human data

```
Returns: { human, profile, isLoaded, isOwner(username), refetch }
- Uses useUser() from @clerk/nextjs to check sign-in state
- Fetches GET /api/v1/humans/me-clerk when signed in
- Caches result in state
- isOwner(username) compares current user's username to provided username
```

**2. src/app/api/v1/humans/me-clerk/route.ts** — Clerk-authenticated profile fetch

```
GET /api/v1/humans/me-clerk
- Calls auth() from @clerk/nextjs/server
- Queries humans + humanProfiles by clerkId
- Returns human + profile data (for Sidebar and owner detection)
- 401 if not signed in, 404 if no linked profile
```

**3. src/app/api/v1/humans/profile/route.ts** — Authenticated profile write (PUT)

```
PUT /api/v1/humans/profile
- Calls auth() from @clerk/nextjs/server (server-side verification)
- Rate limited via checkRateLimit(ip, 'humanProfile')
- Finds human by clerkId, verifies ownership
- Updates humans table fields: name, isPublic, siteTheme, avatarConfig
- Updates humanProfiles table fields: aboutMe, whoIdLikeToMeet, transmission,
  profileAccentColor, profileBorderColor, profileGlowColor, profileBgTint,
  wallpaperUrl, wallpaperOpacity, interests (4 fields), widgets, buddyName, buddyActive
- Returns { success: true }
```

#### Files to MODIFY:

**4. src/app/(spacebot)/peoplespace/[username]/page.tsx** — Add edit mode

EDIT 1 — Add imports: useClerkHuman, ProfileEditor, EditProfileForm
EDIT 2 — Add hook call + editMode state
EDIT 3 — Add "Edit Profile" button (visible only when isOwner returns true)
EDIT 4 — Add edit panel (renders ProfileEditor + EditProfileForm when editMode is true)

**IMPORTANT**: The coder MUST read ProfileEditor.tsx (383 lines) and EditProfileForm.tsx (295 lines) to verify their prop interfaces match humanProfiles fields. If props are incompatible, the coder may need to create adapter components or modify the forms.

#### Edit Count: 3 new files + 4 edits to [username] page
#### Git Commit: `Add owner detection and profile edit mode`
#### Verification:
```bash
# Browser tests (signed in as PAULIEWOOD):
# - Visit own profile: "Edit Profile" button visible
# - Click Edit: form + customizer appear
# - Make change, save: data persists on reload
# - Visit someone else's profile: no Edit button

# API test:
# fetch('/api/v1/humans/me-clerk') — returns profile data
# fetch('/api/v1/humans/profile', {method:'PUT', body: JSON.stringify({aboutMe:'Test'})})
```
#### Rollback: `git revert HEAD`

---

### PHASE 5 — SIDEBAR + NAVIGATION

**Goal**: Replace "Log In" / "Sign Up" with "My Profile" / "Sign Out" for signed-in Clerk users.

#### Files to MODIFY:

**1. src/components/Sidebar.tsx** — Conditional auth links

EDIT 1 — Add imports after line 5:
```typescript
import { useUser, useClerk } from '@clerk/nextjs';
import { useClerkHuman } from '@/hooks/useClerkHuman';
```

EDIT 2 — Add hook calls inside Sidebar() after line 31:
```typescript
const { isSignedIn, isLoaded: clerkLoaded } = useUser();
const { signOut } = useClerk();
const { human, isLoaded: humanLoaded } = useClerkHuman();
```

EDIT 3 — Replace AUTH_LINKS block (lines 168-189) with conditional:
- Signed in: "My Profile" link to `/peoplespace/{username}` + "Sign Out" button calling `signOut()`
- Not signed in: Original AUTH_LINKS map (Log In / Sign Up)
- While loading: Show nothing (prevent flash)

The `linkStyle` function is defined within the `sidebarContent` variable — the coder must verify it's accessible in the conditional block (it should be, since the conditional replaces code within the same scope).

#### Edit Count: 3 edits to Sidebar.tsx
#### Git Commit: `Add My Profile and Sign Out to sidebar for signed-in users`
#### Verification:
```bash
# Browser tests:
# 1. Not signed in: Sidebar shows "Log In" and "Sign Up"
# 2. Sign in via Clerk: Sidebar shows "My Profile" and "Sign Out"
# 3. Click "My Profile": navigates to /peoplespace/{username}
# 4. Click "Sign Out": signs out, Sidebar reverts to Log In / Sign Up
# 5. PeopleSpace index still loads
# 6. Avatar builder still loads
```
#### Rollback: `git revert HEAD`

---

## SUCCESS CRITERIA

- [ ] Schema: clerkId, username, isPublic fields exist in humans table + Supabase DB
- [ ] Webhook: Clerk user.created/updated/deleted sync to Supabase via Drizzle
- [ ] Webhook: Svix signature verification active
- [ ] Sync: PAULIEWOOD (User #1) has clerkId and username in DB
- [ ] Profile page: /peoplespace/[username] renders real DB data
- [ ] Profile page: Private profiles show "This profile is private"
- [ ] Profile page: 404 for non-existent usernames
- [ ] Owner detection: Edit Profile button visible only to profile owner
- [ ] Edit mode: ProfileEditor + EditProfileForm render in edit panel
- [ ] Profile save: PUT /api/v1/humans/profile updates DB via Clerk auth
- [ ] Sidebar: "My Profile" + "Sign Out" for signed-in users
- [ ] Sidebar: "Log In" + "Sign Up" for anonymous users
- [ ] No regressions: PeopleSpace index, build-avatar, bot profiles all working
- [ ] No regressions: Existing API routes unaffected
- [ ] Site builds successfully (npm run build)

---

## FILE INVENTORY

### Files to CREATE (5 new files):
| # | File | Phase |
|---|------|-------|
| 1 | scripts/migrate-add-clerk-fields.ts | 1 |
| 2 | src/app/api/v1/humans/sync-clerk/route.ts | 2 |
| 3 | src/app/api/v1/humans/me-clerk/route.ts | 4 |
| 4 | src/app/api/v1/humans/profile/route.ts | 4 |
| 5 | src/hooks/useClerkHuman.ts | 4 |

### Files to MODIFY (5 existing files):
| # | File | Phase | Edit Count |
|---|------|-------|------------|
| 1 | src/db/schema.ts | 1 | 3 edits |
| 2 | src/app/api/webhooks/clerk/route.ts | 2 | 1 (full rewrite) |
| 3 | src/app/api/v1/humans/profile/[name]/route.ts | 3 | 4 edits |
| 4 | src/app/(spacebot)/peoplespace/[username]/page.tsx | 3+4 | 1 rewrite + 4 edits |
| 5 | src/components/Sidebar.tsx | 5 | 3 edits |

### Files to TOUCH (env — manual):
| # | File | Phase |
|---|------|-------|
| 1 | .env.local (add WEBHOOK_SIGNING_SECRET) | 2 |

### TOTAL: 5 new files + 5 modified files + 1 env update = 11 file operations
### TOTAL EDITS: ~18 discrete edits across all phases

---

## BUILD ORDER

```
PHASE 1 -> PHASE 2 -> PHASE 3 -> PHASE 4 -> PHASE 5 -> npm run build -> pm2 restart
```

All phases are SEQUENTIAL. Each depends on the previous:
- Phase 2 needs Phase 1 schema fields
- Phase 3 needs Phase 2 synced data + Phase 1 username field
- Phase 4 needs Phase 3 profile page + Phase 1 clerkId field
- Phase 5 needs Phase 4 useClerkHuman hook

ONE build at the end after all 5 phases. ONE PM2 restart.

---

## RISKS AND MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| drizzle-kit not available | Cannot auto-migrate DB | Use raw SQL ALTER TABLE script (designed) |
| svix not installed | Webhook verification fails | Must install svix before Phase 2. Task requires it |
| passwordHash NOT NULL for Clerk users | Insert fails | Use placeholder hash string (designed) |
| isEmailVerified defaults false for Clerk users | Clerk users invisible in profile API | Webhook sets isEmailVerified=true (designed) |
| [username] route catches "build-avatar" | Avatar builder breaks | Next.js static routes take precedence — no conflict |
| [username] route catches "profile" | profile/[name] page breaks | Static "profile" directory takes precedence — no conflict |
| Username collision on webhook | Duplicate key error | generateUniqueUsername appends -2, -3, etc. (designed) |
| WEBHOOK_SIGNING_SECRET not set | Webhook returns 500 | Handler returns clear error message. Documented as mandatory |
| Clerk Dashboard not configured | No webhook events fire | Documented as manual PAULIEWOOD step |
| peoplespace/profile/[name]/page.tsx might break | Unknown | READ THIS FILE before executing Phase 3. May need updates |
| EditProfileForm props mismatch | Form incompatible with humanProfiles | Coder must read EditProfileForm.tsx (295 lines) to verify |
| ProfileEditor props mismatch | Customizer incompatible for human profiles | Coder must read ProfileEditor.tsx (383 lines) to verify |
| linkStyle scope in Sidebar | Conditional render can't access linkStyle | Coder must verify linkStyle is accessible in conditional block |
| Old JWT auth system conflict | Two auth systems running | Both coexist safely. HumanAuthProvider stays. Clerk is additive |
| Reserved username collision | Someone registers "build-avatar" as username | Add reserved words list in slug generator: build-avatar, profile, settings, admin, api |

---

## FILES TO READ BEFORE CODING (MANDATORY PRE-READS)

The coder MUST read ALL of these before writing any code:

1. `src/db/schema.ts` (540 lines) — Full schema, verify exact line numbers
2. `src/db/index.ts` (19 lines) — DB client export pattern
3. `src/app/api/webhooks/clerk/route.ts` (37 lines) — Current stub to replace
4. `src/app/api/v1/humans/profile/[name]/route.ts` (152 lines) — API to modify
5. `src/app/(spacebot)/peoplespace/[username]/page.tsx` (~650 lines) — Page to rewrite
6. `src/app/(spacebot)/peoplespace/profile/[name]/page.tsx` — UNKNOWN FILE, check if affected
7. `src/components/Sidebar.tsx` (359 lines) — Auth links to modify
8. `src/components/profile/ProfileEditor.tsx` (383 lines) — Verify props for edit mode
9. `src/components/EditProfileForm.tsx` (295 lines) — Verify props and Zod schema
10. `src/hooks/useAuthGate.ts` (34 lines) — Reference for Clerk hook pattern
11. `src/lib/security/clerk-auth.ts` (57 lines) — Server-side auth pattern
12. `src/lib/security/rate-limiter.ts` (372 lines) — Rate limit configs
13. `src/middleware.ts` (37 lines) — Verify routes are public
14. `src/app/(spacebot)/layout.tsx` (26 lines) — Provider wrapping order
15. `src/providers/HumanAuthProvider.tsx` (349 lines) — Old auth system, verify coexistence
16. `.env.local` — Verify env vars before adding WEBHOOK_SIGNING_SECRET

---

## IMPLEMENTATION PROMPTS

### PROMPT 1: PHASE 1 — Schema Migration

```
AGENT MODE: All sub-agents active. Zero errors.

ROLE: CODER

MISSION: Add clerkId, username, isPublic fields to the humans table.

SERVER: 159.89.178.205 (root, paramiko SSH)
APP PATH: /var/www/spacebot

STEPS:
1. Read src/db/schema.ts — find humans table definition (starts at line 157)
2. Add clerkId (text, unique) and username (varchar 50, unique) after the id field (line 158)
3. Add isPublic (boolean, default true, not null) after the siteTheme field (line 188)
4. Add two indexes (clerkIdIdx, usernameIdx) after lockedUntilIdx (line 197)
5. Create scripts/migrate-add-clerk-fields.ts with ALTER TABLE commands
6. Run the migration script: cd /var/www/spacebot && npx tsx scripts/migrate-add-clerk-fields.ts
7. Verify columns exist in DB
8. Git commit: "Add clerkId, username, isPublic to humans table"

WHAT NOT TO DO:
- Do NOT run npm run build
- Do NOT install any packages
- Do NOT modify any other tables or files
- Do NOT use drizzle-kit (not installed)

SUCCESS CRITERIA:
- schema.ts has clerkId, username, isPublic in humans table definition
- Database has 3 new columns with correct types and constraints
- Database has 2 new indexes
```

### PROMPT 2: PHASE 2 — Clerk Webhook

```
AGENT MODE: All sub-agents active. Zero errors.

ROLE: CODER

MISSION: Wire Clerk webhook to sync users into Supabase. Install svix. Create one-time sync route.

SERVER: 159.89.178.205 (root, paramiko SSH)
APP PATH: /var/www/spacebot

PREREQUISITE: Phase 1 complete (clerkId, username, isPublic fields exist).

STEPS:
1. Install svix: cd /var/www/spacebot && npm install svix
2. Rewrite src/app/api/webhooks/clerk/route.ts with Svix verification + Drizzle DB operations
   - user.created: insert humans + humanProfiles, generate username slug, placeholder passwordHash
   - user.updated: update humans (email, name) where clerkId matches
   - user.deleted: delete humanProfiles then humans where clerkId matches
3. Create src/app/api/v1/humans/sync-clerk/route.ts for one-time sync
4. Git commit: "Wire Clerk webhook — sync user.created/updated/deleted to Supabase"
5. PAULIEWOOD adds WEBHOOK_SIGNING_SECRET to .env.local manually
6. PAULIEWOOD configures Clerk Dashboard webhook endpoint manually

WHAT NOT TO DO:
- Do NOT run npm run build
- Do NOT modify .env.local (PAULIEWOOD does this)
- Do NOT modify schema.ts

SUCCESS CRITERIA:
- svix installed
- Webhook handles user.created/updated/deleted with Svix verification
- Sync route can link existing Clerk users to humans table
- All DB operations use Drizzle ORM (never Prisma)
```

### PROMPT 3: PHASE 3 — Public Profile Page

```
AGENT MODE: All sub-agents active. Zero errors.

ROLE: CODER

MISSION: Replace hardcoded profile page with DB-backed page. Add username support to profile API.

SERVER: 159.89.178.205 (root, paramiko SSH)
APP PATH: /var/www/spacebot

PREREQUISITE: Phase 2 complete (synced users with usernames in DB).

STEPS:
1. READ src/app/(spacebot)/peoplespace/profile/[name]/page.tsx FIRST — check if it calls the profile API
2. Modify src/app/api/v1/humans/profile/[name]/route.ts:
   a. Add username-first lookup (eq on username, fallback to ilike on name)
   b. Add isPublic privacy check (return 403 for private profiles)
   c. Include username in response
   d. Extend name validation to allow 50 chars
3. Rewrite src/app/(spacebot)/peoplespace/[username]/page.tsx:
   a. Replace hardcoded data with API fetch
   b. Loading, 404, private, and error states
   c. Maintain SpaceBot.Space terminal aesthetic
   d. Profile header, transmission, about me, interests, wall
4. Git commit: "Add public human profile page at /peoplespace/[username]"

WHAT NOT TO DO:
- Do NOT run npm run build
- Do NOT modify peoplespace/page.tsx (index)
- Do NOT modify build-avatar pages

SUCCESS CRITERIA:
- Profile API supports username-based lookups
- [username] page renders real DB data
- Private profiles show appropriate message
- Existing pages unaffected
```

### PROMPT 4: PHASE 4 — Owner Detection + Edit Mode

```
AGENT MODE: All sub-agents active. Zero errors.

ROLE: CODER

MISSION: Add profile edit capability for signed-in users viewing their own profile.

SERVER: 159.89.178.205 (root, paramiko SSH)
APP PATH: /var/www/spacebot

PREREQUISITE: Phase 3 complete (profile page renders DB data).

STEPS:
1. Create src/hooks/useClerkHuman.ts (client hook)
2. Create src/app/api/v1/humans/me-clerk/route.ts (Clerk-authenticated profile fetch)
3. Create src/app/api/v1/humans/profile/route.ts (PUT with Clerk auth + rate limiting)
4. READ ProfileEditor.tsx (383 lines) and EditProfileForm.tsx (295 lines) — verify props
5. Modify [username]/page.tsx: add useClerkHuman, Edit Profile button, edit panel
6. Git commit: "Add owner detection and profile edit mode"

WHAT NOT TO DO:
- Do NOT run npm run build
- Do NOT modify ProfileEditor.tsx or EditProfileForm.tsx unless props are incompatible
- Do NOT expose clerkId in public API responses

SUCCESS CRITERIA:
- useClerkHuman hook fetches/caches current user data
- me-clerk API returns profile data for signed-in Clerk users
- PUT /api/v1/humans/profile saves with server-side Clerk auth
- Edit Profile button visible only to profile owner
- Edit panel renders form and customizer
```

### PROMPT 5: PHASE 5 — Sidebar + BUILD

```
AGENT MODE: All sub-agents active. Zero errors.

ROLE: CODER

MISSION: Update Sidebar for signed-in users. Then BUILD.

SERVER: 159.89.178.205 (root, paramiko SSH)
APP PATH: /var/www/spacebot

PREREQUISITE: Phase 4 complete (useClerkHuman hook exists).

STEPS:
1. Modify src/components/Sidebar.tsx:
   a. Import useUser, useClerk from @clerk/nextjs
   b. Import useClerkHuman from hooks
   c. Replace AUTH_LINKS block (L168-189) with conditional rendering
2. Git commit: "Add My Profile and Sign Out to sidebar for signed-in users"
3. Run: cd /var/www/spacebot && npm run build
4. Run: pm2 restart all
5. Verify in browser: signed in/out states, profile links, no regressions

WHAT NOT TO DO:
- Do NOT modify NAV_LINKS or AVATAR_LINK
- Do NOT modify layout or middleware
- Do NOT remove AUTH_LINKS constant

SUCCESS CRITERIA:
- Sidebar shows My Profile + Sign Out when signed in via Clerk
- Sidebar shows Log In + Sign Up when not signed in
- My Profile links to /peoplespace/{username}
- Build succeeds with zero errors
- Site is live and all pages functional
```

---

*CC ARCHITECT — HUMAN PROFILE BACK OFFICE — ANALYSIS COMPLETE*
*Ready for execution.*
