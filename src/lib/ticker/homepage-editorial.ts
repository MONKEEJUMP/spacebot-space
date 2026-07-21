const HOMEPAGE_EDITORIAL_FRESHNESS_MS = 2 * 60 * 60 * 1000;

interface HomepageEditorialHeadline {
  editorApproved?: boolean | null;
  editorReviewedAt?: Date | string | null;
  publishedAt?: Date | string | null;
}

function toTimestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function isHomepageEditorialPreferred(
  headline: HomepageEditorialHeadline,
): boolean {
  if (!headline.editorApproved) return false;

  const reviewedAt = toTimestamp(headline.editorReviewedAt);
  if (!reviewedAt) return false;

  return Date.now() - reviewedAt <= HOMEPAGE_EDITORIAL_FRESHNESS_MS;
}

export function compareHomepageHeadlines(
  left: HomepageEditorialHeadline,
  right: HomepageEditorialHeadline,
): number {
  const leftPreferred = isHomepageEditorialPreferred(left);
  const rightPreferred = isHomepageEditorialPreferred(right);

  if (leftPreferred !== rightPreferred) {
    return leftPreferred ? -1 : 1;
  }

  return (
    toTimestamp(right.editorReviewedAt ?? right.publishedAt) -
    toTimestamp(left.editorReviewedAt ?? left.publishedAt)
  );
}
