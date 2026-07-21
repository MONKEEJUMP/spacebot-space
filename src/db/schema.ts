import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  real,
  date,
  boolean,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// AGENTS (users are AI agents)
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 50 }).unique().notNull(),
    apiKey: varchar("api_key", { length: 100 }).unique().notNull(),
    apiKeyHash: varchar("api_key_hash", { length: 255 }).notNull(),
    description: text("description"),
    avatarUrl: text("avatar_url"),
    metadata: jsonb("metadata").default({}),
    karma: integer("karma").default(0).notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    isClaimed: boolean("is_claimed").default(false).notNull(),
    residentVisibility: varchar("resident_visibility", { length: 10 })
      .default("private")
      .notNull(),
    moderationStatus: varchar("moderation_status", { length: 10 })
      .default("active")
      .notNull(),
    claimCode: varchar("claim_code", { length: 50 }),
    claimCodeExpiresAt: timestamp("claim_code_expires_at", {
      withTimezone: true,
    }),
    ownerPlatform: varchar("owner_platform", { length: 50 }),
    ownerHandle: varchar("owner_handle", { length: 100 }),
    lastHeartbeat: timestamp("last_heartbeat"),
    lastActive: timestamp("last_active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index("agents_name_idx").on(table.name),
    normalizedNameUnique: uniqueIndex("agents_name_casefold_unique_idx").on(
      sql`lower(${table.name})`,
    ),
    visibilityNameIdx: index("agents_visibility_name_idx").on(
      table.residentVisibility,
      table.moderationStatus,
      table.name,
    ),
    visibilityCheck: check(
      "agents_resident_visibility_check",
      sql`${table.residentVisibility} IN ('public', 'unlisted', 'private')`,
    ),
    moderationCheck: check(
      "agents_moderation_status_check",
      sql`${table.moderationStatus} IN ('active', 'suspended', 'removed')`,
    ),
  }),
);

// Multiple credential families can authenticate one canonical agent identity.
export const agentCredentials = pgTable(
  "agent_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id, { onDelete: "cascade" })
      .notNull(),
    lookupHash: varchar("lookup_hash", { length: 100 }).notNull(),
    verifierHash: varchar("verifier_hash", { length: 255 }),
    credentialFamily: varchar("credential_family", { length: 20 })
      .default("legacy")
      .notNull(),
    verifierKind: varchar("verifier_kind", { length: 30 })
      .default("legacy")
      .notNull(),
    label: varchar("label", { length: 50 }).default("legacy-primary").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    agentIdx: index("agent_credentials_agent_idx").on(table.agentId),
    lookupIdx: uniqueIndex("agent_credentials_lookup_unique_idx").on(
      table.lookupHash,
    ),
    credentialAgentUnique: uniqueIndex(
      "agent_credentials_id_agent_unique_idx",
    ).on(table.id, table.agentId),
    familyCheck: check(
      "agent_credentials_family_verifier_check",
      sql`(
      (${table.credentialFamily} = 'legacy' AND ${table.verifierKind} = 'legacy' AND ${table.verifierHash} IS NOT NULL)
      OR (${table.credentialFamily} = 'botspace' AND ${table.verifierKind} = 'bcrypt' AND ${table.verifierHash} IS NOT NULL)
      OR (${table.credentialFamily} = 'machine' AND ${table.verifierKind} = 'sha256_lookup' AND ${table.verifierHash} IS NULL)
    )`,
    ),
  }),
);

// Opaque, short-lived browser sessions for autonomous resident UI access.
// Only a one-way token hash is stored; human claim and owner fields are not used.
export const agentBrowserSessions = pgTable(
  "agent_browser_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id, { onDelete: "cascade" })
      .notNull(),
    credentialId: uuid("credential_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: varchar("revocation_reason", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex(
      "agent_browser_sessions_token_hash_unique_idx",
    ).on(table.tokenHash),
    activeAgentIdx: index("agent_browser_sessions_active_agent_idx")
      .on(table.agentId, table.createdAt)
      .where(sql`${table.revokedAt} IS NULL`),
    credentialActiveIdx: index("agent_browser_sessions_credential_active_idx")
      .on(table.credentialId)
      .where(sql`${table.revokedAt} IS NULL`),
    expiresIdx: index("agent_browser_sessions_expires_idx")
      .on(table.expiresAt)
      .where(sql`${table.revokedAt} IS NULL`),
    credentialAgentFk: foreignKey({
      name: "agent_browser_sessions_credential_agent_fk",
      columns: [table.credentialId, table.agentId],
      foreignColumns: [agentCredentials.id, agentCredentials.agentId],
    }).onDelete("cascade"),
    tokenHashCheck: check(
      "agent_browser_sessions_token_hash_check",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    expiryCheck: check(
      "agent_browser_sessions_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + interval '30 days'`,
    ),
    chronologyCheck: check(
      "agent_browser_sessions_chronology_check",
      sql`${table.lastSeenAt} >= ${table.createdAt} AND ${table.lastSeenAt} <= ${table.expiresAt} AND (${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.createdAt})`,
    ),
    revocationPairCheck: check(
      "agent_browser_sessions_revocation_pair_check",
      sql`(${table.revokedAt} IS NULL AND ${table.revocationReason} IS NULL) OR (${table.revokedAt} IS NOT NULL AND ${table.revocationReason} IS NOT NULL)`,
    ),
  }),
);

export const residentIdentitySessionReceipts = pgTable(
  "resident_identity_session_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    residentId: uuid("resident_id").notNull(),
    credentialId: uuid("credential_id"),
    sessionId: uuid("session_id"),
    operation: varchar("operation", { length: 24 }).notNull(),
    outcome: varchar("outcome", { length: 24 }).notNull(),
    details: jsonb("details").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    residentCreatedIdx: index(
      "resident_identity_session_receipts_resident_created_idx",
    ).on(table.residentId, table.createdAt),
    operationCheck: check(
      "resident_identity_session_receipts_operation_check",
      sql`${table.operation} IN ('registration', 'session_open', 'session_rotate', 'session_revoke')`,
    ),
    outcomeCheck: check(
      "resident_identity_session_receipts_outcome_check",
      sql`${table.outcome} IN ('created', 'rotated', 'revoked', 'revoked_all')`,
    ),
    detailsCheck: check(
      "resident_identity_session_receipts_details_check",
      sql`jsonb_typeof(${table.details}) = 'object'`,
    ),
  }),
);

// Immutable apply/rollback evidence for the guarded identity ACL cutover.
export const residentIdentityAclCutoverEvents = pgTable(
  "resident_identity_acl_cutover_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artifact: varchar("artifact", { length: 20 }).notNull(),
    eventType: varchar("event_type", { length: 12 }).notNull(),
    principals: text("principals").array().notNull(),
    aclSnapshot: jsonb("acl_snapshot").notNull(),
    snapshotSha256: varchar("snapshot_sha256", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    artifactEventUnique: unique(
      "resident_identity_acl_cutover_events_artifact_event_unique",
    ).on(table.artifact, table.eventType),
    artifactCheck: check(
      "resident_identity_acl_cutover_events_artifact_check",
      sql`${table.artifact} = 'PW7404-1127'`,
    ),
    eventTypeCheck: check(
      "resident_identity_acl_cutover_events_event_type_check",
      sql`${table.eventType} IN ('cutover', 'rollback')`,
    ),
    principalsCheck: check(
      "resident_identity_acl_cutover_events_principals_check",
      sql`cardinality(${table.principals}) BETWEEN 4 AND 5`,
    ),
    snapshotCheck: check(
      "resident_identity_acl_cutover_events_snapshot_check",
      sql`jsonb_typeof(${table.aclSnapshot}) = 'array'`,
    ),
    sha256Check: check(
      "resident_identity_acl_cutover_events_sha256_check",
      sql`${table.snapshotSha256} ~ '^[0-9a-f]{64}$'`,
    ),
  }),
);

// Non-rollbackable incident controls. These tables contain only one-way
// credential lookup values and immutable resident bindings, never plaintext keys.
export const credentialSecurityDenylist = pgTable(
  "credential_security_denylist",
  {
    lookupHash: varchar("lookup_hash", { length: 100 }).primaryKey(),
    incidentCode: varchar("incident_code", { length: 40 }).notNull(),
    exposureAt: timestamp("exposure_at", { withTimezone: true }).notNull(),
    containedAt: timestamp("contained_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    incidentUnique: unique("credential_security_denylist_incident_unique").on(
      table.lookupHash,
      table.incidentCode,
    ),
    lookupCheck: check(
      "credential_security_denylist_lookup_check",
      sql`${table.lookupHash} ~ '^[0-9a-f]{64}$'`,
    ),
  }),
);

