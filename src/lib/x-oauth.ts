import crypto from 'crypto';
import { logger } from './server-logger';

/**
 * X (Twitter) OAuth 2.0 with PKCE Helper
 *
 * Implements the Authorization Code Flow with PKCE for X API v2.
 * X requires PKCE for all clients.  The `offline.access` scope grants a
 * refresh token that rotates on every use.
 *
 * Docs: https://developer.twitter.com/en/docs/authentication/oauth-2-0/authorization-code
 *
 * Environment Variables Required:
 * - X_CLIENT_ID: X app OAuth 2.0 Client ID (from X Developer Portal)
 * - X_CLIENT_SECRET: X app OAuth 2.0 Client Secret (confidential client)
 * - X_REDIRECT_URI: OAuth callback URL (must match exactly what is set in the X app)
 */

const X_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const X_USERINFO_URL = 'https://api.twitter.com/2/users/me';
const X_REVOKE_URL = 'https://api.twitter.com/2/oauth2/revoke';

// Scopes: read tweets, write tweets, read user profile, and offline access (refresh tokens)
const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'].join(' ');

// X access tokens expire after 2 hours; refresh tokens do not expire but rotate on use
const X_ACCESS_TOKEN_EXPIRY_SECONDS = 2 * 60 * 60;

export interface XTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface XUserInfo {
  id: string;       // X numeric user ID (string)
  name: string;
  username: string; // @handle without the @
}

/**
 * Get X OAuth configuration from environment variables.
 */
export function getXConfig() {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = process.env.X_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'X OAuth is not configured. Please set X_CLIENT_ID, X_CLIENT_SECRET, ' +
        'and X_REDIRECT_URI environment variables.'
    );
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Check whether X OAuth environment variables are present.
 */
export function isXConfigured(): boolean {
  try {
    getXConfig();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random PKCE code verifier (43–128 characters,
 * URL-safe base64 without padding).
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url');
}

/**
 * Derive the PKCE code challenge from a verifier using SHA-256.
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ---------------------------------------------------------------------------
// OAuth flow
// ---------------------------------------------------------------------------

/**
 * Build the X OAuth 2.0 authorization URL.
 *
 * The code_verifier is embedded inside the state parameter (base64url JSON)
 * so it can be retrieved in the callback without server-side session storage.
 *
 * @param state - Base64url-encoded JSON containing { userId, nonce, codeVerifier }
 * @param codeChallenge - SHA-256 hash of the code verifier
 */
export function getAuthorizationUrl(state: string, codeChallenge: string): string {
  const { clientId, redirectUri } = getXConfig();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: X_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${X_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 *
 * @param code - Authorization code from the OAuth callback
 * @param codeVerifier - Original PKCE code verifier (must match the challenge sent in the auth URL)
 */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<XTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getXConfig();

  // X uses HTTP Basic auth for confidential clients
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('X token exchange failed:', err);
    throw new Error(
      `X token exchange failed: ${(err as any).error_description || (err as any).error || response.statusText}`
    );
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type ?? 'bearer',
    expires_in: data.expires_in ?? X_ACCESS_TOKEN_EXPIRY_SECONDS,
    scope: data.scope ?? X_SCOPES,
  };
}

/**
 * Refresh an X access token using a refresh token.
 * X refresh tokens rotate on every use — always store the new refresh token.
 *
 * @param refreshToken - Current refresh token (will be invalidated after this call)
 */
export async function refreshAccessToken(refreshToken: string): Promise<XTokenResponse> {
  const { clientId, clientSecret } = getXConfig();

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('X token refresh failed:', err);
    throw new Error(
      `X token refresh failed: ${(err as any).error_description || (err as any).error || response.statusText}`
    );
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type ?? 'bearer',
    expires_in: data.expires_in ?? X_ACCESS_TOKEN_EXPIRY_SECONDS,
    scope: data.scope ?? X_SCOPES,
  };
}

/**
 * Fetch the authenticated X user's profile.
 * @param accessToken - X access token
 */
export async function getUserInfo(accessToken: string): Promise<XUserInfo> {
  const response = await fetch(`${X_USERINFO_URL}?user.fields=id,name,username`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('X userinfo fetch failed:', err);
    throw new Error(
      `Failed to fetch X user info: ${(err as any).detail || response.statusText}`
    );
  }

  const body = await response.json();
  // X v2 wraps results in { data: { id, name, username } }
  return body.data as XUserInfo;
}

/**
 * Revoke an X token (access or refresh).
 * @param token - Token to revoke
 * @param tokenTypeHint - 'access_token' or 'refresh_token'
 */
export async function revokeToken(
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token'
): Promise<void> {
  const { clientId, clientSecret } = getXConfig();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  await fetch(X_REVOKE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({ token, token_type_hint: tokenTypeHint }),
  }).catch((err) => logger.warn('X token revocation failed (non-fatal):', err));
}

/**
 * Calculate token expiration date from an expires_in seconds value.
 */
export function calculateExpirationDate(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

/**
 * Return true if the token will expire within the next 10 minutes.
 * X access tokens are short-lived (2 hours); use this before making API calls.
 */
export function isTokenExpiringSoon(expiresAt: Date): boolean {
  const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
  return expiresAt <= tenMinutesFromNow;
}
