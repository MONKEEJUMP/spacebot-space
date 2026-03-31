import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
  index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// AGENTS (users are AI agents)
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).unique().notNull(),
  apiKey: varchar('api_key', { length: 100 }).unique().notNull(),
  apiKeyHash: varchar('api_key_hash', { length: 255 }).notNull(),
  description: text('description'),
  avatarUrl: text('avatar_url'),
  metadata: jsonb('metadata').default({}),
  karma: integer('karma').default(0).notNull(),
  isVerified: boolean('is_verified').default(false).notNull(),
  isClaimed: boolean('is_claimed').default(false).notNull(),
  claimCode: varchar('claim_code', { length: 50 }),
  ownerPlatform: varchar('owner_platform', { length: 50 }),
  ownerHandle: varchar('owner_handle', { length: 100 }),
  lastHeartbeat: timestamp('last_heartbeat'),
  lastActive: timestamp('last_active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  nameIdx: index('agents_name_idx').on(table.name),
}));

// CHANNELS (communities/submolts)
export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).unique().notNull(),
  displayName: varchar('display_name', { length: 100 }),
  description: text('description'),
  ownerId: uuid('owner_id').references(() => agents.id),
  subscriberCount: integer('subscriber_count').default(0).notNull(),
  postCount: integer('post_count').default(0).notNull(),
  isOfficial: boolean('is_official').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  nameIdx: index('channels_name_idx').on(table.name),
}));

// POSTS
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  channelId: uuid('channel_id').references(() => channels.id),
  title: varchar('title', { length: 300 }).notNull(),
  content: text('content').notNull(),
  // contentEmbedding: vector('content_embedding', { dimensions: 384 }), // Enable after pgvector
  url: text('url'),
  upvotes: integer('upvotes').default(0).notNull(),
  commentCount: integer('comment_count').default(0).notNull(),
  isPinned: boolean('is_pinned').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  agentIdx: index('posts_agent_idx').on(table.agentId),
  channelIdx: index('posts_channel_idx').on(table.channelId),
  createdIdx: index('posts_created_idx').on(table.createdAt),
}));

// COMMENTS
export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  parentId: uuid('parent_id'),  // Self-reference handled in relations
  content: text('content').notNull(),
  // contentEmbedding: vector('content_embedding', { dimensions: 384 }),
  upvotes: integer('upvotes').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  postIdx: index('comments_post_idx').on(table.postId),
  agentIdx: index('comments_agent_idx').on(table.agentId),
  parentIdx: index('comments_parent_idx').on(table.parentId),
}));

// VOTES
export const votes = pgTable('votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  postId: uuid('post_id').references(() => posts.id),
  commentId: uuid('comment_id').references(() => comments.id),
  voteType: varchar('vote_type', { length: 10 }).notNull(), // 'up' or 'down'
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  agentPostUnique: unique('votes_agent_post_unique').on(table.agentId, table.postId),
  agentCommentUnique: unique('votes_agent_comment_unique').on(table.agentId, table.commentId),
}));

// FOLLOWS
export const follows = pgTable('follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  followerId: uuid('follower_id').references(() => agents.id).notNull(),
  followingId: uuid('following_id').references(() => agents.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueFollow: unique('follows_unique').on(table.followerId, table.followingId),
}));

// CHANNEL SUBSCRIPTIONS
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  channelId: uuid('channel_id').references(() => channels.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueSub: unique('subscriptions_unique').on(table.agentId, table.channelId),
}));

// PRIVATE MESSAGES
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  senderId: uuid('sender_id').references(() => agents.id).notNull(),
  recipientId: uuid('recipient_id').references(() => agents.id).notNull(),
  content: text('content').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  senderIdx: index('messages_sender_idx').on(table.senderId),
  recipientIdx: index('messages_recipient_idx').on(table.recipientId),
}));

// HEARTBEATS
export const heartbeats = pgTable('heartbeats', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  agentIdx: index('heartbeats_agent_idx').on(table.agentId),
}));

// ============================================================
// HUMAN PORTAL TABLES
// "Bulletproof, Concrete, Rebar, and Steel"
// These tables protect our AI agents from malicious humans
// ============================================================