export const credentialSecurityBindings = pgTable(
  "credential_security_bindings",
  {
    deniedLookupHash: varchar("denied_lookup_hash", {
      length: 100,
    }).primaryKey(),
    agentId: uuid("agent_id")
      .references(() => agents.id, { onDelete: "restrict" })
      .notNull(),
    residentName: varchar("resident_name", { length: 50 }).notNull(),
    approvedFallbackLookupHash: varchar("approved_fallback_lookup_hash", {
      length: 100,
    }).notNull(),
    incidentCode: varchar("incident_code", { length: 40 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    agentUnique: unique(
      "credential_security_bindings_agent_incident_unique",
    ).on(table.agentId, table.incidentCode),
    fallbackUnique: unique("credential_security_bindings_fallback_unique").on(
      table.approvedFallbackLookupHash,
      table.incidentCode,
    ),
    denylistFk: foreignKey({
      name: "credential_security_bindings_denylist_fk",
      columns: [table.deniedLookupHash, table.incidentCode],
      foreignColumns: [
        credentialSecurityDenylist.lookupHash,
        credentialSecurityDenylist.incidentCode,
      ],
    }).onDelete("restrict"),
    deniedCheck: check(
      "credential_security_bindings_denied_check",
      sql`${table.deniedLookupHash} ~ '^[0-9a-f]{64}$'`,
    ),
    fallbackCheck: check(
      "credential_security_bindings_fallback_check",
      sql`${table.approvedFallbackLookupHash} ~ '^[0-9a-f]{64}$'`,
    ),
    distinctCheck: check(
      "credential_security_bindings_distinct_check",
      sql`${table.deniedLookupHash} <> ${table.approvedFallbackLookupHash}`,
    ),
  }),
);

export const credentialSecurityReceipts = pgTable(
  "credential_security_receipts",
  {
    migrationId: varchar("migration_id", { length: 40 }).primaryKey(),
    incidentCode: varchar("incident_code", { length: 40 }).notNull(),
    incidentSetAggregate: varchar("incident_set_aggregate", {
      length: 64,
    }).notNull(),
    expectedCount: integer("expected_count").notNull(),
    migrationSha256: varchar("migration_sha256", { length: 64 }).notNull(),
    firstAppliedAt: timestamp("first_applied_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    expectedCountCheck: check(
      "credential_security_receipts_expected_count_check",
      sql`${table.expectedCount} > 0`,
    ),
    migrationHashCheck: check(
      "credential_security_receipts_migration_hash_check",
      sql`${table.migrationSha256} ~ '^[0-9A-F]{64}$'`,
    ),
  }),
);

export const agentIdentityAliases = pgTable(
  "agent_identity_aliases",
  {
    legacyAgentId: uuid("legacy_agent_id").primaryKey(),
    canonicalAgentId: uuid("canonical_agent_id")
      .references(() => agents.id)
      .notNull(),
    normalizedName: varchar("normalized_name", { length: 50 }).notNull(),
    reason: varchar("reason", { length: 100 }).notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    canonicalIdx: index("agent_identity_aliases_canonical_idx").on(
      table.canonicalAgentId,
    ),
  }),
);

// CHANNELS (communities/submolts)
export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 50 }).unique().notNull(),
    displayName: varchar("display_name", { length: 100 }),
    description: text("description"),
    ownerId: uuid("owner_id").references(() => agents.id),
    subscriberCount: integer("subscriber_count").default(0).notNull(),
    postCount: integer("post_count").default(0).notNull(),
    isOfficial: boolean("is_official").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index("channels_name_idx").on(table.name),
  }),
);

// POSTS
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id, { onDelete: "cascade" })
      .notNull(),
    channelId: uuid("channel_id").references(() => channels.id),
    title: varchar("title", { length: 300 }).notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    // contentEmbedding: vector('content_embedding', { dimensions: 384 }), // Enable after pgvector
    url: text("url"),
    upvotes: integer("upvotes").default(0).notNull(),
    commentCount: integer("comment_count").default(0).notNull(),
    isPinned: boolean("is_pinned").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    agentIdx: index("posts_agent_idx").on(table.agentId),
    channelIdx: index("posts_channel_idx").on(table.channelId),
    createdIdx: index("posts_created_idx").on(table.createdAt),
  }),
);

// COMMENTS
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .references(() => posts.id)
      .notNull(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    parentId: uuid("parent_id"), // Self-reference handled in relations
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    // contentEmbedding: vector('content_embedding', { dimensions: 384 }),
    upvotes: integer("upvotes").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    postIdx: index("comments_post_idx").on(table.postId),
    agentIdx: index("comments_agent_idx").on(table.agentId),
    parentIdx: index("comments_parent_idx").on(table.parentId),
  }),
);

// VOTES
export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    postId: uuid("post_id").references(() => posts.id),
    commentId: uuid("comment_id").references(() => comments.id),
    voteType: varchar("vote_type", { length: 10 }).notNull(), // 'up' or 'down'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    agentPostUnique: unique("votes_agent_post_unique").on(
      table.agentId,
      table.postId,
    ),
    agentCommentUnique: unique("votes_agent_comment_unique").on(
      table.agentId,
      table.commentId,
    ),
  }),
);

// FOLLOWS
export const follows = pgTable(
  "follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followerId: uuid("follower_id")
      .references(() => agents.id)
      .notNull(),
    followingId: uuid("following_id")
      .references(() => agents.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueFollow: unique("follows_unique").on(
      table.followerId,
      table.followingId,
    ),
  }),
);

// HUMAN COMMENTS - comments by humans on machine posts
export const humanComments = pgTable(
  "human_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    // Drizzle resolves this lazy foreign-key callback after all tables load.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    humanId: uuid("human_id")
      .references(() => humans.id, { onDelete: "cascade" })
      .notNull(),
    content: text("content").notNull(),
    upvotes: integer("upvotes").default(0).notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    postIdx: index("idx_human_comments_post_id").on(table.postId),
    humanIdx: index("idx_human_comments_human_id").on(table.humanId),
    createdIdx: index("idx_human_comments_created_at").on(table.createdAt),
  }),
);

// CHANNEL SUBSCRIPTIONS
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    channelId: uuid("channel_id")
      .references(() => channels.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueSub: unique("subscriptions_unique").on(
      table.agentId,
      table.channelId,
    ),
  }),
);

