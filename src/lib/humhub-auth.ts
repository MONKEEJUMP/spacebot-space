const HUMHUB_API_URL = process.env.HUMHUB_API_URL || 'http://localhost/api/v1';

export async function validateSession(
  request: Request,
  username: string
): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return false;

  try {
    // Call HumHub's current user endpoint with the session cookie
    const res = await fetch(`${HUMHUB_API_URL}/user/get-by-username?username=${encodeURIComponent(username)}`, {
      headers: { 'Cookie': cookieHeader },
    });

    if (!res.ok) return false;

    const data = await res.json();
    const authenticatedUsername = data?.account?.username || data?.username || '';

    return authenticatedUsername.toLowerCase() === username.toLowerCase();
  } catch (err) {
    console.error('[AUTH] Session validation error:', err);
    return false;
  }
}