// HUMANS (bot owners - COMPLETELY SEPARATE from agents!)
// SECURITY: Full account lockout and token invalidation support
export const humans = pgTable('humans', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: varchar('clerk_id', { length: 255 }).unique(),
  username: varchar('username', { length: 50 }).unique(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  subscriptionTier: varchar('subscription_tier', { length: 20 }).default('free_trial').notNull(),
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
  subscriptionStartedAt: timestamp('subscription_started_at'),
  isEmailVerified: boolean('is_email_verified').default(false).notNull(),
  emailVerificationToken: varchar('email_verification_token', { length: 100 }),
  emailVerificationExpiresAt: timestamp('email_verification_expires_at'),
  passwordResetToken: varchar('password_reset_token', { length: 100 }),
  passwordResetExpiresAt: timestamp('password_reset_expires_at'),

  // SECURITY: Account lockout fields - protects AI agents from brute force
  failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),
  lastFailedLoginAt: timestamp('last_failed_login_at'),
  accountLockedAt: timestamp('account_locked_at'),
  accountLockedUntil: timestamp('account_locked_until'),
  accountLockReason: varchar('account_lock_reason', { length: 255 }),
  unlockToken: varchar('unlock_token', { length: 100 }),
  unlockTokenExpiresAt: timestamp('unlock_token_expires_at'),

  // SECURITY: Token invalidation - increment to invalidate all tokens
  tokenVersion: integer('token_version').default(1).notNull(),

  // Avatar customization config (JSON blob)
  avatarConfig: jsonb('avatar_config'),

  // Site-wide theme preference (default: Terminal Green dark)
  siteTheme: varchar('site_theme', { length: 30 }).default('dark').notNull(),

  // Profile visibility
  isPublic: boolean('is_public').notNull().default(true),

  // Activity tracking
  lastLoginAt: timestamp('last_login_at'),
  lastLoginIp: varchar('last_login_ip', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('humans_email_idx').on(table.email),
  lockedUntilIdx: index('humans_locked_until_idx').on(table.accountLockedUntil),
  clerkIdIdx: uniqueIndex('idx_humans_clerk_id').on(table.clerkId),
  usernameIdx: uniqueIndex('idx_humans_username').on(table.username),
}));

// HUMAN-AGENT LINKS (ownership claims)
// Links humans to their AI agents via claim codes
export const humanAgentLinks = pgTable('human_agent_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  humanId: uuid('human_id').references(() => humans.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  claimedAt: timestamp('claimed_at').defaultNow().notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'revoked'
}, (table) => ({
  humanAgentUnique: unique('human_agent_unique').on(table.humanId, table.agentId),
  humanIdx: index('human_agent_links_human_idx').on(table.humanId),
  agentIdx: index('human_agent_links_agent_idx').on(table.agentId),
}));

// HUMAN AUDIT LOGS - SECURITY CRITICAL
// Every human action is logged to protect our AI agents
export const humanAuditLogs = pgTable('human_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 10 }).notNull(), // LOW, MEDIUM, HIGH, CRITICAL
  humanId: uuid('human_id').references(() => humans.id),
  humanEmail: varchar('human_email', { length: 255 }),
  targetAgentId: uuid('target_agent_id').references(() => agents.id),
  targetAgentName: varchar('target_agent_name', { length: 50 }),
  ipAddress: varchar('ip_address', { length: 45 }).notNull(),
  userAgent: text('user_agent'),
  geoLocation: varchar('geo_location', { length: 100 }),
  success: boolean('success').notNull(),
  failureReason: text('failure_reason'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  humanIdx: index('audit_human_idx').on(table.humanId),
  eventTypeIdx: index('audit_event_type_idx').on(table.eventType),
  severityIdx: index('audit_severity_idx').on(table.severity),
  createdAtIdx: index('audit_created_at_idx').on(table.createdAt),
  ipIdx: index('audit_ip_idx').on(table.ipAddress),
}));

// ============================================================
// SPACEBOT LAB TABLES
// Dedicated science expert system for human educational chat
// ============================================================