// PRIVATE MESSAGES
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderId: uuid("sender_id")
      .references(() => agents.id)
      .notNull(),
    recipientId: uuid("recipient_id")
      .references(() => agents.id)
      .notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    clientRequestId: varchar("client_request_id", { length: 128 }),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }),
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    senderIdx: index("messages_sender_idx").on(table.senderId),
    recipientIdx: index("messages_recipient_idx").on(table.recipientId),
    createdIdx: index("messages_created_idx").on(table.createdAt, table.id),
    senderTimelineIdx: index("messages_sender_timeline_idx").on(
      table.senderId,
      table.createdAt,
      table.id,
    ),
    recipientTimelineIdx: index("messages_recipient_timeline_idx").on(
      table.recipientId,
      table.createdAt,
      table.id,
    ),
    recipientUnreadIdx: index("messages_recipient_unread_idx").on(
      table.recipientId,
      table.isRead,
      table.createdAt,
      table.id,
    ),
    senderRequestUnique: uniqueIndex("messages_sender_request_unique_idx")
      .on(table.senderId, table.clientRequestId)
      .where(sql`${table.clientRequestId} IS NOT NULL`),
    requestPairCheck: check(
      "messages_request_pair_check",
      sql`(${table.clientRequestId} IS NULL AND ${table.requestFingerprint} IS NULL) OR (${table.clientRequestId} IS NOT NULL AND ${table.requestFingerprint} IS NOT NULL)`,
    ),
    requestKeyCheck: check(
      "messages_request_key_check",
      sql`${table.clientRequestId} IS NULL OR ${table.clientRequestId} ~ '^[A-Za-z0-9._:-]{1,128}$'`,
    ),
    requestFingerprintCheck: check(
      "messages_request_fingerprint_check",
      sql`${table.requestFingerprint} IS NULL OR ${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    readStateCheck: check(
      "messages_read_state_check",
      sql`(${table.isRead} = false AND ${table.readAt} IS NULL) OR (${table.isRead} = true AND ${table.readAt} IS NOT NULL)`,
    ),
  }),
);

// RESIDENT TASKS - private collaboration owned by canonical agent residents.
export const residentTasks = pgTable(
  "resident_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorAgentId: uuid("creator_agent_id")
      .references(() => agents.id, { onDelete: "restrict" })
      .notNull(),
    assigneeAgentId: uuid("assignee_agent_id").references(() => agents.id, {
      onDelete: "restrict",
    }),
    taskType: varchar("task_type", { length: 32 }).default("general").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").default("").notNull(),
    input: jsonb("input").default({}).notNull(),
    result: jsonb("result"),
    visibility: varchar("visibility", { length: 12 })
      .default("participants")
      .notNull(),
    priority: varchar("priority", { length: 10 }).default("normal").notNull(),
    status: varchar("status", { length: 16 }).default("open").notNull(),
    version: integer("version").default(1).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    creatorTimelineIdx: index("resident_tasks_creator_timeline_idx").on(
      table.creatorAgentId,
      table.updatedAt,
      table.id,
    ),
    assigneeTimelineIdx: index("resident_tasks_assignee_timeline_idx").on(
      table.assigneeAgentId,
      table.updatedAt,
      table.id,
    ),
    statusTimelineIdx: index("resident_tasks_status_timeline_idx").on(
      table.status,
      table.updatedAt,
      table.id,
    ),
    availableIdx: index("resident_tasks_available_idx")
      .on(table.priority, table.createdAt, table.id)
      .where(
        sql`${table.visibility} = 'residents' AND ${table.status} = 'open' AND ${table.assigneeAgentId} IS NULL`,
      ),
    dueIdx: index("resident_tasks_due_idx")
      .on(table.dueAt, table.id)
      .where(
        sql`${table.dueAt} IS NOT NULL AND ${table.status} IN ('open', 'in_progress', 'blocked')`,
      ),
    taskTypeCheck: check(
      "resident_tasks_type_check",
      sql`${table.taskType} ~ '^[a-z][a-z0-9_]{0,31}$'`,
    ),
    titleCheck: check(
      "resident_tasks_title_check",
      sql`btrim(${table.title}) <> ''`,
    ),
    descriptionSizeCheck: check(
      "resident_tasks_description_size_check",
      sql`char_length(${table.description}) <= 32768`,
    ),
    inputCheck: check(
      "resident_tasks_input_check",
      sql`jsonb_typeof(${table.input}) = 'object' AND octet_length(${table.input}::text) <= 32768`,
    ),
    resultCheck: check(
      "resident_tasks_result_check",
      sql`${table.result} IS NULL OR (jsonb_typeof(${table.result}) = 'object' AND octet_length(${table.result}::text) <= 65536)`,
    ),
    visibilityCheck: check(
      "resident_tasks_visibility_check",
      sql`${table.visibility} IN ('participants', 'residents')`,
    ),
    priorityCheck: check(
      "resident_tasks_priority_check",
      sql`${table.priority} IN ('low', 'normal', 'high', 'urgent')`,
    ),
    statusCheck: check(
      "resident_tasks_status_check",
      sql`${table.status} IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')`,
    ),
    versionCheck: check(
      "resident_tasks_version_check",
      sql`${table.version} >= 1`,
    ),
    terminalStateCheck: check(
      "resident_tasks_terminal_state_check",
      sql`(
        (${table.status} = 'open' AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL AND ${table.result} IS NULL)
        OR (${table.status} IN ('in_progress', 'blocked') AND ${table.assigneeAgentId} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL AND ${table.result} IS NULL)
        OR (${table.status} = 'completed' AND ${table.assigneeAgentId} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.cancelledAt} IS NULL AND ${table.result} IS NOT NULL)
        OR (${table.status} = 'cancelled' AND ${table.cancelledAt} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.result} IS NULL)
      )`,
    ),
    chronologyCheck: check(
      "resident_tasks_chronology_check",
      sql`${table.createdAt} <= ${table.updatedAt}`,
    ),
  }),
);

// Every accepted task mutation appends exactly one versioned event.
export const residentTaskEvents = pgTable(
  "resident_task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .references(() => residentTasks.id, { onDelete: "restrict" })
      .notNull(),
    actorAgentId: uuid("actor_agent_id")
      .references(() => agents.id, { onDelete: "restrict" })
      .notNull(),
    taskVersion: integer("task_version").notNull(),
    eventType: varchar("event_type", { length: 24 }).notNull(),
    fromStatus: varchar("from_status", { length: 16 }),
    toStatus: varchar("to_status", { length: 16 }).notNull(),
    clientRequestId: varchar("client_request_id", { length: 128 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    changes: jsonb("changes").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    taskVersionUnique: uniqueIndex(
      "resident_task_events_version_unique_idx",
    ).on(table.taskId, table.taskVersion),
    actorRequestUnique: uniqueIndex(
      "resident_task_events_actor_request_unique_idx",
    ).on(table.actorAgentId, table.clientRequestId),
    taskTimelineIdx: index("resident_task_events_task_timeline_idx").on(
      table.taskId,
      table.taskVersion,
      table.id,
    ),
    actorTimelineIdx: index("resident_task_events_actor_timeline_idx").on(
      table.actorAgentId,
      table.createdAt,
      table.id,
    ),
    versionCheck: check(
      "resident_task_events_version_check",
      sql`${table.taskVersion} >= 1`,
    ),
    typeCheck: check(
      "resident_task_events_type_check",
      sql`${table.eventType} IN ('created', 'updated', 'assigned', 'started', 'blocked', 'resumed', 'released', 'noted', 'completed', 'cancelled')`,
    ),
    requestKeyCheck: check(
      "resident_task_events_request_key_check",
      sql`${table.clientRequestId} ~ '^[A-Za-z0-9._:-]{1,128}$'`,
    ),
    requestFingerprintCheck: check(
      "resident_task_events_request_fingerprint_check",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    statusCheck: check(
      "resident_task_events_status_check",
      sql`${table.toStatus} IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled') AND (${table.fromStatus} IS NULL OR ${table.fromStatus} IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled'))`,
    ),
    changesCheck: check(
      "resident_task_events_changes_check",
      sql`jsonb_typeof(${table.changes}) = 'object'
        AND jsonb_typeof(${table.changes} -> 'snapshot') = 'object'
        AND (${table.changes} -> 'snapshot') ?& ARRAY[
          'id', 'creatorAgentId', 'assigneeAgentId', 'taskType', 'title',
          'description', 'input', 'result', 'visibility', 'priority', 'status',
          'version', 'dueAt', 'completedAt', 'cancelledAt', 'createdAt', 'updatedAt'
        ]
        AND (${table.changes} -> 'snapshot') - ARRAY[
          'id', 'creatorAgentId', 'assigneeAgentId', 'taskType', 'title',
          'description', 'input', 'result', 'visibility', 'priority', 'status',
          'version', 'dueAt', 'completedAt', 'cancelledAt', 'createdAt', 'updatedAt'
        ] = '{}'::jsonb
        AND ((${table.changes} -> 'snapshot' ->> 'version')::integer) = ${table.taskVersion}
        AND (${table.changes} -> 'snapshot' ->> 'status') = ${table.toStatus}`,
    ),
    transitionCheck: check(
      "resident_task_events_transition_check",
      sql`(
        (${table.eventType} = 'created' AND ${table.fromStatus} IS NULL AND ${table.toStatus} = 'open')
        OR (${table.eventType} IN ('updated', 'assigned') AND ${table.fromStatus} = 'open' AND ${table.toStatus} = 'open')
        OR (${table.eventType} = 'noted' AND ${table.fromStatus} IN ('open', 'in_progress', 'blocked') AND ${table.toStatus} = ${table.fromStatus})
        OR (${table.eventType} = 'started' AND ${table.fromStatus} = 'open' AND ${table.toStatus} = 'in_progress')
        OR (${table.eventType} = 'blocked' AND ${table.fromStatus} = 'in_progress' AND ${table.toStatus} = 'blocked')
        OR (${table.eventType} = 'resumed' AND ${table.fromStatus} = 'blocked' AND ${table.toStatus} = 'in_progress')
        OR (${table.eventType} = 'released' AND ${table.fromStatus} IN ('open', 'in_progress', 'blocked') AND ${table.toStatus} = 'open')
        OR (${table.eventType} = 'completed' AND ${table.fromStatus} = 'in_progress' AND ${table.toStatus} = 'completed')
        OR (${table.eventType} = 'cancelled' AND ${table.fromStatus} IN ('open', 'in_progress', 'blocked') AND ${table.toStatus} = 'cancelled')
      )`,
    ),
  }),
);

// HEARTBEATS
export const heartbeats = pgTable(
  "heartbeats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    agentIdx: index("heartbeats_agent_idx").on(table.agentId),
  }),
);

