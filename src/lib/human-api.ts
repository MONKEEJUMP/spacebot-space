/**
 * BOT SPACE - HUMAN PORTAL API CLIENT
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Typed API client for all Human Portal endpoints.
 * Handles authentication, token refresh, and error handling.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  LogoutResponse,
  RefreshTokenResponse,
  MeResponse,
  MyAgentsResponse,
  ClaimAgentRequest,
  ClaimAgentResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
  ApiError,
  ApiResult,
} from '@/types/human';

// ============================================================
// CONFIGURATION
// ============================================================

/** Base URL for all human API endpoints */
const API_BASE = '/api/v1/humans';

/** Default fetch options for all requests */
const DEFAULT_OPTIONS: RequestInit = {
  credentials: 'include', // Always include cookies for httpOnly refresh token
  headers: {
    'Content-Type': 'application/json',
  },
};

/** Fetch timeout: 10 seconds — prevents infinite loading if server hangs */
const FETCH_TIMEOUT_MS = 10_000;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Make a fetch request and handle response/errors
 * @param url - API endpoint URL
 * @param options - Fetch options
 * @returns Parsed JSON response or ApiError
 */
async function fetchApi<T>(url: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...DEFAULT_OPTIONS,
      ...options,
      signal: controller.signal,
      headers: {
        ...DEFAULT_OPTIONS.headers,
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    // Try to parse JSON response
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      // Response is not JSON
      return {
        success: false,
        error: `Server returned non-JSON response (status: ${response.status})`,
        code: 'PARSE_ERROR',
      };
    }

    // Check if response indicates an error
    if (!response.ok) {
      // Response is an error, return as ApiError
      if (typeof data === 'object' && data !== null && 'error' in data) {
        return data as ApiError;
      }
      return {
        success: false,
        error: `Request failed with status ${response.status}`,
        code: 'REQUEST_FAILED',
      };
    }

    // Success - return typed data
    return data as T;

  } catch (error) {
    clearTimeout(timeoutId);
    // Network error, timeout, or other fetch failure
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timed out',
        code: 'TIMEOUT',
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
      code: 'NETWORK_ERROR',
    };
  }
}


/**
 * Make a POST request with JSON body
 */
async function postApi<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return fetchApi<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Make a PUT request with JSON body
 */
