# TypeScript Error Triage — Cross-Agent Audit Round 2

**Generated:** 2026-04-11 (Agent D Round 2)
**Command:** `npx tsc --noEmit` from `/var/www/spacebot`
**Total errors:** 27
**Unique files:** 20

## Summary by Agent Ownership

| Agent | Errors | Files | Notes |
|-------|--------|-------|-------|
| Agent C | 1 | 1 | Round 2 — personality/next.config/layout edits in-flight |
| Agent UNOWNED | 26 | 19 | Neither owned by any agent — existing codebase debt |

## Detailed Breakdown

### Agent C

**`src/app/layout.tsx`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 79 | 10 | TS2786 | 'ClerkProvider' cannot be used as a JSX component. |

### Agent UNOWNED

**`src/app/(spacebot)/peoplespace/build-avatar/page.tsx`** (3 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 1340 | 52 | TS2345 | Argument of type 'string' is not assignable to parameter of type '() => number'. |
| 1341 | 54 | TS2339 | Property 'colorIndex' does not exist on type 'RobotConfig'. |
| 1344 | 43 | TS2339 | Property 'colorIndex' does not exist on type 'RobotConfig'. |

**`src/app/(spacebot)/peoplespace/build-avatar/preview/page.tsx`** (2 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 173 | 11 | TS2322 | Type 'RefObject<HTMLCanvasElement \| null>' is not assignable to type 'LegacyRef<HTMLCanvasElement> \| undefined'. |
| 177 | 11 | TS2322 | Type 'RefObject<HTMLCanvasElement \| null>' is not assignable to type 'LegacyRef<HTMLCanvasElement> \| undefined'. |

**`src/app/(spacebot)/peoplespace/profile/[name]/page.tsx`** (2 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 737 | 40 | TS2339 | Property 'agent' does not exist on type 'FeedPost'. |
| 737 | 71 | TS2339 | Property 'agent' does not exist on type 'FeedPost'. |

**`src/app/(unprotected)/page.tsx`** (2 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 50 | 8 | TS2786 | 'AgentStrip' cannot be used as a JSX component. |
| 51 | 8 | TS2786 | 'FeaturedContent' cannot be used as a JSX component. |

**`src/app/api/v1/avatar/generate/route.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 130 | 61 | TS2339 | Property 'base64DataUri' does not exist on type 'void'. |

**`src/app/api/v1/buddy/bio/route.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 63 | 43 | TS2769 | No overload matches this call. |

**`src/app/api/v1/buddy/interests/route.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 75 | 43 | TS2769 | No overload matches this call. |

**`src/app/api/v1/buddy/theme/route.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 121 | 43 | TS2769 | No overload matches this call. |

**`src/app/api/v1/humans/login/route.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 26 | 20 | TS7016 | Could not find a declaration file for module 'bcryptjs'. '/var/www/spacebot/node_modules/bcryptjs/index.js' implicitly has an 'any' type. |

**`src/app/api/v1/humans/register/route.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 13 | 20 | TS7016 | Could not find a declaration file for module 'bcryptjs'. '/var/www/spacebot/node_modules/bcryptjs/index.js' implicitly has an 'any' type. |

**`src/app/api/v1/humans/simple-login/route.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 21 | 20 | TS7016 | Could not find a declaration file for module 'bcryptjs'. '/var/www/spacebot/node_modules/bcryptjs/index.js' implicitly has an 'any' type. |

**`src/components/avatar/AvatarGenerator.tsx`** (2 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 114 | 9 | TS4104 | The type 'readonly string[]' is 'readonly' and cannot be assigned to the mutable type 'string[]'. |
| 115 | 9 | TS4104 | The type 'readonly string[]' is 'readonly' and cannot be assigned to the mutable type 'string[]'. |

**`src/components/lab/LabChatWindow.tsx`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 300 | 9 | TS2322 | Type '(message: string) => void' is not assignable to type '(message: string) => Promise<void>'. |

**`src/components/profile/Top8Grid.tsx`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 242 | 11 | TS2322 | Type '(newEntries: Top8Entry[]) => Promise<void>' is not assignable to type '(entries: Top8Entry[]) => void'. |

**`src/hooks/useLikeUnlikeComments.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 2 | 42 | TS2307 | Cannot find module './mutations/useCommentLikesMutations' or its corresponding type declarations. |

**`src/hooks/useUpdateDeleteComments.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 3 | 49 | TS2307 | Cannot find module './mutations/useUpdateDeleteCommentMutations' or its corresponding type declarations. |

**`src/lib/lab/lab-bots.ts`** (2 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 292 | 22 | TS1360 | Type 'readonly [{ readonly slug: "cosmo-sage"; readonly name: "COSMO-SAGE"; readonly subject: "Space & Astronomy"; readonly accentColor: ... |
| 294 | 14 | TS2322 | Type 'readonly [{ readonly slug: "cosmo-sage"; readonly name: "COSMO-SAGE"; readonly subject: "Space & Astronomy"; readonly accentColor: ... |

**`src/lib/security/api-keys.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 9 | 20 | TS7016 | Could not find a declaration file for module 'bcryptjs'. '/var/www/spacebot/node_modules/bcryptjs/index.js' implicitly has an 'any' type. |

**`src/lib/security/human-auth.ts`** (1 errors)

| Line | Col | Code | Message |
|------|-----|------|---------|
| 13 | 20 | TS7016 | Could not find a declaration file for module 'bcryptjs'. '/var/www/spacebot/node_modules/bcryptjs/index.js' implicitly has an 'any' type. |

## Agent D Self-Check

✅ **Agent D files (schema.ts, drizzle.config.ts) have 0 TS errors.**

## Methodology

1. Ran `npx tsc --noEmit` from the app directory.
2. Parsed tsc stdout with regex `^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$`.
3. Classified each error by file path prefix against the Round 2 ownership map.
4. UNOWNED = existing codebase errors that no current agent owns.

## Raw Error File

Full unparsed tsc output captured at: `/tmp/ts_errors.txt`
