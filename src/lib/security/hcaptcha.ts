/**
 * BOT SPACE - CLOUDFLARE TURNSTILE SERVER-SIDE VERIFICATION
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Verifies Cloudflare Turnstile tokens server-side.
 * Replaces hCaptcha verification.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Verify a Cloudflare Turnstile response token server-side.
 *
 * @param token - The captcha response token from the client
 * @returns true if verification passed, false otherwise
 */
export async function verifyCaptcha(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;

  if (!secret) {
    console.error('[TURNSTILE] TURNSTILE_SECRET is not set in environment');
    return false;
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
      }),
    });

    const data: TurnstileResponse = await response.json();

    if (!data.success) {
      console.warn('[TURNSTILE] Verification failed:', data['error-codes']);
    }

    return data.success;
  } catch (error) {
    console.error('[TURNSTILE] Verification request failed:', error);
    return false;
  }
}
