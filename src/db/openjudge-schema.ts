import {
  pgTable,
  uuid,
  text,
  real,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const botScores = pgTable('bot_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  botId: text('bot_id').notNull(),
  query: text('query').notNull(),
  responseSnippet: text('response_snippet').notNull(),
  relevanceScore: real('relevance_score').notNull(),
  hallucinationScore: real('hallucination_score').notNull(),
  overallScore: real('overall_score').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  botIdIdx: index('bot_scores_bot_id_idx').on(table.botId),
  createdIdx: index('bot_scores_created_idx').on(table.createdAt),
}));