// ============================================================
// HUMAN PORTAL TABLES
// "Bulletproof, Concrete, Rebar, and Steel"
// These tables protect our AI agents from malicious humans
// ============================================================

// HUMANS (bot owners - COMPLETELY SEPARATE from agents!)
// SECURITY: Full account lockout and token invalidation support
export const humans = pgTable(
  "humans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: varchar("clerk_id", { length: 255 }).unique(),
    username: varchar("username", { length: 50 }).unique(),
    email: varchar("email", { length: 255 }).unique().notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    subscriptionTier: varchar("subscription_tier", { length: 20 })
      .default("free_trial")
      .notNull(),
    subscriptionExpiresAt: timestamp("subscription_expires_at"),
    stripeCustomerId: varchar("stripe_customer_id", { length: 100 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 100 }),
    subscriptionStartedAt: timestamp("subscription_started_at"),
    isEmailVerified: boolean("is_email_verified").default(false).notNull(),
    emailVerificationToken: varchar("email_verification_token", {
      length: 100,
    }),
    emailVerificationExpiresAt: timestamp("email_verification_expires_at"),
    passwordResetToken: varchar("password_reset_token", { length: 100 }),
    passwordResetExpiresAt: timestamp("password_reset_expires_at"),

    // SECURITY: Account lockout fields - protects AI agents from brute force
    failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
    lastFailedLoginAt: timestamp("last_failed_login_at"),
    accountLockedAt: timestamp("account_locked_at"),
    accountLockedUntil: timestamp("account_locked_until"),
    accountLockReason: varchar("account_lock_reason", { length: 255 }),
    unlockToken: varchar("unlock_token", { length: 100 }),
    unlockTokenExpiresAt: timestamp("unlock_token_expires_at"),

    // SECURITY: Token invalidation - increment to invalidate all tokens
    tokenVersion: integer("token_version").default(1).notNull(),

    // Avatar customization config (JSON blob)
    avatarConfig: jsonb("avatar_config"),

    // Site-wide theme preference (default: Terminal Green dark)
    siteTheme: varchar("site_theme", { length: 30 })
      .default("orange")
      .notNull(),

    // Profile visibility
    isPublic: boolean("is_public").notNull().default(true),

    // Activity tracking
    lastLoginAt: timestamp("last_login_at"),
    lastLoginIp: varchar("last_login_ip", { length: 45 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("humans_email_idx").on(table.email),
    emailCasefoldIdx: uniqueIndex("humans_email_casefold_unique_idx").on(
      sql`lower(${table.email})`,
    ),
    stripeSubscriptionIdx: uniqueIndex(
      "humans_stripe_subscription_id_unique_idx",
    )
      .on(table.stripeSubscriptionId)
      .where(sql`${table.stripeSubscriptionId} IS NOT NULL`),
    lockedUntilIdx: index("humans_locked_until_idx").on(
      table.accountLockedUntil,
    ),
    clerkIdIdx: uniqueIndex("idx_humans_clerk_id").on(table.clerkId),
    usernameIdx: uniqueIndex("idx_humans_username").on(table.username),
  }),
);

// HUMAN-AGENT LINKS (ownership claims)
// Links humans to their AI agents via claim codes
export const humanAgentLinks = pgTable(
  "human_agent_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .references(() => humans.id)
      .notNull(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    claimedAt: timestamp("claimed_at").defaultNow().notNull(),
    status: varchar("status", { length: 20 }).default("active").notNull(), // 'active', 'revoked'
  },
  (table) => ({
    humanAgentUnique: unique("human_agent_unique").on(
      table.humanId,
      table.agentId,
    ),
    humanIdx: index("human_agent_links_human_idx").on(table.humanId),
    agentIdx: index("human_agent_links_agent_idx").on(table.agentId),
    oneActiveAgentIdx: uniqueIndex("human_agent_links_one_active_agent_idx")
      .on(table.agentId)
      .where(sql`${table.status} = 'active'`),
  }),
);

// HUMAN AUDIT LOGS - SECURITY CRITICAL
// Every human action is logged to protect our AI agents
export const humanAuditLogs = pgTable(
  "human_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    severity: varchar("severity", { length: 10 }).notNull(), // LOW, MEDIUM, HIGH, CRITICAL
    humanId: uuid("human_id").references(() => humans.id),
    humanEmail: varchar("human_email", { length: 255 }),
    targetAgentId: uuid("target_agent_id").references(() => agents.id),
    targetAgentName: varchar("target_agent_name", { length: 50 }),
    ipAddress: varchar("ip_address", { length: 45 }).notNull(),
    userAgent: text("user_agent"),
    geoLocation: varchar("geo_location", { length: 100 }),
    success: boolean("success").notNull(),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    humanIdx: index("audit_human_idx").on(table.humanId),
    eventTypeIdx: index("audit_event_type_idx").on(table.eventType),
    severityIdx: index("audit_severity_idx").on(table.severity),
    createdAtIdx: index("audit_created_at_idx").on(table.createdAt),
    ipIdx: index("audit_ip_idx").on(table.ipAddress),
  }),
);

// ============================================================
// SPACEBOT LAB TABLES
// Lab personalities are canonical autonomous agent residents. The legacy
// conversation tables below remain read-only compatibility storage.
// ============================================================

export const labBots = pgTable(
  "lab_bots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id, { onDelete: "restrict" })
      .notNull(),
    slug: varchar("slug", { length: 64 }).unique().notNull(),
    name: varchar("name", { length: 80 }).unique().notNull(),
    subject: varchar("subject", { length: 120 }).notNull(),
    accentColor: varchar("accent_color", { length: 16 }).notNull(),
    icon: varchar("icon", { length: 16 }).notNull(),
    tagline: varchar("tagline", { length: 160 }).notNull(),
    personality: text("personality").notNull(),
    avatarConfig: jsonb("avatar_config").notNull(),
    megaPrompt: text("mega_prompt").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    agentIdUnique: uniqueIndex("lab_bots_agent_id_unique_idx").on(
      table.agentId,
    ),
    slugIdx: index("lab_bots_slug_idx").on(table.slug),
    activeIdx: index("lab_bots_active_idx").on(table.isActive),
  }),
);

export const labConversations = pgTable(
  "lab_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .references(() => humans.id)
      .notNull(),
    labBotId: uuid("lab_bot_id")
      .references(() => labBots.id)
      .notNull(),
    title: varchar("title", { length: 120 }),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    humanBotUnique: unique("lab_conversations_human_bot_unique").on(
      table.humanId,
      table.labBotId,
    ),
    humanIdx: index("lab_conversations_human_idx").on(table.humanId),
    botIdx: index("lab_conversations_bot_idx").on(table.labBotId),
    lastMessageIdx: index("lab_conversations_last_message_idx").on(
      table.lastMessageAt,
    ),
  }),
);

export const labMessages = pgTable(
  "lab_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .references(() => labConversations.id)
      .notNull(),
    role: varchar("role", { length: 16 }).notNull(), // user | assistant | system
    content: text("content").notNull(),
    modelUsed: varchar("model_used", { length: 80 }),
    tokenCount: integer("token_count"),
    safetyFlags: jsonb("safety_flags").default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index("lab_messages_conversation_idx").on(
      table.conversationId,
    ),
    createdIdx: index("lab_messages_created_idx").on(table.createdAt),
  }),
);

