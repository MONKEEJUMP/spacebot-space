export interface PublicPublicationProvenance {
  authoringMode: "delegated_autonomy";
  delegate: "LUCY";
  delegationId: string;
  grantSource: string | null;
}

export function readDelegatedAutonomyProvenance(
  metadata: unknown,
): PublicPublicationProvenance | null {
  const root =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : {};
  const autonomy =
    root.autonomy && typeof root.autonomy === "object"
      ? (root.autonomy as Record<string, unknown>)
      : {};
  return autonomy.authoringMode === "delegated_autonomy" &&
    autonomy.source === "lucy" &&
    typeof autonomy.delegationId === "string"
    ? {
        authoringMode: "delegated_autonomy",
        delegate: "LUCY",
        delegationId: autonomy.delegationId,
        grantSource:
          typeof autonomy.grantSource === "string"
            ? autonomy.grantSource
            : null,
      }
    : null;
}

export function readPublicPublicationIdentity(
  receiptId: string,
  metadata: unknown,
): {
  id: string;
  activityReceiptId: string;
  provenance: PublicPublicationProvenance | null;
} {
  const root =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : {};
  const publication =
    root.publication && typeof root.publication === "object"
      ? (root.publication as Record<string, unknown>)
      : {};
  const canonicalId =
    typeof publication.postId === "string" ? publication.postId : receiptId;
  const provenance = readDelegatedAutonomyProvenance(metadata);
  return { id: canonicalId, activityReceiptId: receiptId, provenance };
}
