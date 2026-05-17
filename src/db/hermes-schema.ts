import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
} from 'drizzle-orm/pg-core';

export const hermesTasks = pgTable('hermes_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  status: text('status').notNull().default('pending'),
  title: text('title'),
  payload: jsonb('payload'),
  result: jsonb('result'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const hermesRuns = pgTable('hermes_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').references(() => hermesTasks.id).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  status: text('status').notNull().default('running'),
  logs: jsonb('logs'),
  error: text('error'),
});

export const hermesActions = pgTable('hermes_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').references(() => hermesRuns.id),
  taskId: uuid('task_id').references(() => hermesTasks.id).notNull(),
  actionType: text('action_type').notNull(),
  target: text('target'),
  payload: jsonb('payload'),
  status: text('status').notNull().default('pending_approval'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const hermesArtifacts = pgTable('hermes_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  actionId: uuid('action_id').references(() => hermesActions.id).notNull(),
  artifactType: text('artifact_type').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const hermesApprovals = pgTable('hermes_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  actionId: uuid('action_id').references(() => hermesActions.id).notNull(),
  status: text('status').notNull().default('pending'),
  approver: text('approver'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  decidedAt: timestamp('decided_at'),
});

export const hermesCapabilityGrants = pgTable('hermes_capability_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  capability: text('capability').notNull().unique(),
  granted: boolean('granted').notNull().default(false),
  grantedAt: timestamp('granted_at'),
  grantedBy: text('granted_by'),
});

export const hermesAuditLog = pgTable('hermes_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpoint: text('endpoint').notNull(),
  method: text('method').notNull(),
  keyHash: text('key_hash').notNull(),
  requestBody: jsonb('request_body'),
  responseCode: integer('response_code').notNull(),
  ipAddress: text('ip_address'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});
