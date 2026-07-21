const AUTH_ENTRY_PATHS = new Set([
  "/login",
  "/register",
  "/sign-in",
  "/sign-up",
]);

export function getSafeHumanRedirect(
  requestedPath: string | null | undefined,
  fallbackPath: string,
): string {
  if (
    !requestedPath ||
    !requestedPath.startsWith("/") ||
    requestedPath.startsWith("//")
  ) {
    return fallbackPath;
  }

  try {
    const parsed = new URL(requestedPath, "https://www.spacebot.space");
    if (parsed.origin !== "https://www.spacebot.space") return fallbackPath;

    const pointsBackToAuth = [...AUTH_ENTRY_PATHS].some(
      (path) => parsed.pathname === path || parsed.pathname.startsWith(`${path}/`),
    );
    if (pointsBackToAuth) return fallbackPath;

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallbackPath;
  }
}
