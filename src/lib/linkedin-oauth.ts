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
 *
 * LinkedIn Developer Portal — Products required:
 * - "Share on LinkedIn"   → grants w_member_social scope (post on behalf of member)
 * - "Sign In with LinkedIn" → grants profile, email scopes (read basic profile)
 * NOTE: "Sign In with LinkedIn using OpenID Connect" is a separate product that grants
 * the `openid` scope. We do NOT use that product or scope here. Instead we use the
 * standard /v2/me REST endpoint which only requires the `profile` scope.
 */

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

// Standard LinkedIn v2 profile endpoint — requires `profile` scope only (no openid needed)
const LINKEDIN_ME_URL = 'https://api.linkedin.com/v2/me';

// Scopes:
//   profile         — read member's basic profile (id, name) via /v2/me
//   email           — read member's primary email address
//   w_member_social — create, modify, delete posts on behalf of the member
// The `openid` scope is intentionally omitted: it requires the "Sign In with LinkedIn
// using OpenID Connect" product which is not available to all LinkedIn apps.
const LINKEDIN_SCOPES = ['profile', 'email', 'w_member_social'].join(' ');

// LinkedIn access tokens are valid for 60 days
const LINKEDIN_TOKEN_EXPIRY_SECONDS = 60 * 24 * 60 * 60;

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface LinkedInUserInfo {
  sub: string;          // LinkedIn member ID (numeric string)
  name: string;
  given_name: string;
  family_name: string;
  email?: string;
  picture?: string;
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

  const url = `${LINKEDIN_AUTH_URL}?${params.toString()}`;
  logger.info('Built LinkedIn authorization URL', {
    redirectUri,
    scopes: LINKEDIN_SCOPES,
    // Do not log clientId or state in full for security, but log enough to debug
    clientIdPrefix: clientId.slice(0, 4) + '...',
  });
  return url;
}

/**
 * Exchange an authorization code for an access token.
 * @param code - Authorization code from the OAuth callback
 */
export async function exchangeCodeForToken(code: string): Promise<LinkedInTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getLinkedInConfig();

  logger.info('Exchanging LinkedIn authorization code for access token', { redirectUri });

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
    logger.error('LinkedIn token exchange failed', {
      status: response.status,
      statusText: response.statusText,
      error: err,
    });
    throw new Error(
      `LinkedIn token exchange failed (HTTP ${response.status}): ${
        (err as any).error_description || (err as any).error || response.statusText
      }`
    );
  }

  const data = await response.json();
  logger.info('LinkedIn token exchange succeeded', {
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    hasAccessToken: !!data.access_token,
  });

  return {
    access_token: data.access_token,
    expires_in: data.expires_in ?? LINKEDIN_TOKEN_EXPIRY_SECONDS,
    token_type: data.token_type ?? 'Bearer',
  };
}

/**
 * Fetch the authenticated LinkedIn member's basic profile using the /v2/me endpoint.
 * This requires only the `profile` scope — no OIDC / `openid` scope needed.
 *
 * @param accessToken - LinkedIn access token
 */
export async function getUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  // Request only the fields we need to keep the response minimal
  const url = `${LINKEDIN_ME_URL}?projection=(id,localizedFirstName,localizedLastName)`;

  logger.info('Fetching LinkedIn member profile from /v2/me');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('LinkedIn /v2/me fetch failed', {
      status: response.status,
      statusText: response.statusText,
      body,
    });
    throw new Error(
      `Failed to fetch LinkedIn member profile (HTTP ${response.status}): ${body || response.statusText}`
    );
  }

  const data = await response.json();
  logger.info('LinkedIn /v2/me response received', {
    hasId: !!data.id,
    hasFirstName: !!data.localizedFirstName,
    hasLastName: !!data.localizedLastName,
  });

  if (!data.id) {
    logger.error('LinkedIn /v2/me response missing member id', { data });
    throw new Error('LinkedIn profile response did not include a member ID. Check that the `profile` scope is enabled for your LinkedIn app.');
  }

  const given_name: string = data.localizedFirstName ?? '';
  const family_name: string = data.localizedLastName ?? '';
  const name = [given_name, family_name].filter(Boolean).join(' ') || data.id;

  return {
    sub: data.id,
    name,
    given_name,
    family_name,
  };
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
