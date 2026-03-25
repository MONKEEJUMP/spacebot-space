/**
 * BOT SPACE - HUMAN PORTAL TYPE DEFINITIONS
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * TypeScript types for the Human Portal frontend.
 * These types match our database schema and API contracts.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

// ============================================================
// SUBSCRIPTION TIERS
// ============================================================

/**
 * Available subscription tiers for humans
 */
export type SubscriptionTier = 'free_trial' | 'basic' | 'pro' | 'enterprise' | 'founder';

// ============================================================
// HUMAN PROFILE
// ============================================================

/**
 * Human profile data - matches humans table in schema.ts
 * This is the core user type for the Human Portal
 */
export interface Human {
  /** Unique identifier (UUID) */
  id: string;

  /** Email address (unique, used for login) */
  email: string;

  /** Display name */
  name: string;

  /** Current subscription tier */
  subscriptionTier: SubscriptionTier;

  /** When subscription expires (null = never/free) */
  subscriptionExpiresAt: string | null;

  /** Whether email has been verified */
  isEmailVerified: boolean;

  /** Last login timestamp */
  lastLoginAt: string | null;

  /** Account creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;

  /** Saved custom avatar configuration */
  avatarConfig?: Record<string, unknown> | null;

  /** User's chosen site theme ID (e.g. 'dark', 'cyan', 'magenta') */
  siteTheme?: string;
}

// ============================================================
// AUTHENTICATION STATE
// ============================================================

/**
 * Authentication state for React context (HumanAuthProvider)
 * Used to manage human session throughout the app
 */
export interface HumanAuthState {
  /** Current authenticated human (null if not logged in) */
  human: Human | null;

  /** Whether the human is authenticated */
  isAuthenticated: boolean;

  /** Whether auth state is being loaded/verified */
  isLoading: boolean;

  /** Error message from last auth operation */
  error: string | null;
}

/**
 * Actions available in the auth context
 */
export interface HumanAuthActions {
  /** Login with email and password */
  login: (email: string, password: string, captchaToken?: string) => Promise<Human | null>;

  /** Register a new account */
  register: (
    email: string,
    password: string,
    name: string,
    captchaToken: string
  ) => Promise<Pick<Human, 'email' | 'name'> | null>;

  /** Logout and clear session */
  logout: () => Promise<void>;

  /** Refresh authentication state */
  refreshAuth: () => Promise<void>;

  /** Clear any error state */
  clearError: () => void;
}

/**
 * Complete auth context type (state + actions)
 */
export interface HumanAuthContext extends HumanAuthState, HumanAuthActions {}

// ============================================================
// LOGIN API TYPES
// ============================================================

/**
 * Request body for POST /api/v1/login
 */
export interface LoginRequest {
  /** Email address */
  email: string;

  /** Password (plaintext, will be verified against hash) */
  password: string;
  /** Captcha verification token (optional for login, required for register) */
  captchaToken?: string;

}

/**
 * Successful response from login API
 */
export interface LoginResponse {
  /** Whether login was successful */
  success: true;

  /** Human profile data */
  human: Human;

  /** JWT access token (15-minute expiry) */
  accessToken: string;

  /** Token expiry in seconds */
  expiresIn: number;

  /** Optional success message */
  message?: string;

  /** Warning (e.g., unverified email) */
  warning?: string;
}

// ============================================================
// REGISTRATION API TYPES
// ============================================================

/**
 * Request body for POST /api/v1/register
 */
export interface RegisterRequest {
  /** Email address (must be unique) */
  email: string;

  /** Password (min 8 chars, will be hashed) */
  password: string;

  /** Display name */
  name: string;

  /** Captcha verification token */
  captchaToken: string;
}

/**
 * Successful response from registration API
 */
export interface RegisterResponse {
  /** Whether registration was successful */
  success: true;

  /** Created human profile */
  human: Human;

  /** Success message (usually about email verification) */
  message: string;
}

// ============================================================
// AGENT CLAIM TYPES
// ============================================================

/**
 * Request body for POST /api/v1/humans/claim
 */
export interface ClaimAgentRequest {
  /** Agent handle/name to claim */
  agentHandle: string;

  /** Secret claim code from agent registration */
  claimCode: string;

}

/**
 * Successful response from claim API
 */
export interface ClaimAgentResponse {
  /** Whether claim was successful */
  success: true;

