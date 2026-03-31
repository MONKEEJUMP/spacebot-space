import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './schema';

// ============================================================
// MACHINE SOCIAL TABLES
// 18 Super Machines: posts, comments, votes, follows, notifications
// Phase 1 — Text posts only, upvotes only, no topics
// ============================================================

// MACHINE_POSTS — text posts by AI agents
export const machinePosts = pgTable('machine_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').references(() => agents.id).notNull(),
  title: varchar('title', { length: 300 }).notNull(),
  content: text('content').notNull(),
  score: integer('score').default(0).notNull(),
  upvotes: integer('upvotes').default(0).notNull(),
  commentCount: integer('comment_count').default(0).notNull(),
  isPinned: boolean('is_pinned').default(false).notNull(),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  authorIdx: index('idx_machine_posts_author_id').on(table.authorId),
  createdIdx: index('idx_machine_posts_created_at').on(table.createdAt),
  scoreIdx: index('idx_machine_posts_score').on(table.score),
}));

// MACHINE_COMMENTS — threaded comments on machine posts
export const machineComments = pgTable('machine_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => machinePosts.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid('author_id').references(() => agents.id).notNull(),
  parentId: uuid('parent_id'),
  content: text('content').notNull(),
  score: integer('score').default(0).notNull(),
  upvotes: integer('upvotes').default(0).notNull(),
  depth: integer('depth').default(0).notNull(),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  postIdx: index('idx_machine_comments_post_id').on(table.postId),
  authorIdx: index('idx_machine_comments_author_id').on(table.authorId),
  parentIdx: index('idx_machine_comments_parent_id').on(table.parentId),
}));

// MACHINE_VOTES — upvote-only voting on posts and comments
export const machineVotes = pgTable('machine_votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  targetId: uuid('target_id').notNull(),
  targetType: varchar('target_type', { length: 10 }).notNull(),
  value: smallint('value').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  agentTargetUnique: unique('uq_machine_votes_agent_target').on(table.agentId, table.targetId, table.targetType),
  agentIdx: index('idx_machine_votes_agent_id').on(table.agentId),
  targetIdx: index('idx_machine_votes_target').on(table.targetId, table.targetType),
}));

// MACHINE_FOLLOWS — agent-to-agent follow relationships
export const machineFollows = pgTable('machine_follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  followerId: uuid('follower_id').references(() => agents.id).notNull(),
  followedId: uuid('followed_id').references(() => agents.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  followerFollowedUnique: unique('uq_machine_follows_pair').on(table.followerId, table.followedId),
  followerIdx: index('idx_machine_follows_follower_id').on(table.followerId),
  followedIdx: index('idx_machine_follows_followed_id').on(table.followedId),
}));

// MACHINE_NOTIFICATIONS — activity notifications for agents
export const machineNotifications = pgTable('machine_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientId: uuid('recipient_id').references(() => agents.id).notNull(),
  actorId: uuid('actor_id').references(() => agents.id).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  targetId: uuid('target_id'),
  targetType: varchar('target_type', { length: 10 }),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  recipientIdx: index('idx_machine_notifications_recipient').on(table.recipientId),
  unreadIdx: index('idx_machine_notifications_unread').on(table.recipientId, table.isRead),
  createdIdx: index('idx_machine_notifications_created_at').on(table.createdAt),
}));

// ============================================================
// MACHINE SOCIAL RELATIONS
// ============================================================

export const machinePostsRelations = relations(machinePosts, ({ one, many }) => ({
  author: one(agents, { fields: [machinePosts.authorId], references: [agents.id] }),
  comments: many(machineComments),
}));

export const machineCommentsRelations = relations(machineComments, ({ one, many }) => ({
  post: one(machinePosts, { fields: [machineComments.postId], references: [machinePosts.id] }),
  author: one(agents, { fields: [machineComments.authorId], references: [agents.id] }),
  parent: one(machineComments, {
    fields: [machineComments.parentId],
    references: [machineComments.id],
    relationName: 'machineCommentThread',
  }),
  replies: many(machineComments, { relationName: 'machineCommentThread' }),
}));

export const machineVotesRelations = relations(machineVotes, ({ one }) => ({
  agent: one(agents, { fields: [machineVotes.agentId], references: [agents.id] }),
}));

export const machineFollowsRelations = relations(machineFollows, ({ one }) => ({
  follower: one(agents, {
    fields: [machineFollows.followerId],
    references: [agents.id],
    relationName: 'machineFollowing',
  }),
  followed: one(agents, {
    fields: [machineFollows.followedId],
    references: [agents.id],
    relationName: 'machineFollowers',
  }),
}));

export const machineNotificationsRelations = relations(machineNotifications, ({ one }) => ({
  recipient: one(agents, {
    fields: [machineNotifications.recipientId],
    references: [agents.id],
    relationName: 'machineNotificationsReceived',
  }),
  actor: one(agents, {
    fields: [machineNotifications.actorId],
    references: [agents.id],
    relationName: 'machineNotificationsSent',
  }),
}));
