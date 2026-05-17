import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  smallint,
  boolean,
  real,
  integer,
  index,
} from "drizzle-orm/pg-core";

// ============================================================
// AiSpace Ticker Tables
// ============================================================

export const tickerHeadlines = pgTable(
  "ticker_headlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    sourceName: varchar("source_name", { length: 100 }).notNull(),
    sourceId: varchar("source_id", { length: 50 }).notNull(),
    articleUrl: text("article_url").notNull().unique(),
    category: varchar("category", { length: 30 }).notNull().default("industry"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceTier: smallint("source_tier").notNull().default(3),
    isBreaking: boolean("is_breaking").notNull().default(false),
    heatScore: real("heat_score").notNull().default(0),
    compositeScore: real("composite_score").notNull().default(0),
    clusterId: uuid("cluster_id"),
    thumbnailUrl: text("thumbnail_url"),
    isActive: boolean("is_active").notNull().default(true),
    // NewsSpace AI Editor columns
    editorStatus: text("editor_status").default("pending"),
    editorApproved: boolean("editor_approved").default(false),
    tileSize: text("tile_size"),
    editorNote: text("editor_note"),
    editorModel: text("editor_model"),
    editorAttempts: smallint("editor_attempts").default(0),
    editorReviewedAt: timestamp("editor_reviewed_at", { withTimezone: true }),
    editorError: text("editor_error"),
  },
  (table) => ({
    activeScoreIdx: index("idx_ticker_active_score").on(
      table.isActive,
      table.compositeScore
    ),
    fetchedIdx: index("idx_ticker_fetched").on(table.fetchedAt),
    urlIdx: index("idx_ticker_url").on(table.articleUrl),
    categoryIdx: index("idx_ticker_category").on(
      table.category,
      table.isActive
    ),
  })
);

export const tickerSourceHealth = pgTable("ticker_source_health", {
  sourceId: varchar("source_id", { length: 50 }).primaryKey(),
  sourceName: varchar("source_name", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("healthy"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  consecutiveFailures: smallint("consecutive_failures").notNull().default(0),
  totalFetches: integer("total_fetches").notNull().default(0),
  totalFailures: integer("total_failures").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
