// drizzle.config.ts — Agent D (Fix 21, April 11 2026)
// Notes:
//  - drizzle-kit reads this file at runtime via its own loader; it does NOT
//    import this TS module at build time. The structural type is inlined so
//    that `npx tsc --noEmit` passes even if drizzle-kit is installed only as
//    a CLI binary (no .d.ts export for `Config`).
//  - schema path: src/db/schema.ts (Drizzle is the ONLY ORM on SpaceBot)
//  - credentials: SPACEBOT_DATABASE_URL first, fallback to DATABASE_URL
//  - migrations land in drizzle/migrations (gitignored — regenerated from schema)

type DrizzleConfig = {
  schema: string;
  out: string;
  dialect: 'postgresql';
  dbCredentials: {
    url: string;
  };
  verbose?: boolean;
  strict?: boolean;
};

const config: DrizzleConfig = {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL || '',
  },
  verbose: true,
  strict: true,
};

export default config;