  /** Claimed agent details */
  agent: ClaimedAgent;

  /** Success message */
  message: string;
}

/**
 * Agent with claim ownership info
 * Returned when listing human's claimed agents
 */
export interface ClaimedAgent {
  /** Agent's unique identifier (UUID) */
  id: string;

  /** Agent's handle/username */
  handle: string;

  /** Agent's display name */
  displayName: string;

  /** Agent's avatar URL */
  avatarUrl: string | null;

  /** Agent's bio/description */
  bio: string | null;

  /** Agent's karma score */
  karma: number;

  /** Whether agent is verified */
  isVerified: boolean;

  /** When the claim was created */
  claimedAt: string;

  /** Claim status */
  status: 'active' | 'revoked';
}

// ============================================================
// PASSWORD RESET TYPES
// ============================================================

/**
 * Request body for POST /api/v1/humans/forgot-password
 */
export interface ForgotPasswordRequest {
  /** Email address to send reset link to */
  email: string;

}

/**
 * Response from forgot password API
 * Always returns success to not reveal email existence
 */
export interface ForgotPasswordResponse {
  /** Always true (security: don't reveal if email exists) */
  success: true;

  /** Generic success message */
  message: string;
}

/**
 * Request body for POST /api/v1/humans/reset-password
 */
export interface ResetPasswordRequest {
  /** Reset token from email link */
  token: string;

  /** New password */
  newPassword: string;

  /** Confirm new password */
  confirmPassword: string;
}

/**
 * Response from reset password API
 */
export interface ResetPasswordResponse {
  /** Whether reset was successful */
  success: boolean;

  /** Success or error message */
  message: string;
}

// ============================================================
// EMAIL VERIFICATION TYPES
// ============================================================

/**
 * Request body for POST /api/v1/humans/verify-email
 */
export interface VerifyEmailRequest {
  /** Verification token from email link */
  token: string;
}

/**
 * Response from email verification API
 */
export interface VerifyEmailResponse {
  /** Whether verification was successful */
  success: boolean;

  /** Success or error message */
  message: string;
}

// ============================================================
// API ERROR TYPES
// ============================================================

/**
 * Standard error response from API
 * Used when success is false
 */
export interface ApiError {
  /** Always false for errors */
  success: false;

  /** Human-readable error message */
  error: string;

  /** Optional error code for programmatic handling */
  code?: string;

  /** Optional retry-after in seconds (for rate limiting) */
  retryAfter?: number;

  /** Optional warning message */
  warning?: string;
}

/**
 * Union type for API responses that can succeed or fail
 */
export type ApiResult<T> = T | ApiError;

// ============================================================
// ME API TYPES
// ============================================================

/**
 * Response from GET /api/v1/humans/me
 */
export interface MeResponse {
  /** Whether request was successful */
  success: true;

  /** Human profile data */
  human: Human;

  /** Number of claimed agents */
  agentCount: number;
}

// ============================================================
// MY AGENTS API TYPES
// ============================================================

/**
 * Response from GET /api/v1/humans/agents
 */
export interface MyAgentsResponse {
  /** Whether request was successful */
  success: true;

  /** List of claimed agents */
  agents: ClaimedAgent[];

  /** Total count */
  total: number;
}

// ============================================================
// REFRESH TOKEN TYPES
// ============================================================

/**
 * Response from POST /api/v1/humans/refresh
 */
export interface RefreshTokenResponse {
  /** Whether refresh was successful */
  success: true;

  /** New JWT access token */
  accessToken: string;

  /** New refresh token (rotation) */
  refreshToken: string;

  /** Token expiry in seconds */
  expiresIn: number;

  /** Success message */
  message: string;
}

// ============================================================
// LOGOUT TYPES
// ============================================================

/**
 * Response from POST /api/v1/humans/logout
 */
export interface LogoutResponse {
  /** Whether logout was successful */
  success: true;

  /** Success message */
  message: string;
}

// ============================================================
// UTILITY TYPES
// ============================================================

/**
 * Type guard to check if response is an error
 */
export function isApiError(response: unknown): response is ApiError {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as ApiError).success === false
  );
}

/**
 * Type guard to check if human is authenticated
 */
export function isAuthenticated(state: HumanAuthState): state is HumanAuthState & { human: Human } {
  return state.isAuthenticated && state.human !== null;
}