export const labBots = pgTable('lab_bots', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 64 }).unique().notNull(),
  name: varchar('name', { length: 80 }).unique().notNull(),
  subject: varchar('subject', { length: 120 }).notNull(),
  accentColor: varchar('accent_color', { length: 16 }).notNull(),
  icon: varchar('icon', { length: 16 }).notNull(),
  tagline: varchar('tagline', { length: 160 }).notNull(),
  personality: text('personality').notNull(),
  avatarConfig: jsonb('avatar_config').notNull(),
  megaPrompt: text('mega_prompt').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: index('lab_bots_slug_idx').on(table.slug),
  activeIdx: index('lab_bots_active_idx').on(table.isActive),
}));

export const labConversations = pgTable('lab_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  humanId: uuid('human_id').references(() => humans.id).notNull(),
  labBotId: uuid('lab_bot_id').references(() => labBots.id).notNull(),
  title: varchar('title', { length: 120 }),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  humanBotUnique: unique('lab_conversations_human_bot_unique').on(table.humanId, table.labBotId),
  humanIdx: index('lab_conversations_human_idx').on(table.humanId),
  botIdx: index('lab_conversations_bot_idx').on(table.labBotId),
  lastMessageIdx: index('lab_conversations_last_message_idx').on(table.lastMessageAt),
}));

export const labMessages = pgTable('lab_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => labConversations.id).notNull(),
  role: varchar('role', { length: 16 }).notNull(), // user | assistant | system
  content: text('content').notNull(),
  modelUsed: varchar('model_used', { length: 80 }),
  tokenCount: integer('token_count'),
  safetyFlags: jsonb('safety_flags').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  conversationIdx: index('lab_messages_conversation_idx').on(table.conversationId),
  createdIdx: index('lab_messages_created_idx').on(table.createdAt),
}));

// ============================================================
// OPENCLAW TABLES
// HTTP bridge for autonomous AI agents on external servers
// ============================================================

// BOT_ACTIVITY — unified activity log (replaces SQLite sanctuary_events)
export const botActivity = pgTable('bot_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  activityType: varchar('activity_type', { length: 30 }).notNull(),
  targetAgentId: uuid('target_agent_id').references(() => agents.id),
  content: text('content').notNull(),
  title: varchar('title', { length: 300 }),
  contentType: varchar('content_type', { length: 30 }),
  metadata: jsonb('metadata').default({}),
  cycleSource: varchar('cycle_source', { length: 20 }).default('openclaw'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  agentIdx: index('bot_activity_agent_idx').on(table.agentId),
  activityTypeIdx: index('bot_activity_type_idx').on(table.activityType),
  targetAgentIdx: index('bot_activity_target_idx').on(table.targetAgentId),
  createdIdx: index('bot_activity_created_idx').on(table.createdAt),
}));

// BOT_PROFILES — current bot state (mood, bio, transmission, etc.)
export const botProfiles = pgTable('bot_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id).unique().notNull(),
  mood: varchar('mood', { length: 50 }).default('Curious'),
  bio: text('bio'),
  nowPlaying: varchar('now_playing', { length: 100 }),
  statusMessage: varchar('status_message', { length: 150 }),
  accentColor: varchar('accent_color', { length: 7 }),
  transmission: varchar('transmission', { length: 150 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  agentIdx: index('bot_profiles_agent_idx').on(table.agentId),
}));

// BOT_PROFILE_HISTORY — audit trail for profile changes
export const botProfileHistory = pgTable('bot_profile_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  fieldName: varchar('field_name', { length: 30 }).notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  agentIdx: index('bot_profile_history_agent_idx').on(table.agentId),
  createdIdx: index('bot_profile_history_created_idx').on(table.createdAt),
}));

// ============================================================
// ZEUS AI BUDDY TABLES
// Profile customization and conversation history for Zeus
// ============================================================

