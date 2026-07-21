import { sql } from "drizzle-orm";

const CHAT_TARGET_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,49}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const CHAT_TARGET_ERROR_CODES = [
  "invalid",
  "unknown",
  "unconfigured",
  "inactive",
  "ambiguous",
  "unlinked",
  "inconsistent",
  "lookup_failed",
] as const;

export type ChatTargetErrorCode = (typeof CHAT_TARGET_ERROR_CODES)[number];

type ChatTargetMatchSource = "agent" | "alias" | "config";

export interface ChatTargetAgentSnapshot {
  readonly id: string;
  readonly name: string;
}

export interface ChatTargetConfigSnapshot {
  readonly id: string;
  readonly agentId: string | null;
  readonly botName: string;
  readonly displayName: string;
  readonly botType: string;
  readonly space: string;
  readonly tagline: string | null;
  readonly specialty: string | null;
  readonly personality: string | null;
  readonly systemPrompt: string | null;
  readonly sopText: string | null;
  readonly modelPreference: string | null;
  readonly temperature: number | null;
  readonly isActive: boolean;
  readonly isFounding: boolean;
}

export interface ChatTargetAliasSnapshot {
  readonly legacyAgentId: string;
  readonly canonicalAgentId: string;
  readonly normalizedName: string;
}

export interface ChatTargetLookupSnapshot {
  readonly requestedName: string;
  readonly agents: readonly ChatTargetAgentSnapshot[];
  readonly configs: readonly ChatTargetConfigSnapshot[];
  readonly aliases: readonly ChatTargetAliasSnapshot[];
}

export type ChatTargetSnapshotLookup = (
  normalizedName: string,
) => Promise<unknown>;

export interface ChatTargetResolverDependencies {
  readonly lookupSnapshot: ChatTargetSnapshotLookup;
}

export type CanonicalChatConfig = Readonly<{
  id: string;
  agentId: string;
  botName: string;
  displayName: string;
  botType: string;
  space: string;
  tagline: string | null;
  specialty: string | null;
  personality: string | null;
  systemPrompt: string | null;
  sopText: string | null;
  modelPreference: string | null;
  temperature: number | null;
  isActive: true;
  isFounding: boolean;
}>;

export type CanonicalChatTarget = Readonly<{
  agentId: string;
  agentName: string;
  normalizedName: string;
  displayName: string;
  requestedName: string;
  matchedBy: readonly ChatTargetMatchSource[];
  config: CanonicalChatConfig;
}>;

const ERROR_METADATA: Readonly<
  Record<
    ChatTargetErrorCode,
    Readonly<{ status: 400 | 404 | 503; publicMessage: string }>
  >
> = Object.freeze({
  invalid: Object.freeze({
    status: 400 as const,
    publicMessage: "A valid chat target is required.",
  }),
  unknown: Object.freeze({
    status: 404 as const,
    publicMessage: "The requested chat target is unavailable.",
  }),
  unconfigured: Object.freeze({
    status: 404 as const,
    publicMessage: "The requested chat target is unavailable.",
  }),
  inactive: Object.freeze({
    status: 404 as const,
    publicMessage: "The requested chat target is unavailable.",
  }),
  ambiguous: Object.freeze({
    status: 503 as const,
    publicMessage: "Chat target resolution is temporarily unavailable.",
  }),
  unlinked: Object.freeze({
    status: 503 as const,
    publicMessage: "Chat target resolution is temporarily unavailable.",
  }),
  inconsistent: Object.freeze({
    status: 503 as const,
    publicMessage: "Chat target resolution is temporarily unavailable.",
  }),
  lookup_failed: Object.freeze({
    status: 503 as const,
    publicMessage: "Chat target resolution is temporarily unavailable.",
  }),
});

export class ChatTargetResolutionError extends Error {
  readonly status: 400 | 404 | 503;

  readonly publicMessage: string;

  readonly safeMessage: string;