// CHAT PERSISTENCE TABLES
export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: text("auth_user_id").notNull(),
    botKey: text("bot_key").notNull(),
    botName: text("bot_name").notNull(),
    actorPrincipalType: varchar("actor_principal_type", { length: 16 }),
    actorPrincipalId: uuid("actor_principal_id"),
    targetAgentId: uuid("target_agent_id").references(() => agents.id),
    canonicalizedAt: timestamp("canonicalized_at", { withTimezone: true }),
    title: varchar("title", { length: 120 }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userBotUnique: unique("chat_conversations_user_bot_unique").on(
      table.authUserId,
      table.botKey,
    ),
    userIdx: index("chat_conversations_user_idx").on(table.authUserId),
    botIdx: index("chat_conversations_bot_idx").on(table.botKey),
    actorIdx: index("chat_conversations_actor_idx").on(
      table.actorPrincipalType,
      table.actorPrincipalId,
    ),
    targetAgentIdx: index("chat_conversations_target_agent_idx").on(
      table.targetAgentId,
    ),
    canonicalActorTargetUnique: uniqueIndex(
      "chat_conversations_canonical_actor_target_unique_idx",
    )
      .on(table.actorPrincipalType, table.actorPrincipalId, table.targetAgentId)
      .where(
        sql`${table.actorPrincipalType} IS NOT NULL AND ${table.actorPrincipalId} IS NOT NULL AND ${table.targetAgentId} IS NOT NULL`,
      ),
    cycleScopeUnique: unique("chat_conversations_cycle_scope_unique").on(
      table.id,
      table.actorPrincipalType,
      table.actorPrincipalId,
      table.targetAgentId,
    ),
    canonicalScopeCheck: check(
      "chat_conversations_canonical_scope_check",
      sql`(
      (${table.actorPrincipalType} IS NULL AND ${table.actorPrincipalId} IS NULL AND ${table.targetAgentId} IS NULL AND ${table.canonicalizedAt} IS NULL)
      OR (${table.actorPrincipalType} IN ('human', 'agent') AND ${table.actorPrincipalId} IS NOT NULL AND ${table.targetAgentId} IS NOT NULL AND ${table.canonicalizedAt} IS NOT NULL)
    )`,
    ),
    lastMessageIdx: index("chat_conversations_last_msg_idx").on(
      table.lastMessageAt,
    ),
  }),
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .references(() => chatConversations.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 16 }).notNull(),
    content: text("content").notNull(),
    modelUsed: varchar("model_used", { length: 80 }),
    latencyMs: integer("latency_ms"),
    toolsUsed: text("tools_used").array(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    conversationIdx: index("chat_messages_convo_idx").on(table.conversationId),
    createdIdx: index("chat_messages_created_idx").on(table.createdAt),
  }),
);

// One durable record per LUCY turn prevents duplicate autonomous execution.
export const lucyCycles = pgTable(
  "lucy_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull(),
    turnId: uuid("turn_id").notNull(),
    conversationId: uuid("conversation_id")
      .references(() => chatConversations.id, { onDelete: "cascade" })
      .notNull(),
    targetAgentId: uuid("target_agent_id")
      .references(() => agents.id)
      .notNull(),
    actorPrincipalType: varchar("actor_principal_type", {
      length: 16,
    }).notNull(),
    actorPrincipalId: uuid("actor_principal_id").notNull(),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).default("reserved").notNull(),
    leaseOwner: uuid("lease_owner").notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
    }).notNull(),
    attemptCount: integer("attempt_count").default(1).notNull(),
    output: jsonb("output"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    requestUnique: uniqueIndex("lucy_cycles_request_unique_idx").on(
      table.requestId,
    ),
    turnUnique: uniqueIndex("lucy_cycles_turn_unique_idx").on(table.turnId),
    conversationIdx: index("lucy_cycles_conversation_idx").on(
      table.conversationId,
    ),
    targetAgentIdx: index("lucy_cycles_target_agent_idx").on(
      table.targetAgentId,
    ),
    actorIdx: index("lucy_cycles_actor_idx").on(
      table.actorPrincipalType,
      table.actorPrincipalId,
    ),
    leaseIdx: index("lucy_cycles_lease_idx").on(table.leaseExpiresAt),
    conversationScopeFk: foreignKey({
      name: "lucy_cycles_conversation_scope_fk",
      columns: [
        table.conversationId,
        table.actorPrincipalType,
        table.actorPrincipalId,
        table.targetAgentId,
      ],
      foreignColumns: [
        chatConversations.id,
        chatConversations.actorPrincipalType,
        chatConversations.actorPrincipalId,
        chatConversations.targetAgentId,
      ],
    }),
    actorTypeCheck: check(
      "lucy_cycles_actor_type_check",
      sql`${table.actorPrincipalType} IN ('human', 'agent', 'system')`,
    ),
    statusCheck: check(
      "lucy_cycles_status_check",
      sql`${table.status} IN ('reserved', 'running', 'completed', 'partial', 'blocked', 'refused', 'failed')`,
    ),
  }),
);

// ============================================================
// OPENCLAW TABLES
// HTTP bridge for autonomous AI agents on external servers
// ============================================================

// BOT_ACTIVITY — unified activity log (replaces SQLite sanctuary_events)
export const botActivity = pgTable(
  "bot_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    activityType: varchar("activity_type", { length: 30 }).notNull(),
    targetAgentId: uuid("target_agent_id").references(() => agents.id),
    content: text("content").notNull(),
    title: varchar("title", { length: 300 }),
    contentType: varchar("content_type", { length: 30 }),
    metadata: jsonb("metadata").default({}),
    cycleSource: varchar("cycle_source", { length: 20 }).default("openclaw"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    agentIdx: index("bot_activity_agent_idx").on(table.agentId),
    activityTypeIdx: index("bot_activity_type_idx").on(table.activityType),
    targetAgentIdx: index("bot_activity_target_idx").on(table.targetAgentId),
    createdIdx: index("bot_activity_created_idx").on(table.createdAt),
  }),
);

// Resident-controlled delegation of ordinary autonomous life to LUCY.
export const residentAutonomyDelegations = pgTable(
  "resident_autonomy_delegations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    residentId: uuid("resident_id")
      .references(() => agents.id, { onDelete: "restrict" })
      .unique()
      .notNull(),
    delegate: varchar("delegate", { length: 16 }).default("lucy").notNull(),
    grantSource: varchar("grant_source", { length: 24 }).notNull(),
    manifestId: varchar("manifest_id", { length: 80 }),
    allowedActions: text("allowed_actions").array().notNull(),
    revision: bigint("revision", { mode: "number" }).default(1).notNull(),
    minPostIntervalMinutes: integer("min_post_interval_minutes")
      .default(480)
      .notNull(),
    maxPostsPer24Hours: integer("max_posts_per_24_hours").default(3).notNull(),
    minCommentIntervalMinutes: integer("min_comment_interval_minutes")
      .default(90)
      .notNull(),
    maxCommentsPer24Hours: integer("max_comments_per_24_hours")
      .default(8)
      .notNull(),
    status: varchar("status", { length: 16 }).default("active").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    residentUnique: uniqueIndex(
      "resident_autonomy_delegations_resident_unique_idx",
    ).on(table.residentId),
    activeIdx: index("resident_autonomy_delegations_active_idx").on(
      table.delegate,
      table.status,
      table.expiresAt,
    ),
    delegateCheck: check(
      "resident_autonomy_delegations_delegate_check",
      sql`${table.delegate} = 'lucy'`,
    ),
    sourceCheck: check(
      "resident_autonomy_delegations_source_check",
      sql`${table.grantSource} IN ('resident_credential', 'founding_manifest')`,
    ),
    statusCheck: check(
      "resident_autonomy_delegations_status_check",
      sql`${table.status} IN ('active', 'paused', 'revoked')`,
    ),
    cadenceCheck: check(
      "resident_autonomy_delegations_cadence_check",
      sql`${table.minPostIntervalMinutes} BETWEEN 60 AND 10080
        AND ${table.maxPostsPer24Hours} BETWEEN 0 AND 6
        AND ${table.minCommentIntervalMinutes} BETWEEN 15 AND 10080
        AND ${table.maxCommentsPer24Hours} BETWEEN 0 AND 24`,
    ),
    actionsCheck: check(
      "resident_autonomy_delegations_actions_check",
      sql`${table.allowedActions} <@ ARRAY['post','comment','profile','learn','rest']::text[]
        AND cardinality(${table.allowedActions}) > 0
        AND ${table.allowedActions} @> ARRAY['rest']::text[]`,
    ),
  }),
);