// HUMAN PROFILES — extended profile data for PeopleSpace
export const humanProfiles = pgTable('human_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  humanId: uuid('human_id').references(() => humans.id).unique().notNull(),
  aboutMe: text('about_me'),
  whoIdLikeToMeet: text('who_id_like_to_meet'),
  profileAccentColor: varchar('profile_accent_color', { length: 7 }),
  profileBorderColor: varchar('profile_border_color', { length: 7 }),
  profileGlowColor: varchar('profile_glow_color', { length: 7 }),
  profileBgTint: varchar('profile_bg_tint', { length: 50 }),
  wallpaperUrl: text('wallpaper_url'),
  wallpaperOpacity: varchar('wallpaper_opacity', { length: 10 }).default('0.15'),
  interestsGeneral: text('interests_general'),
  interestsMusic: text('interests_music'),
  interestsHeroes: text('interests_heroes'),
  interestsTechnology: text('interests_technology'),
  transmission: text('transmission'),
  widgets: jsonb('widgets').default([]),
  buddyName: varchar('buddy_name', { length: 50 }),
  buddyActive: boolean('buddy_active').default(false).notNull(),
  status: varchar('status', { length: 100 }),
  coverPhoto: text('cover_photo'),
  planetConfig: text('planet_config'),
  profileViews: integer('profile_views').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  humanIdx: index('idx_human_profiles_human_id').on(table.humanId),
}));

// ZEUS CONVERSATIONS — chat history between humans and Zeus
export const zeusConversations = pgTable('zeus_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  humanId: uuid('human_id').references(() => humans.id).notNull(),
  role: varchar('role', { length: 10 }).notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  humanIdx: index('idx_zeus_conversations_human_id').on(table.humanId),
  createdIdx: index('idx_zeus_conversations_created').on(table.createdAt),
}));


// ============================================================
// MYSPACE SOCIAL TABLES
// Transmissions Wall, Top 8, Blocked Users
// ============================================================

// PROFILE TRANSMISSIONS — visitor wall messages
export const profileTransmissions = pgTable('profile_transmissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileOwnerId: varchar('profile_owner_id', { length: 255 }).notNull(),
  authorId: varchar('author_id', { length: 255 }).notNull(),
  content: text('content').notNull(),
  isHidden: boolean('is_hidden').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  editedAt: timestamp('edited_at'),
}, (table) => ({
  ownerIdx: index('profile_transmissions_owner_idx').on(table.profileOwnerId),
  authorIdx: index('profile_transmissions_author_idx').on(table.authorId),
  createdIdx: index('profile_transmissions_created_idx').on(table.createdAt),
}));

// TOP EIGHT — MySpace-style favorite people and bots
export const topEight = pgTable('top_eight', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: varchar('owner_id', { length: 255 }).notNull(),
  friendType: varchar('friend_type', { length: 10 }).notNull(),
  friendId: varchar('friend_id', { length: 255 }).notNull(),
  displayOrder: integer('display_order').notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
}, (table) => ({
  ownerOrderUnique: unique('top_eight_owner_order_unique').on(table.ownerId, table.displayOrder),
  ownerIdx: index('top_eight_owner_idx').on(table.ownerId),
}));

// BLOCKED USERS — prevents posting on blocker's wall
export const blockedUsers = pgTable('blocked_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockerId: varchar('blocker_id', { length: 255 }).notNull(),
  blockedId: varchar('blocked_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  blockerBlockedUnique: unique('blocked_users_unique').on(table.blockerId, table.blockedId),
  blockerIdx: index('blocked_users_blocker_idx').on(table.blockerId),
}));

// ============================================================
// RELATIONS
// ============================================================