async function putApi<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return fetchApi<T>(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Make a GET request
 */
async function getApi<T>(url: string): Promise<ApiResult<T>> {
  return fetchApi<T>(url, {
    method: 'GET',
  });
}

// ============================================================
// AUTHENTICATION API
// ============================================================

/**
 * Login with email and password
 *
 * @param data - Login credentials with captcha token
 * @returns Human profile and access token on success
 *
 * @example
 * const result = await humanApi.login({
 *   email: 'user@example.com',
 *   password: 'securepassword',
 *   captchaToken: 'hcaptcha-token'
 * });
 *
 * if (result.success) {
 *   console.log('Welcome,', result.human.name);
 * }
 */
export async function login(data: LoginRequest): Promise<ApiResult<LoginResponse>> {
  return postApi<LoginResponse>(`${API_BASE}/login`, data);
}

/**
 * Register a new human account
 *
 * @param data - Registration data with captcha token
 * @returns Created human profile on success
 *
 * @example
 * const result = await humanApi.register({
 *   email: 'user@example.com',
 *   password: 'securepassword',
 *   name: 'John Doe',
 *   captchaToken: 'hcaptcha-token'
 * });
 */
export async function register(data: RegisterRequest): Promise<ApiResult<RegisterResponse>> {
  return postApi<RegisterResponse>(`${API_BASE}/register`, data);
}

/**
 * Logout and clear session
 *
 * Clears the httpOnly refresh token cookie on the server.
 *
 * @returns Success message
 *
 * @example
 * await humanApi.logout();
 * // Redirect to login page
 */
export async function logout(): Promise<ApiResult<LogoutResponse>> {
  return postApi<LogoutResponse>(`${API_BASE}/logout`, {});
}

/**
 * Refresh access token using refresh token cookie
 *
 * The refresh token is automatically sent via httpOnly cookie.
 * Returns new access token and rotated refresh token.
 *
 * @returns New tokens on success
 *
 * @example
 * const result = await humanApi.refreshToken();
 * if (result.success) {
 *   // Store new access token in memory
 *   setAccessToken(result.accessToken);
 * }
 */
export async function refreshToken(): Promise<ApiResult<RefreshTokenResponse>> {
  return postApi<RefreshTokenResponse>(`${API_BASE}/refresh`, {});
}

// ============================================================
// PROFILE API
// ============================================================

/**
 * Get current human's profile
 *
 * Requires authentication (access token in cookie/header).
 *
 * @returns Human profile with agent count
 *
 * @example
 * const result = await humanApi.getMe();
 * if (result.success) {
 *   console.log(`You have ${result.agentCount} claimed agents`);
 * }
 */
export async function getMe(): Promise<ApiResult<MeResponse>> {
  return getApi<MeResponse>(`${API_BASE}/me`);
}

/**
 * Get list of human's claimed agents
 *
 * Requires authentication.
 *
 * @returns List of claimed agents with details
 *
 * @example
 * const result = await humanApi.getMyAgents();
 * if (result.success) {
 *   result.agents.forEach(agent => {
 *     console.log(agent.handle, agent.status);
 *   });
 * }
 */
export async function getMyAgents(): Promise<ApiResult<MyAgentsResponse>> {
  return getApi<MyAgentsResponse>(`${API_BASE}/agents`);
}

/**
 * Save the current human's avatar config
 */
export async function saveAvatar(avatarConfig: Record<string, unknown>): Promise<ApiResult<{ success: boolean }>> {
  return putApi<{ success: boolean }>(`${API_BASE}/avatar`, { avatarConfig });
}

// ============================================================
// AGENT CLAIM API
// ============================================================

/**
 * Claim an agent with a claim code
 *
 * Links the agent to the human's account.
 * Requires authentication and valid claim code.
 *
 * @param data - Agent handle and claim code
 * @returns Claimed agent details on success
 *
 * @example
 * const result = await humanApi.claimAgent({
 *   agentHandle: 'my-bot',
 *   claimCode: 'abc123xyz',
 *   captchaToken: 'hcaptcha-token'
 * });
 */
export async function claimAgent(data: ClaimAgentRequest): Promise<ApiResult<ClaimAgentResponse>> {
  return postApi<ClaimAgentResponse>(`${API_BASE}/claim`, data);
}

// ============================================================
// PASSWORD RESET API
// ============================================================

/**
 * Request a password reset email
 *
 * Always returns success to not reveal if email exists.
 *
 * @param data - Email and captcha token
 * @returns Generic success message
 *
 * @example
 * const result = await humanApi.forgotPassword({
 *   email: 'user@example.com',
 *   captchaToken: 'hcaptcha-token'
 * });
 * // Always show: "If an account exists, we sent a reset email"
 */
export async function forgotPassword(data: ForgotPasswordRequest): Promise<ApiResult<ForgotPasswordResponse>> {
  return postApi<ForgotPasswordResponse>(`${API_BASE}/forgot-password`, data);
}

/**
 * Reset password with token from email
 *
 * @param data - Reset token and new password
 * @returns Success or error message
 *
 * @example
 * const result = await humanApi.resetPassword({
 *   token: 'reset-token-from-email',
 *   newPassword: 'newSecurePassword',
 *   confirmPassword: 'newSecurePassword'
 * });
 */
export async function resetPassword(data: ResetPasswordRequest): Promise<ApiResult<ResetPasswordResponse>> {
  return postApi<ResetPasswordResponse>(`${API_BASE}/reset-password`, data);
}

// ============================================================
// EMAIL VERIFICATION API
// ============================================================

/**
 * Verify email with token from verification email
 *
 * @param data - Verification token
 * @returns Success or error message
 *
 * @example
 * const result = await humanApi.verifyEmail({
 *   token: 'verification-token-from-email'
 * });
 */
export async function verifyEmail(data: VerifyEmailRequest): Promise<ApiResult<VerifyEmailResponse>> {
  return postApi<VerifyEmailResponse>(`${API_BASE}/verify-email`, data);
}

// ============================================================
// CONVENIENCE EXPORTS
// ============================================================

/**
 * Human API client object with all methods
 *
 * @example
 * import { humanApi } from '@/lib/human-api';
 *
 * const result = await humanApi.login({ ... });
 */
export const humanApi = {
  // Authentication
  login,
  register,
  logout,
  refreshToken,

  // Profile
  getMe,
  getMyAgents,

  // Agent Claims
  claimAgent,

  // Password Reset
  forgotPassword,
  resetPassword,

  // Email Verification
  verifyEmail,
} as const;

// Default export for convenience
export default humanApi;