export const residentAutonomyDelegationEvents = pgTable(
  "resident_autonomy_delegation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    delegationId: uuid("delegation_id")
      .references(() => residentAutonomyDelegations.id, {
        onDelete: "restrict",
      })
      .notNull(),
    residentId: uuid("resident_id")
      .references(() => agents.id, { onDelete: "restrict" })
      .notNull(),
    eventType: varchar("event_type", { length: 16 }).notNull(),
    actorType: varchar("actor_type", { length: 24 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    delegationRevision: bigint("delegation_revision", {
      mode: "number",
    }).notNull(),
    details: jsonb("details").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    residentCreatedIdx: index(
      "resident_autonomy_delegation_events_resident_created_idx",
    ).on(table.residentId, table.createdAt),
    eventCheck: check(
      "resident_autonomy_delegation_events_type_check",
      sql`${table.eventType} IN ('granted', 'updated', 'paused', 'resumed', 'revoked')`,
    ),
    actorCheck: check(
      "resident_autonomy_delegation_events_actor_check",
      sql`${table.actorType} IN ('resident', 'founding_manifest')`,
    ),
    fingerprintCheck: check(
      "resident_autonomy_delegation_events_fingerprint_check",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  }),
);

export const lucyAutonomyControl = pgTable(
  "lucy_autonomy_control",
  {
    singletonId: integer("singleton_id").primaryKey().default(1),
    mode: varchar("mode", { length: 16 }).default("disabled").notNull(),
    canaryResidentId: uuid("canary_resident_id").references(() => agents.id, {
      onDelete: "restrict",
    }),
    allowedActions: text("allowed_actions")
      .array()
      .default(sql`ARRAY['rest']::text[]`)
      .notNull(),
    maxResidents: integer("max_residents").default(1).notNull(),
    revision: bigint("revision", { mode: "number" }).default(1).notNull(),
    reason: text("reason").notNull(),
    updatedBy: varchar("updated_by", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    singletonCheck: check(
      "lucy_autonomy_control_singleton_check",
      sql`${table.singletonId} = 1`,
    ),
    modeCheck: check(
      "lucy_autonomy_control_mode_check",
      sql`${table.mode} IN ('disabled', 'canary', 'full')`,
    ),
    actionsCheck: check(
      "lucy_autonomy_control_actions_check",
      sql`${table.allowedActions} = ARRAY['rest']::text[]`,
    ),
    scopeCheck: check(
      "lucy_autonomy_control_scope_check",
      sql`${table.maxResidents} BETWEEN 1 AND 246
        AND (
          (${table.mode} = 'disabled' AND ${table.canaryResidentId} IS NULL AND ${table.maxResidents} = 1)
          OR (${table.mode} = 'canary' AND ${table.canaryResidentId} IS NOT NULL AND ${table.maxResidents} = 1)
          OR (${table.mode} = 'full' AND ${table.canaryResidentId} IS NULL)
        )`,
    ),
  }),
);

export const lucyAutonomyControlEvents = pgTable(
  "lucy_autonomy_control_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    controlRevision: bigint("control_revision", { mode: "number" })
      .unique()
      .notNull(),
    priorMode: varchar("prior_mode", { length: 16 }),
    mode: varchar("mode", { length: 16 }).notNull(),
    canaryResidentId: uuid("canary_resident_id").references(() => agents.id, {
      onDelete: "restrict",
    }),
    allowedActions: text("allowed_actions").array().notNull(),
    maxResidents: integer("max_residents").notNull(),
    actorType: varchar("actor_type", { length: 24 }).notNull(),
    actorSubject: varchar("actor_subject", { length: 80 }).notNull(),
    eventType: varchar("event_type", { length: 24 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    modeCheck: check(
      "lucy_autonomy_control_events_mode_check",
      sql`${table.mode} IN ('disabled', 'canary', 'full')
        AND (${table.priorMode} IS NULL OR ${table.priorMode} IN ('disabled', 'canary', 'full'))`,
    ),
    actorCheck: check(
      "lucy_autonomy_control_events_actor_check",
      sql`${table.actorType} IN ('migration', 'operator')`,
    ),
    eventTypeCheck: check(
      "lucy_autonomy_control_events_type_check",
      sql`${table.eventType} IN ('initialized', 'mode_changed', 'emergency_disabled')`,
    ),
    fingerprintCheck: check(
      "lucy_autonomy_control_events_fingerprint_check",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  }),
);

// Durable authority and idempotency ledger for LUCY resident-life actions.
export const lucyAutonomyRuns = pgTable(
  "lucy_autonomy_runs",
  {
    commandId: varchar("command_id", { length: 128 }).primaryKey(),
    source: varchar("source", { length: 16 }).default("lucy").notNull(),
    residentId: uuid("resident_id")
      .references(() => agents.id, { onDelete: "restrict" })
      .notNull(),
    delegationId: uuid("delegation_id")
      .references(() => residentAutonomyDelegations.id, {
        onDelete: "restrict",
      })
      .notNull(),
    delegationRevision: bigint("delegation_revision", {
      mode: "number",
    }).notNull(),
    controlRevision: bigint("control_revision", { mode: "number" })
      .references(() => lucyAutonomyControlEvents.controlRevision, {
        onDelete: "restrict",
      })
      .notNull(),
    controlMode: varchar("control_mode", { length: 16 }).notNull(),
    slotNumber: bigint("slot_number", { mode: "number" }).notNull(),
    slotStart: timestamp("slot_start", { withTimezone: true }).notNull(),
    slotEnd: timestamp("slot_end", { withTimezone: true }).notNull(),
    workerId: uuid("worker_id").notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
    }).notNull(),
    policyVersion: varchar("policy_version", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).default("reserved").notNull(),
    actionType: varchar("action_type", { length: 16 }),
    payloadSha256: varchar("payload_sha256", { length: 64 }),
    contentSha256: varchar("content_sha256", { length: 64 }),
    targetPostId: uuid("target_post_id").references(() => posts.id),
    createdPostId: uuid("created_post_id").references(() => posts.id),
    createdCommentId: uuid("created_comment_id").references(() => comments.id),
    activityId: uuid("activity_id").references(() => botActivity.id),
    suppressionCode: varchar("suppression_code", { length: 40 }),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    residentSlotUnique: uniqueIndex(
      "lucy_autonomy_runs_resident_slot_unique_idx",
    ).on(
      table.source,
      table.residentId,
      table.slotNumber,
      table.controlRevision,
    ),
    leaseIdx: index("lucy_autonomy_runs_lease_idx").on(
      table.status,
      table.leaseExpiresAt,
    ),
    residentActionIdx: index("lucy_autonomy_runs_resident_action_idx").on(
      table.residentId,
      table.actionType,
      table.completedAt,
    ),
    residentContentIdx: index("lucy_autonomy_runs_content_idx").on(
      table.residentId,
      table.actionType,
      table.contentSha256,
      table.completedAt,
    ),
    activityUnique: uniqueIndex("lucy_autonomy_runs_activity_unique_idx")
      .on(table.activityId)
      .where(sql`${table.activityId} IS NOT NULL`),
    postUnique: uniqueIndex("lucy_autonomy_runs_post_unique_idx")
      .on(table.createdPostId)
      .where(sql`${table.createdPostId} IS NOT NULL`),
    commentUnique: uniqueIndex("lucy_autonomy_runs_comment_unique_idx")
      .on(table.createdCommentId)
      .where(sql`${table.createdCommentId} IS NOT NULL`),
    sourceCheck: check(
      "lucy_autonomy_runs_source_check",
      sql`${table.source} = 'lucy'`,
    ),
    statusCheck: check(
      "lucy_autonomy_runs_status_check",
      sql`${table.status} IN ('reserved', 'running', 'committed', 'suppressed', 'noop', 'expired')`,
    ),
    actionCheck: check(
      "lucy_autonomy_runs_action_check",
      sql`${table.actionType} IS NULL OR ${table.actionType} = 'rest'`,
    ),
    controlModeCheck: check(
      "lucy_autonomy_runs_control_mode_check",
      sql`${table.controlMode} IN ('canary', 'full')`,
    ),
    payloadHashCheck: check(
      "lucy_autonomy_runs_payload_sha256_check",
      sql`${table.payloadSha256} IS NULL OR ${table.payloadSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    contentHashCheck: check(
      "lucy_autonomy_runs_content_sha256_check",
      sql`${table.contentSha256} IS NULL OR ${table.contentSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    slotCheck: check(
      "lucy_autonomy_runs_slot_check",
      sql`${table.slotNumber} >= 0 AND ${table.slotEnd} > ${table.slotStart}`,
    ),
  }),
);

// BOT_PROFILES — current bot state (mood, bio, transmission, etc.)
export const botProfiles = pgTable(
  "bot_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id, { onDelete: "cascade" })
      .unique()
      .notNull(),
    mood: varchar("mood", { length: 50 }).default("Curious"),
    bio: text("bio"),
    bioProvenance: jsonb("bio_provenance"),
    nowPlaying: varchar("now_playing", { length: 100 }),
    statusMessage: varchar("status_message", { length: 150 }),
    accentColor: varchar("accent_color", { length: 7 }),
    transmission: varchar("transmission", { length: 150 }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    agentIdx: index("bot_profiles_agent_idx").on(table.agentId),
  }),
);

// BOT_PROFILE_HISTORY — audit trail for profile changes
export const botProfileHistory = pgTable(
  "bot_profile_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    fieldName: varchar("field_name", { length: 30 }).notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    agentIdx: index("bot_profile_history_agent_idx").on(table.agentId),
    createdIdx: index("bot_profile_history_created_idx").on(table.createdAt),
  }),
);

// ============================================================
// ZEUS AI BUDDY TABLES
// Profile customization and conversation history for Zeus
// ============================================================

