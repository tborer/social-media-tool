import { logger } from './server-logger';

/**
 * LinkedIn OAuth 2.0 Helper
 *
 * Handles the LinkedIn Member Authorization Code Flow (OAuth 2.0).
 * LinkedIn does NOT return refresh tokens for the basic member auth flow;
 * access tokens are valid for 60 days and require re-authentication on expiry.
 *
 * Docs: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 *
 * Environment Variables Required:
 * - LINKEDIN_CLIENT_ID: LinkedIn app client ID (from LinkedIn Developer Portal)
 * - LINKEDIN_CLIENT_SECRET: LinkedIn app client secret
 * - LINKEDIN_REDIRECT_URI: OAuth callback URL (must match exactly what is set in the LinkedIn app)
 */

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

// Scopes required for posting and reading basic profile.
// openid + profile + email = OIDC scopes (LinkedIn Sign In with OIDC)
// w_member_social = permission to create, modify, and delete posts on behalf of members
const LINKEDIN_SCOPES = ['openid', 'profile', 'email', 'w_member_social'].join(' ');

// LinkedIn access tokens are valid for 60 days
const LINKEDIN_TOKEN_EXPIRY_SECONDS = 60 * 24 * 60 * 60;

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface LinkedInUserInfo {
  sub: string;          // LinkedIn member URN ID (numeric string)
  name: string;
  given_name: string;
  family_name: string;
  email?: string;
  picture?: string;
  locale?: { country: string; language: string };
}

/**
 * Get LinkedIn OAuth configuration from environment variables.
 */
export function getLinkedInConfig() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'LinkedIn OAuth is not configured. Please set LINKEDIN_CLIENT_ID, ' +
        'LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URI environment variables.'
    );
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Check whether LinkedIn OAuth environment variables are present.
 */
export function isLinkedInConfigured(): boolean {
  try {
    getLinkedInConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the LinkedIn OAuth authorization URL.
 * @param state - CSRF state token (base64url-encoded JSON with userId + nonce)
 */
export function getAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getLinkedInConfig();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: LINKEDIN_SCOPES,
    state,
  });

  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access token.
 * @param code - Authorization code from the OAuth callback
 */
export async function exchangeCodeForToken(code: string): Promise<LinkedInTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getLinkedInConfig();

  const response = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('LinkedIn token exchange failed:', err);
    throw new Error(
      `LinkedIn token exchange failed: ${(err as any).error_description || response.statusText}`
    );
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in ?? LINKEDIN_TOKEN_EXPIRY_SECONDS,
    token_type: data.token_type ?? 'Bearer',
  };
}

/**
 * Fetch the authenticated LinkedIn member's profile via OIDC userinfo endpoint.
 * @param accessToken - LinkedIn access token
 */
export async function getUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  const response = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('LinkedIn userinfo fetch failed:', err);
    throw new Error(
      `Failed to fetch LinkedIn user info: ${(err as any).message || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Calculate token expiration date from an expires_in seconds value.
 */
export function calculateExpirationDate(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

/**
 * Return true if the token will expire within the next 7 days.
 */
export function shouldRefreshToken(expiresAt: Date): boolean {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return expiresAt <= sevenDaysFromNow;
}