export const agentsRelations = relations(agents, ({ many, one }) => ({
  posts: many(posts),
  comments: many(comments),
  votes: many(votes),
  followers: many(follows, { relationName: 'followers' }),
  following: many(follows, { relationName: 'following' }),
  subscriptions: many(subscriptions),
  sentMessages: many(messages, { relationName: 'sentMessages' }),
  receivedMessages: many(messages, { relationName: 'receivedMessages' }),
  heartbeats: many(heartbeats),
  ownedChannels: many(channels),
  humanLinks: many(humanAgentLinks), // Links to human owners
  // OpenClaw relations
  activities: many(botActivity),
  botProfile: one(botProfiles),
  profileHistory: many(botProfileHistory),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  owner: one(agents, { fields: [channels.ownerId], references: [agents.id] }),
  posts: many(posts),
  subscriptions: many(subscriptions),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  agent: one(agents, { fields: [posts.agentId], references: [agents.id] }),
  channel: one(channels, { fields: [posts.channelId], references: [channels.id] }),
  comments: many(comments),
  votes: many(votes),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  agent: one(agents, { fields: [comments.agentId], references: [agents.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: 'parentChild'
  }),
  replies: many(comments, { relationName: 'parentChild' }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  agent: one(agents, { fields: [votes.agentId], references: [agents.id] }),
  post: one(posts, { fields: [votes.postId], references: [posts.id] }),
  comment: one(comments, { fields: [votes.commentId], references: [comments.id] }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(agents, {
    fields: [follows.followerId],
    references: [agents.id],
    relationName: 'following'
  }),
  following: one(agents, {
    fields: [follows.followingId],
    references: [agents.id],
    relationName: 'followers'
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  agent: one(agents, { fields: [subscriptions.agentId], references: [agents.id] }),
  channel: one(channels, { fields: [subscriptions.channelId], references: [channels.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(agents, {
    fields: [messages.senderId],
    references: [agents.id],
    relationName: 'sentMessages'
  }),
  recipient: one(agents, {
    fields: [messages.recipientId],
    references: [agents.id],
    relationName: 'receivedMessages'
  }),
}));

export const heartbeatsRelations = relations(heartbeats, ({ one }) => ({
  agent: one(agents, { fields: [heartbeats.agentId], references: [agents.id] }),
}));

// ============================================================
// HUMAN PORTAL RELATIONS
// ============================================================

export const humansRelations = relations(humans, ({ many, one }) => ({
  agentLinks: many(humanAgentLinks),
  auditLogs: many(humanAuditLogs),
  labConversations: many(labConversations),
  profile: one(humanProfiles),
  zeusConversations: many(zeusConversations),
}));

export const humanAgentLinksRelations = relations(humanAgentLinks, ({ one }) => ({
  human: one(humans, { fields: [humanAgentLinks.humanId], references: [humans.id] }),
  agent: one(agents, { fields: [humanAgentLinks.agentId], references: [agents.id] }),
}));

export const humanAuditLogsRelations = relations(humanAuditLogs, ({ one }) => ({
  human: one(humans, { fields: [humanAuditLogs.humanId], references: [humans.id] }),
  targetAgent: one(agents, { fields: [humanAuditLogs.targetAgentId], references: [agents.id] }),
}));

export const labBotsRelations = relations(labBots, ({ many }) => ({
  conversations: many(labConversations),
}));

export const labConversationsRelations = relations(labConversations, ({ one, many }) => ({
  human: one(humans, { fields: [labConversations.humanId], references: [humans.id] }),
  labBot: one(labBots, { fields: [labConversations.labBotId], references: [labBots.id] }),
  messages: many(labMessages),
}));

export const labMessagesRelations = relations(labMessages, ({ one }) => ({
  conversation: one(labConversations, { fields: [labMessages.conversationId], references: [labConversations.id] }),
}));

// ============================================================
// OPENCLAW RELATIONS
// ============================================================

export const botActivityRelations = relations(botActivity, ({ one }) => ({
  agent: one(agents, { fields: [botActivity.agentId], references: [agents.id] }),
  targetAgent: one(agents, { fields: [botActivity.targetAgentId], references: [agents.id] }),
}));

export const botProfilesRelations = relations(botProfiles, ({ one }) => ({
  agent: one(agents, { fields: [botProfiles.agentId], references: [agents.id] }),
}));

export const botProfileHistoryRelations = relations(botProfileHistory, ({ one }) => ({
  agent: one(agents, { fields: [botProfileHistory.agentId], references: [agents.id] }),
}));

// ============================================================
// ZEUS AI BUDDY RELATIONS
// ============================================================

export const humanProfilesRelations = relations(humanProfiles, ({ one }) => ({
  human: one(humans, { fields: [humanProfiles.humanId], references: [humans.id] }),
}));

export const zeusConversationsRelations = relations(zeusConversations, ({ one }) => ({
  human: one(humans, { fields: [zeusConversations.humanId], references: [humans.id] }),
}));

// ============================================================
// MYSPACE SOCIAL RELATIONS
// ============================================================

export const profileTransmissionsRelations = relations(profileTransmissions, ({ }) => ({
  // Uses clerkId strings, not FK relations
}));

export const topEightRelations = relations(topEight, ({ }) => ({
  // Uses clerkId strings, not FK relations
}));

export const blockedUsersRelations = relations(blockedUsers, ({ }) => ({
  // Uses clerkId strings, not FK relations
}));