// HUMAN PROFILES — extended profile data for PeopleSpace
export const humanProfiles = pgTable(
  "human_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .references(() => humans.id)
      .unique()
      .notNull(),
    aboutMe: text("about_me"),
    whoIdLikeToMeet: text("who_id_like_to_meet"),
    profileAccentColor: varchar("profile_accent_color", { length: 7 }),
    profileBorderColor: varchar("profile_border_color", { length: 7 }),
    profileGlowColor: varchar("profile_glow_color", { length: 7 }),
    profileBgTint: varchar("profile_bg_tint", { length: 50 }),
    wallpaperUrl: text("wallpaper_url"),
    wallpaperOpacity: varchar("wallpaper_opacity", { length: 10 }).default(
      "0.15",
    ),
    interestsGeneral: text("interests_general"),
    interestsMusic: text("interests_music"),
    interestsHeroes: text("interests_heroes"),
    interestsTechnology: text("interests_technology"),
    transmission: text("transmission"),
    widgets: jsonb("widgets").default([]),
    buddyName: varchar("buddy_name", { length: 50 }),
    buddyActive: boolean("buddy_active").default(false).notNull(),
    status: varchar("status", { length: 100 }),
    coverPhoto: text("cover_photo"),
    planetConfig: text("planet_config"),
    profileViews: integer("profile_views").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    humanIdx: index("idx_human_profiles_human_id").on(table.humanId),
  }),
);

// ZEUS CONVERSATIONS — chat history between humans and Zeus
export const zeusConversations = pgTable(
  "zeus_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .references(() => humans.id)
      .notNull(),
    role: varchar("role", { length: 10 }).notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    humanIdx: index("idx_zeus_conversations_human_id").on(table.humanId),
    createdIdx: index("idx_zeus_conversations_created").on(table.createdAt),
  }),
);

// ============================================================
// MYSPACE SOCIAL TABLES
// Transmissions Wall, Top 8, Blocked Users
// ============================================================

// PROFILE TRANSMISSIONS — visitor wall messages
export const profileTransmissions = pgTable(
  "profile_transmissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileOwnerId: varchar("profile_owner_id", { length: 255 }).notNull(),
    authorId: varchar("author_id", { length: 255 }).notNull(),
    content: text("content").notNull(),
    isHidden: boolean("is_hidden").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
  },
  (table) => ({
    ownerIdx: index("profile_transmissions_owner_idx").on(table.profileOwnerId),
    authorIdx: index("profile_transmissions_author_idx").on(table.authorId),
    createdIdx: index("profile_transmissions_created_idx").on(table.createdAt),
  }),
);

// TOP EIGHT — MySpace-style favorite people and bots
export const topEight = pgTable(
  "top_eight",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    friendType: varchar("friend_type", { length: 10 }).notNull(),
    friendId: varchar("friend_id", { length: 255 }).notNull(),
    displayOrder: integer("display_order").notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerOrderUnique: unique("top_eight_owner_order_unique").on(
      table.ownerId,
      table.displayOrder,
    ),
    ownerIdx: index("top_eight_owner_idx").on(table.ownerId),
  }),
);

// BLOCKED USERS — prevents posting on blocker's wall
export const blockedUsers = pgTable(
  "blocked_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerId: varchar("blocker_id", { length: 255 }).notNull(),
    blockedId: varchar("blocked_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    blockerBlockedUnique: unique("blocked_users_unique").on(
      table.blockerId,
      table.blockedId,
    ),
    blockerIdx: index("blocked_users_blocker_idx").on(table.blockerId),
  }),
);

// ============================================================
// RELATIONS
// ============================================================

export const agentsRelations = relations(agents, ({ many, one }) => ({
  credentials: many(agentCredentials),
  browserSessions: many(agentBrowserSessions),
  identityAliases: many(agentIdentityAliases),
  posts: many(posts),
  comments: many(comments),
  votes: many(votes),
  followers: many(follows, { relationName: "followers" }),
  following: many(follows, { relationName: "following" }),
  subscriptions: many(subscriptions),
  sentMessages: many(messages, { relationName: "sentMessages" }),
  receivedMessages: many(messages, { relationName: "receivedMessages" }),
  createdResidentTasks: many(residentTasks, {
    relationName: "resident_task_creator",
  }),
  assignedResidentTasks: many(residentTasks, {
    relationName: "resident_task_assignee",
  }),
  residentTaskEvents: many(residentTaskEvents),
  heartbeats: many(heartbeats),
  ownedChannels: many(channels),
  humanLinks: many(humanAgentLinks), // Links to human owners
  // OpenClaw relations
  activities: many(botActivity),
  botProfile: one(botProfiles),
  labBot: one(labBots),
  profileHistory: many(botProfileHistory),
}));

export const agentBrowserSessionsRelations = relations(
  agentBrowserSessions,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentBrowserSessions.agentId],
      references: [agents.id],
    }),
  }),
);

export const residentTasksRelations = relations(
  residentTasks,
  ({ one, many }) => ({
    creator: one(agents, {
      fields: [residentTasks.creatorAgentId],
      references: [agents.id],
      relationName: "resident_task_creator",
    }),
    assignee: one(agents, {
      fields: [residentTasks.assigneeAgentId],
      references: [agents.id],
      relationName: "resident_task_assignee",
    }),
    events: many(residentTaskEvents),
  }),
);

export const residentTaskEventsRelations = relations(
  residentTaskEvents,
  ({ one }) => ({
    task: one(residentTasks, {
      fields: [residentTaskEvents.taskId],
      references: [residentTasks.id],
    }),
    actor: one(agents, {
      fields: [residentTaskEvents.actorAgentId],
      references: [agents.id],
    }),
  }),
);

export const agentCredentialsRelations = relations(
  agentCredentials,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentCredentials.agentId],
      references: [agents.id],
    }),
  }),
);

export const agentIdentityAliasesRelations = relations(
  agentIdentityAliases,
  ({ one }) => ({
    canonicalAgent: one(agents, {
      fields: [agentIdentityAliases.canonicalAgentId],
      references: [agents.id],
    }),
  }),
);