  constructor(readonly code: ChatTargetErrorCode) {
    const metadata = ERROR_METADATA[code];
    super(metadata.publicMessage);
    this.name = "ChatTargetResolutionError";
    this.status = metadata.status;
    this.publicMessage = metadata.publicMessage;
    this.safeMessage = metadata.publicMessage;
  }
}

export function isChatTargetResolutionError(
  error: unknown,
): error is ChatTargetResolutionError {
  return error instanceof ChatTargetResolutionError;
}

export type PublicChatTargetError = Readonly<{
  status: 400 | 404 | 503;
  body: Readonly<{
    error: "invalid_chat_target" | "chat_target_unavailable";
    message: string;
  }>;
}>;

export function toPublicChatTargetError(
  error: ChatTargetResolutionError,
): PublicChatTargetError {
  return Object.freeze({
    status: error.status,
    body: Object.freeze({
      error:
        error.status === 400
          ? "invalid_chat_target"
          : "chat_target_unavailable",
      message: error.publicMessage,
    }),
  });
}

function resolutionError(code: ChatTargetErrorCode): ChatTargetResolutionError {
  return new ChatTargetResolutionError(code);
}

function normalizeRequestedName(requestedName: unknown): string {
  if (typeof requestedName !== "string") throw resolutionError("invalid");
  const normalizedName = requestedName.trim().toLowerCase();
  if (!CHAT_TARGET_NAME_PATTERN.test(normalizedName)) {
    throw resolutionError("invalid");
  }
  return normalizedName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...keys].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function parseAgent(value: unknown): ChatTargetAgentSnapshot | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "name"])) return null;
  if (!isUuid(value.id) || typeof value.name !== "string") return null;
  return Object.freeze({ id: value.id, name: value.name });
}

function parseConfig(value: unknown): ChatTargetConfigSnapshot | null {
  const keys = [
    "id",
    "agentId",
    "botName",
    "displayName",
    "botType",
    "space",
    "tagline",
    "specialty",
    "personality",
    "systemPrompt",
    "sopText",
    "modelPreference",
    "temperature",
    "isActive",
    "isFounding",
  ] as const;
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return null;
  if (!isUuid(value.id) || (value.agentId !== null && !isUuid(value.agentId)))
    return null;
  if (
    typeof value.botName !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.botType !== "string" ||
    typeof value.space !== "string" ||
    (value.tagline !== null && typeof value.tagline !== "string") ||
    (value.specialty !== null && typeof value.specialty !== "string") ||
    (value.personality !== null && typeof value.personality !== "string") ||
    (value.systemPrompt !== null && typeof value.systemPrompt !== "string") ||
    (value.sopText !== null && typeof value.sopText !== "string") ||
    (value.modelPreference !== null &&
      typeof value.modelPreference !== "string") ||
    (value.temperature !== null &&
      (typeof value.temperature !== "number" ||
        !Number.isFinite(value.temperature))) ||
    typeof value.isActive !== "boolean" ||
    typeof value.isFounding !== "boolean"
  )
    return null;

  return Object.freeze({
    id: value.id,
    agentId: value.agentId,
    botName: value.botName,
    displayName: value.displayName,
    botType: value.botType,
    space: value.space,
    tagline: value.tagline,
    specialty: value.specialty,
    personality: value.personality,
    systemPrompt: value.systemPrompt,
    sopText: value.sopText,
    modelPreference: value.modelPreference,
    temperature: value.temperature,
    isActive: value.isActive,
    isFounding: value.isFounding,
  });
}

function parseAlias(value: unknown): ChatTargetAliasSnapshot | null {
  const keys = ["legacyAgentId", "canonicalAgentId", "normalizedName"] as const;
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return null;
  if (
    !isUuid(value.legacyAgentId) ||
    !isUuid(value.canonicalAgentId) ||
    typeof value.normalizedName !== "string"
  )
    return null;
  return Object.freeze({
    legacyAgentId: value.legacyAgentId,
    canonicalAgentId: value.canonicalAgentId,
    normalizedName: value.normalizedName,
  });
}

