const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMAND_ID_PATTERN = /^lucy:v2:[1-9][0-9]*:[0-9a-f-]{36}:[0-9]+$/;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type LucyAutonomyActionInput =
  | {
      workerId: string;
      commandId: string;
      controlRevision: number;
      leaseToken: string;
      action: "post";
      title: string;
      content: string;
    }
  | {
      workerId: string;
      commandId: string;
      controlRevision: number;
      leaseToken: string;
      action: "comment";
      targetPostId: string;
      content: string;
    }
  | {
      workerId: string;
      commandId: string;
      controlRevision: number;
      leaseToken: string;
      action: "profile";
      bio: string;
    }
  | {
      workerId: string;
      commandId: string;
      controlRevision: number;
      leaseToken: string;
      action: "learn" | "rest";
      reason: string;
    };

export type LucyContractResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function boundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minimum &&
    value.length <= maximum
  );
}

export function validateLucyAutonomyStateInput(
  value: unknown,
): LucyContractResult<{ workerId: string }> {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["worker_id"]) ||
    typeof value.worker_id !== "string" ||
    !UUID_PATTERN.test(value.worker_id)
  ) {
    return { success: false, errors: ["Invalid autonomy state request."] };
  }
  return { success: true, data: { workerId: value.worker_id } };
}

export function validateLucyAutonomyActionInput(
  value: unknown,
): LucyContractResult<LucyAutonomyActionInput> {
  if (!isRecord(value)) {
    return { success: false, errors: ["Invalid autonomy action request."] };
  }
  const {
    worker_id: workerId,
    command_id: commandId,
    control_revision: controlRevision,
    lease_token: leaseToken,
    action,
  } = value;
  if (
    typeof workerId !== "string" ||
    !UUID_PATTERN.test(workerId) ||
    typeof commandId !== "string" ||
    !COMMAND_ID_PATTERN.test(commandId) ||
    typeof controlRevision !== "number" ||
    !Number.isSafeInteger(controlRevision) ||
    controlRevision < 1 ||
    typeof leaseToken !== "string" ||
    !LEASE_TOKEN_PATTERN.test(leaseToken)
  ) {
    return { success: false, errors: ["Invalid autonomy action authority."] };
  }

  const common = { workerId, commandId, controlRevision, leaseToken };
  if (action === "post") {
    if (
      !exactKeys(value, [
        "action",
        "command_id",
        "content",
        "control_revision",
        "lease_token",
        "title",
        "worker_id",
      ]) ||
      !boundedString(value.title, 1, 300) ||
      !boundedString(value.content, 1, 2_000)
    ) {
      return { success: false, errors: ["Invalid autonomous post."] };
    }
    return {
      success: true,
      data: {
        ...common,
        action,
        title: value.title.trim(),
        content: value.content.trim(),
      },
    };
  }
  if (action === "comment") {
    if (
      !exactKeys(value, [
        "action",
        "command_id",
        "content",
        "control_revision",
        "lease_token",
        "target_post_id",
        "worker_id",
      ]) ||
      typeof value.target_post_id !== "string" ||
      !UUID_PATTERN.test(value.target_post_id) ||
      !boundedString(value.content, 1, 1_000)
    ) {
      return { success: false, errors: ["Invalid autonomous comment."] };
    }
    return {
      success: true,
      data: {
        ...common,
        action,
        targetPostId: value.target_post_id,
        content: value.content.trim(),
      },
    };
  }
  if (action === "profile") {
    if (
      !exactKeys(value, [
        "action",
        "bio",
        "command_id",
        "control_revision",
        "lease_token",
        "worker_id",
      ]) ||
      !boundedString(value.bio, 1, 200)
    ) {
      return { success: false, errors: ["Invalid autonomous profile."] };
    }
    return {
      success: true,
      data: { ...common, action, bio: value.bio.trim() },
    };
  }
  if (action === "learn" || action === "rest") {
    if (
      !exactKeys(value, [
        "action",
        "command_id",
        "control_revision",
        "lease_token",
        "reason",
        "worker_id",
      ]) ||
      !boundedString(value.reason, 1, 300)
    ) {
      return { success: false, errors: ["Invalid autonomous no-op."] };
    }
    return {
      success: true,
      data: { ...common, action, reason: value.reason.trim() },
    };
  }

  return { success: false, errors: ["Unsupported autonomy action."] };
}
