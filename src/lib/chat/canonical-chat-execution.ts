import type { CanonicalChatActor } from "@/lib/chat/chat-actor";
import { loadCanonicalChatHistory } from "@/lib/chat/chat-conversation-repository";
import { buildChatCycleIds } from "@/lib/chat/chat-idempotency";
import type { CanonicalChatTarget } from "@/lib/chat/chat-target-resolver";
import {
  LUCY_CYCLE_LIMITS,
  type LucyCycleOutput,
} from "@/lib/lucy/cycle-contract";
import { executeReservedLucyCycle } from "@/lib/lucy/cycle-coordinator";
import { admitPublicLucyCycle } from "@/lib/lucy/public-cycle-admission";

export interface CanonicalChatTurnResult {
  output: LucyCycleOutput;
  conversationId: string;
  replayed: boolean;
}

export async function executeCanonicalChatTurn(options: {
  actor: CanonicalChatActor;
  target: CanonicalChatTarget;
  message: string;
  idempotencyKey: string | null;
  signal?: AbortSignal;
}): Promise<CanonicalChatTurnResult> {
  const { requestId, turnId } = buildChatCycleIds({
    idempotencyKey: options.idempotencyKey,
    actorPrincipalType: options.actor.principalType,
    actorPrincipalId: options.actor.principalId,
  });
  const admission = await admitPublicLucyCycle({
    requestId,
    turnId,
    actor: options.actor,
    target: options.target,
    message: options.message,
    deadlineMs: LUCY_CYCLE_LIMITS.deadlineMilliseconds.max,
  });

  if (admission.kind === "replay") {
    return {
      output: admission.output,
      conversationId: admission.conversationId,
      replayed: true,
    };
  }

  const history = await loadCanonicalChatHistory(
    admission.conversation.id,
    LUCY_CYCLE_LIMITS.historyEntries,
    admission.input.turn_id,
  );
  const input = {
    ...admission.input,
    history: history.map((item) => ({
      turn_id: item.turnId,
      role: item.role,
      message: item.content.slice(
        0,
        LUCY_CYCLE_LIMITS.historyMessageCharacters,
      ),
    })),
  };
  const output = await executeReservedLucyCycle(input, admission.reservation, {
    signal: options.signal,
  });

  return {
    output,
    conversationId: admission.conversation.id,
    replayed: false,
  };
}
