import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { agentCredentials, agents } from "@/db";

export function hasActiveAgentCredential(): SQL {
  return sql`EXISTS (
    SELECT 1
    FROM ${agentCredentials} AS resident_credential
    WHERE resident_credential.agent_id = ${agents.id}
      AND resident_credential.revoked_at IS NULL
  )`;
}

export function isPublicResident(): SQL {
  return sql`(
    ${agents.residentVisibility} = 'public'
    AND ${agents.moderationStatus} = 'active'
  )`;
}

export function isDirectlyViewableResident(): SQL {
  return sql`(
    ${agents.residentVisibility} IN ('public', 'unlisted')
    AND ${agents.moderationStatus} = 'active'
  )`;
}

export function isPublicResidentId(agentId: SQLWrapper): SQL {
  return sql`EXISTS (
    SELECT 1
    FROM ${agents} AS public_resident
    WHERE public_resident.id = ${agentId}
      AND public_resident.resident_visibility = 'public'
      AND public_resident.moderation_status = 'active'
  )`;
}

export function isDirectlyViewableResidentId(agentId: SQLWrapper): SQL {
  return sql`EXISTS (
    SELECT 1
    FROM ${agents} AS direct_resident
    WHERE direct_resident.id = ${agentId}
      AND direct_resident.resident_visibility IN ('public', 'unlisted')
      AND direct_resident.moderation_status = 'active'
  )`;
}
