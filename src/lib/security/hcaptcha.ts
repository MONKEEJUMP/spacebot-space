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

import { logger } from "@/lib/logger";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileResponse {
  success: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

interface TurnstileVerificationOptions {
  expectedAction?: string;
  remoteIp?: string;
}

/**
 * Verify a Cloudflare Turnstile response token server-side.
 *
 * @param token - The captcha response token from the client
 * @returns true if verification passed, false otherwise
 */
export async function verifyCaptcha(
  token: string,
  options: TurnstileVerificationOptions = {},
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;

  if (!secret) {
    logger.error("Turnstile secret is not configured");
    return false;
  }

  try {
    const payload = new URLSearchParams({ secret, response: token });
    if (options.remoteIp && options.remoteIp !== "unknown") {
      payload.set("remoteip", options.remoteIp);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload,
    });

    const data: TurnstileResponse = await response.json();

    if (!data.success) {
      logger.warn("Turnstile verification failed", {
        errorCodes: data["error-codes"],
      });
      return false;
    }

    if (options.expectedAction && data.action !== options.expectedAction) {
      logger.warn("Turnstile action mismatch", {
        expectedAction: options.expectedAction,
        receivedAction: data.action,
      });
      return false;
    }

    const allowedHostnames = (
      process.env.TURNSTILE_ALLOWED_HOSTNAMES ||
      (process.env.NODE_ENV === "production"
        ? "spacebot.space,www.spacebot.space"
        : "localhost,127.0.0.1,spacebot.space,www.spacebot.space")
    )
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean);
    if (
      !data.hostname ||
      !allowedHostnames.includes(data.hostname.toLowerCase())
    ) {
      logger.warn("Turnstile hostname mismatch", {
        receivedHostname: data.hostname,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Turnstile verification request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