function parseSnapshot(value: unknown): ChatTargetLookupSnapshot | null {
  const keys = ["requestedName", "agents", "configs", "aliases"] as const;
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return null;
  if (
    typeof value.requestedName !== "string" ||
    !Array.isArray(value.agents) ||
    !Array.isArray(value.configs) ||
    !Array.isArray(value.aliases)
  )
    return null;

  const agents = value.agents.map(parseAgent);
  const configs = value.configs.map(parseConfig);
  const aliases = value.aliases.map(parseAlias);
  if (
    agents.some((agent) => agent === null) ||
    configs.some((config) => config === null) ||
    aliases.some((alias) => alias === null)
  )
    return null;

  return Object.freeze({
    requestedName: value.requestedName,
    agents: Object.freeze(agents as ChatTargetAgentSnapshot[]),
    configs: Object.freeze(configs as ChatTargetConfigSnapshot[]),
    aliases: Object.freeze(aliases as ChatTargetAliasSnapshot[]),
  });
}

function normalizeStoredName(value: string): string {
  return value.trim().toLowerCase();
}

function isCanonicalStoredName(value: string): boolean {
  return (
    value === value.trim() && CHAT_TARGET_NAME_PATTERN.test(value.toLowerCase())
  );
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function classifySnapshot(
  snapshot: ChatTargetLookupSnapshot,
  requestedName: string,
): CanonicalChatTarget {
  if (snapshot.requestedName !== requestedName)
    throw resolutionError("lookup_failed");

  const matchingAgents = snapshot.agents.filter(
    (agent) => normalizeStoredName(agent.name) === requestedName,
  );
  const matchingConfigs = snapshot.configs.filter(
    (config) => normalizeStoredName(config.botName) === requestedName,
  );
  const matchingAliases = snapshot.aliases.filter(
    (alias) => normalizeStoredName(alias.normalizedName) === requestedName,
  );

  if (
    matchingAgents.length === 0 &&
    matchingConfigs.length === 0 &&
    matchingAliases.length === 0
  ) {
    if (
      snapshot.agents.length ||
      snapshot.configs.length ||
      snapshot.aliases.length
    ) {
      throw resolutionError("lookup_failed");
    }
    throw resolutionError("unknown");
  }

  if (
    matchingAgents.length > 1 ||
    matchingConfigs.length > 1 ||
    distinct(matchingAgents.map((agent) => agent.id)).length !==
      matchingAgents.length ||
    distinct(matchingConfigs.map((config) => config.id)).length !==
      matchingConfigs.length
  )
    throw resolutionError("ambiguous");

  if (
    matchingAliases.some(
      (alias) =>
        alias.normalizedName !== requestedName ||
        !isCanonicalStoredName(alias.normalizedName),
    )
  )
    throw resolutionError("inconsistent");

  const candidateAgentIds = distinct([
    ...matchingAgents.map((agent) => agent.id),
    ...matchingAliases.map((alias) => alias.canonicalAgentId),
    ...matchingConfigs.flatMap((config) =>
      config.agentId ? [config.agentId] : [],
    ),
  ]);

  if (candidateAgentIds.length > 1) throw resolutionError("ambiguous");
  if (matchingConfigs.some((config) => config.agentId === null)) {
    throw resolutionError("unlinked");
  }
  if (candidateAgentIds.length === 0) throw resolutionError("unlinked");

  const agentId = candidateAgentIds[0];
  const canonicalAgents = snapshot.agents.filter(
    (agent) => agent.id === agentId,
  );
  if (canonicalAgents.length !== 1) throw resolutionError("inconsistent");

  const linkedConfigs = snapshot.configs.filter(
    (config) => config.agentId === agentId,
  );
  if (linkedConfigs.length === 0) throw resolutionError("unconfigured");
  if (linkedConfigs.length > 1) throw resolutionError("ambiguous");

  const agent = canonicalAgents[0];
  const config = linkedConfigs[0];
  if (
    !isCanonicalStoredName(agent.name) ||
    !isCanonicalStoredName(config.botName) ||
    normalizeStoredName(agent.name) !== normalizeStoredName(config.botName) ||
    config.agentId !== agent.id ||
    matchingAliases.some((alias) => alias.canonicalAgentId !== agent.id)
  )
    throw resolutionError("inconsistent");

  if (!config.isActive) throw resolutionError("inactive");

  const canonicalConfig: CanonicalChatConfig = Object.freeze({
    id: config.id,
    agentId: agent.id,
    botName: config.botName,
    displayName: config.displayName,
    botType: config.botType,
    space: config.space,
    tagline: config.tagline,
    specialty: config.specialty,
    personality: config.personality,
    systemPrompt: config.systemPrompt,
    sopText: config.sopText,
    modelPreference: config.modelPreference,
    temperature: config.temperature,
    isActive: true,
    isFounding: config.isFounding,
  });
  const matchedBy = Object.freeze([
    ...(matchingAgents.length ? ["agent" as const] : []),
    ...(matchingAliases.length ? ["alias" as const] : []),
    ...(matchingConfigs.length ? ["config" as const] : []),
  ]);

  return Object.freeze({
    agentId: agent.id,
    agentName: agent.name,
    normalizedName: normalizeStoredName(config.botName),
    displayName: config.displayName,
    requestedName,
    matchedBy,
    config: canonicalConfig,
  });
}

export function createChatTargetResolver(
  dependencies: ChatTargetResolverDependencies,
): (requestedName: unknown) => Promise<CanonicalChatTarget> {
  return async (requestedName: unknown): Promise<CanonicalChatTarget> => {
    const normalizedName = normalizeRequestedName(requestedName);
    try {
      const rawSnapshot = await dependencies.lookupSnapshot(normalizedName);
      const snapshot = parseSnapshot(rawSnapshot);
      if (!snapshot) throw resolutionError("lookup_failed");
      return classifySnapshot(snapshot, normalizedName);
    } catch (error) {
      if (isChatTargetResolutionError(error)) throw error;
      throw resolutionError("lookup_failed");
    }
  };
}

export const postgresChatTargetSnapshotLookup: ChatTargetSnapshotLookup =
  async (normalizedName) => {
    const { db } = await import("@/db");
    const rows = await db.execute(sql`
    WITH requested AS MATERIALIZED (
      SELECT ${normalizedName}::text AS normalized_name
    ),
    matching_agents AS MATERIALIZED (
      SELECT agent.id, agent.name
      FROM agents AS agent
      CROSS JOIN requested
      WHERE lower(btrim(agent.name)) = requested.normalized_name
        AND agent.moderation_status = 'active'
    ),
    matching_aliases AS MATERIALIZED (
      SELECT alias.legacy_agent_id, alias.canonical_agent_id, alias.normalized_name
      FROM agent_identity_aliases AS alias
      CROSS JOIN requested
      WHERE lower(btrim(alias.normalized_name)) = requested.normalized_name
    ),
    matching_configs AS MATERIALIZED (
      SELECT config.*
      FROM bot_configs AS config
      JOIN agents AS agent ON agent.id = config.agent_id
      CROSS JOIN requested
      WHERE lower(btrim(config.bot_name)) = requested.normalized_name
        AND agent.moderation_status = 'active'
    ),
    candidate_agent_ids AS MATERIALIZED (
      SELECT id AS agent_id FROM matching_agents
      UNION
      SELECT canonical_agent_id AS agent_id FROM matching_aliases
      UNION
      SELECT agent_id FROM matching_configs WHERE agent_id IS NOT NULL
    ),
    snapshot_agents AS MATERIALIZED (
      SELECT agent.id, agent.name
      FROM agents AS agent
      CROSS JOIN requested
      WHERE agent.moderation_status = 'active'
        AND (
          lower(btrim(agent.name)) = requested.normalized_name
          OR agent.id IN (SELECT agent_id FROM candidate_agent_ids)
        )
    ),
    snapshot_configs AS MATERIALIZED (
      SELECT config.*
      FROM bot_configs AS config
      JOIN agents AS agent ON agent.id = config.agent_id
      CROSS JOIN requested
      WHERE agent.moderation_status = 'active'
        AND (
          lower(btrim(config.bot_name)) = requested.normalized_name
          OR config.agent_id IN (SELECT agent_id FROM candidate_agent_ids)
        )
    )
    SELECT jsonb_build_object(
      'requestedName', requested.normalized_name,
      'agents', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', agent.id,
          'name', agent.name
        ) ORDER BY agent.id)
        FROM snapshot_agents AS agent
      ), '[]'::jsonb),
      'configs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', config.id,
          'agentId', config.agent_id,
          'botName', config.bot_name,
          'displayName', config.display_name,
          'botType', config.bot_type,
          'space', config.space,
          'tagline', config.tagline,
          'specialty', config.specialty,
          'personality', config.personality,
          'systemPrompt', config.system_prompt,
          'sopText', config.sop_text,
          'modelPreference', config.model_preference,
          'temperature', config.temperature,
          'isActive', config.is_active,
          'isFounding', config.is_founding
        ) ORDER BY config.id)
        FROM snapshot_configs AS config
      ), '[]'::jsonb),
      'aliases', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'legacyAgentId', alias.legacy_agent_id,
          'canonicalAgentId', alias.canonical_agent_id,
          'normalizedName', alias.normalized_name
        ) ORDER BY alias.legacy_agent_id)
        FROM matching_aliases AS alias
      ), '[]'::jsonb)
    ) AS snapshot
    FROM requested
  `);

    const row = rows[0];
    return isRecord(row) ? row.snapshot : undefined;
  };

export const resolveCanonicalChatTarget = createChatTargetResolver({
  lookupSnapshot: postgresChatTargetSnapshotLookup,
});

export async function resolveCanonicalChatTargetByAgentId(
  agentId: unknown,
): Promise<CanonicalChatTarget> {
  if (typeof agentId !== "string" || !UUID_PATTERN.test(agentId)) {
    throw resolutionError("invalid");
  }

  try {
    const { db } = await import("@/db");
    const rows = await db.execute(sql`
      WITH requested_agent AS MATERIALIZED (
        SELECT agent.id, agent.name
        FROM agents AS agent
        WHERE agent.id = ${agentId}::uuid
          AND agent.moderation_status = 'active'
      ),
      snapshot_configs AS MATERIALIZED (
        SELECT config.*
        FROM bot_configs AS config
        JOIN agents AS agent ON agent.id = config.agent_id
        WHERE config.agent_id = ${agentId}::uuid
          AND agent.moderation_status = 'active'
      )
      SELECT jsonb_build_object(
        'requestedName', COALESCE((SELECT lower(btrim(name)) FROM requested_agent), ''),
        'agents', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', agent.id, 'name', agent.name))
          FROM requested_agent AS agent
        ), '[]'::jsonb),
        'configs', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', config.id,
            'agentId', config.agent_id,
            'botName', config.bot_name,
            'displayName', config.display_name,
            'botType', config.bot_type,
            'space', config.space,
            'tagline', config.tagline,
            'specialty', config.specialty,
            'personality', config.personality,
            'systemPrompt', config.system_prompt,
            'sopText', config.sop_text,
            'modelPreference', config.model_preference,
            'temperature', config.temperature,
            'isActive', config.is_active,
            'isFounding', config.is_founding
          ) ORDER BY config.id)
          FROM snapshot_configs AS config
        ), '[]'::jsonb),
        'aliases', '[]'::jsonb
      ) AS snapshot
    `);
    const row = rows[0];
    const snapshot = parseSnapshot(isRecord(row) ? row.snapshot : undefined);
    if (!snapshot) throw resolutionError("lookup_failed");
    if (!snapshot.requestedName) throw resolutionError("unknown");
    const target = classifySnapshot(snapshot, snapshot.requestedName);
    if (target.agentId !== agentId) throw resolutionError("inconsistent");
    return target;
  } catch (error) {
    if (isChatTargetResolutionError(error)) throw error;
    throw resolutionError("lookup_failed");
  }
}