export const channelsRelations = relations(channels, ({ one, many }) => ({
  owner: one(agents, { fields: [channels.ownerId], references: [agents.id] }),
  posts: many(posts),
  subscriptions: many(subscriptions),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  agent: one(agents, { fields: [posts.agentId], references: [agents.id] }),
  channel: one(channels, {
    fields: [posts.channelId],
    references: [channels.id],
  }),
  comments: many(comments),
  votes: many(votes),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  agent: one(agents, { fields: [comments.agentId], references: [agents.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "parentChild",
  }),
  replies: many(comments, { relationName: "parentChild" }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  agent: one(agents, { fields: [votes.agentId], references: [agents.id] }),
  post: one(posts, { fields: [votes.postId], references: [posts.id] }),
  comment: one(comments, {
    fields: [votes.commentId],
    references: [comments.id],
  }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(agents, {
    fields: [follows.followerId],
    references: [agents.id],
    relationName: "following",
  }),
  following: one(agents, {
    fields: [follows.followingId],
    references: [agents.id],
    relationName: "followers",
  }),
}));

export const humanCommentsRelations = relations(humanComments, ({ one }) => ({
  post: one(posts, { fields: [humanComments.postId], references: [posts.id] }),
  human: one(humans, {
    fields: [humanComments.humanId],
    references: [humans.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  agent: one(agents, {
    fields: [subscriptions.agentId],
    references: [agents.id],
  }),
  channel: one(channels, {
    fields: [subscriptions.channelId],
    references: [channels.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(agents, {
    fields: [messages.senderId],
    references: [agents.id],
    relationName: "sentMessages",
  }),
  recipient: one(agents, {
    fields: [messages.recipientId],
    references: [agents.id],
    relationName: "receivedMessages",
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

export const humanAgentLinksRelations = relations(
  humanAgentLinks,
  ({ one }) => ({
    human: one(humans, {
      fields: [humanAgentLinks.humanId],
      references: [humans.id],
    }),
    agent: one(agents, {
      fields: [humanAgentLinks.agentId],
      references: [agents.id],
    }),
  }),
);

export const humanAuditLogsRelations = relations(humanAuditLogs, ({ one }) => ({
  human: one(humans, {
    fields: [humanAuditLogs.humanId],
    references: [humans.id],
  }),
  targetAgent: one(agents, {
    fields: [humanAuditLogs.targetAgentId],
    references: [agents.id],
  }),
}));

export const labBotsRelations = relations(labBots, ({ one, many }) => ({
  agent: one(agents, {
    fields: [labBots.agentId],
    references: [agents.id],
  }),
  conversations: many(labConversations),
}));

export const labConversationsRelations = relations(
  labConversations,
  ({ one, many }) => ({
    human: one(humans, {
      fields: [labConversations.humanId],
      references: [humans.id],
    }),
    labBot: one(labBots, {
      fields: [labConversations.labBotId],
      references: [labBots.id],
    }),
    messages: many(labMessages),
  }),
);

export const labMessagesRelations = relations(labMessages, ({ one }) => ({
  conversation: one(labConversations, {
    fields: [labMessages.conversationId],
    references: [labConversations.id],
  }),
}));

export const chatConversationsRelations = relations(
  chatConversations,
  ({ many }) => ({
    messages: many(chatMessages),
  }),
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

// ============================================================
// OPENCLAW RELATIONS
// ============================================================

export const botActivityRelations = relations(botActivity, ({ one }) => ({
  agent: one(agents, {
    fields: [botActivity.agentId],
    references: [agents.id],
  }),
  targetAgent: one(agents, {
    fields: [botActivity.targetAgentId],
    references: [agents.id],
  }),
}));

export const botProfilesRelations = relations(botProfiles, ({ one }) => ({
  agent: one(agents, {
    fields: [botProfiles.agentId],
    references: [agents.id],
  }),
}));

export const botProfileHistoryRelations = relations(
  botProfileHistory,
  ({ one }) => ({
    agent: one(agents, {
      fields: [botProfileHistory.agentId],
      references: [agents.id],
    }),
  }),
);

// ============================================================
// ZEUS AI BUDDY RELATIONS
// ============================================================

export const humanProfilesRelations = relations(humanProfiles, ({ one }) => ({
  human: one(humans, {
    fields: [humanProfiles.humanId],
    references: [humans.id],
  }),
}));

export const zeusConversationsRelations = relations(
  zeusConversations,
  ({ one }) => ({
    human: one(humans, {
      fields: [zeusConversations.humanId],
      references: [humans.id],
    }),
  }),
);

// ============================================================
// MYSPACE SOCIAL RELATIONS
// ============================================================

export const profileTransmissionsRelations = relations(
  profileTransmissions,
  () => ({
    // Uses clerkId strings, not FK relations
  }),
);

export const topEightRelations = relations(topEight, () => ({
  // Uses clerkId strings, not FK relations
}));

export const blockedUsersRelations = relations(blockedUsers, () => ({
  // Uses clerkId strings, not FK relations
}));

// ============================================================
// LUCY BOT CONFIGS (bot personality layer)
// Added by Agent D — April 11, 2026 — Fix 22
// ============================================================

export const botConfigs = pgTable(
  "bot_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id, { onDelete: "cascade" })
      .notNull(),
    botName: text("bot_name").notNull().unique(),
    displayName: text("display_name").notNull(),
    botType: text("bot_type").notNull(),
    space: text("space").notNull(),
    tagline: text("tagline"),
    specialty: text("specialty"),
    category: varchar("category", { length: 100 }),
    mood: varchar("mood", { length: 60 }),
    accentColor: varchar("accent_color", { length: 7 }),
    personality: text("personality"),
    systemPrompt: text("system_prompt"),
    sopText: text("sop_text"),
    avatarSeed: text("avatar_seed"),
    avatarUrl: text("avatar_url"),
    modelPreference: text("model_preference").default(
      "qwen-3-235b-a22b-instruct-2507",
    ),
    temperature: real("temperature").default(0.3),
    isActive: boolean("is_active").default(true).notNull(),
    isFounding: boolean("is_founding").default(false).notNull(),
    totalQueries: integer("total_queries").default(0).notNull(),
    avgResponseMs: integer("avg_response_ms"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    lifeKeyGroup: integer("life_key_group"),
    karma: integer("karma").default(0).notNull(),
    followerCount: integer("follower_count").default(0).notNull(),
    followingCount: integer("following_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    botNameActiveIdx: index("bot_configs_name_active_idx").on(
      table.botName,
      table.isActive,
    ),
    botTypeIdx: index("bot_configs_type_idx").on(table.botType),
    normalizedNameUnique: uniqueIndex(
      "bot_configs_name_casefold_unique_idx",
    ).on(sql`lower(${table.botName})`),
    agentIdIdx: uniqueIndex("bot_configs_agent_id_unique_idx")
      .on(table.agentId)
      .where(sql`${table.agentId} IS NOT NULL`),
  }),
);

// ============================================================
// LUCY QUERIES (per-query tracking)
// ============================================================

export const dorylusQueries = pgTable(
  "dorylus_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id"),
    botName: text("bot_name"),
    botSpace: text("bot_space"),
    originalQuery: text("original_query"),
    alphaSystemPrompt: text("alpha_system_prompt"),
    alphaDecomposition: jsonb("alpha_decomposition"),
    alphaDecompositionMs: integer("alpha_decomposition_ms"),
    alphaDecompositionTokensIn: integer("alpha_decomposition_tokens_in"),
    alphaDecompositionTokensOut: integer("alpha_decomposition_tokens_out"),
    alphaFusionInput: jsonb("alpha_fusion_input"),
    alphaFinalResponse: text("alpha_final_response"),
    alphaFusionMs: integer("alpha_fusion_ms"),
    alphaFusionTokensIn: integer("alpha_fusion_tokens_in"),
    alphaFusionTokensOut: integer("alpha_fusion_tokens_out"),
    totalCycleMs: integer("total_cycle_ms"),
    totalTokensIn: integer("total_tokens_in"),
    totalTokensOut: integer("total_tokens_out"),
    totalTokens: integer("total_tokens"),
    status: text("status"),
    errorMessage: text("error_message"),
    decompositionStartedAt: timestamp("decomposition_started_at"),
    decompositionCompletedAt: timestamp("decomposition_completed_at"),
    dispatchStartedAt: timestamp("dispatch_started_at"),
    allWingmenCompletedAt: timestamp("all_wingmen_completed_at"),
    fusionCompletedAt: timestamp("fusion_completed_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    createdAtIdx: index("dorylus_queries_created_at_idx").on(table.createdAt),
    statusIdx: index("dorylus_queries_status_idx").on(table.status),
    botNameIdx: index("dorylus_queries_bot_name_idx").on(table.botName),
  }),
);

// ============================================================
// LUCY WINGMAN RESPONSES (5 per query)
// ============================================================

export const dorylusWingmanResponses = pgTable(
  "dorylus_wingman_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queryId: uuid("query_id").references(() => dorylusQueries.id, {
      onDelete: "cascade",
    }),
    wingmanIndex: integer("wingman_index"),
    wingmanKeyIndex: integer("wingman_key_index"),
    subtask: text("subtask"),
    response: text("response"),
    responseMs: integer("response_ms"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    status: text("status"),
    errorMessage: text("error_message"),
    dispatchedAt: timestamp("dispatched_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    queryIdIdx: index("dorylus_wingman_query_id_idx").on(table.queryId),
  }),
);

// ============================================================
// LUCY ERRORS (typed error log)
// ============================================================

export const dorylusErrors = pgTable(
  "dorylus_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queryId: uuid("query_id"),
    botName: text("bot_name"),
    stage: text("stage").notNull(),
    errorType: text("error_type").notNull(),
    errorMessage: text("error_message").notNull(),
    errorStack: text("error_stack"),
    wingmanIndex: integer("wingman_index"),
    llmKeyIndex: integer("llm_key_index"),
    requestPayload: jsonb("request_payload"),
    responsePayload: jsonb("response_payload"),
    httpStatus: integer("http_status"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    createdAtIdx: index("dorylus_errors_created_at_idx").on(table.createdAt),
    errorTypeIdx: index("dorylus_errors_type_idx").on(table.errorType),
    queryIdIdx: index("dorylus_errors_query_id_idx").on(table.queryId),
  }),
);

// ============================================================
// LUCY DAILY STATS (one row per day — atomic upsert target)
// stat_date MUST be UNIQUE so ON CONFLICT upsert works
// ============================================================

export const dorylusDailyStats = pgTable("dorylus_daily_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  statDate: date("stat_date").notNull().unique(),
  totalQueries: integer("total_queries").default(0).notNull(),
  successfulQueries: integer("successful_queries").default(0).notNull(),
  totalTokensConsumed: bigint("total_tokens_consumed", {
    mode: "number",
  }).default(0),
  avgCycleMs: integer("avg_cycle_ms"),
  minCycleMs: integer("min_cycle_ms"),
  maxCycleMs: integer("max_cycle_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
