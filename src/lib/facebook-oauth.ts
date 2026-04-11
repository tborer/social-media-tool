import { logger } from './server-logger';

/**
 * Facebook OAuth 2.0 Helper
 *
 * Handles the Facebook Login flow for connecting Facebook Pages.
 * Uses the Meta Graph API to authorize, exchange tokens, and fetch managed Pages.
 *
 * Environment Variables Required:
 * - FACEBOOK_APP_ID: Your Facebook App ID (from Meta app dashboard)
 * - FACEBOOK_APP_SECRET: Your Facebook App Secret
 * - FACEBOOK_REDIRECT_URI: OAuth callback URL
 */

const FACEBOOK_OAUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const FACEBOOK_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com/v19.0';

const FACEBOOK_SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
  'public_profile',
].join(',');

export interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string; // Page-scoped token (does not expire when derived from long-lived user token)
}

export function getFacebookConfig() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new Error(
      'Facebook OAuth not configured. Set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI.'
    );
  }

  return { appId, appSecret, redirectUri };
}

export function isFacebookConfigured(): boolean {
  try {
    getFacebookConfig();
    return true;
  } catch {
    return false;
  }
}

export function getAuthorizationUrl(state?: string): string {
  const config = getFacebookConfig();

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: FACEBOOK_SCOPES,
    response_type: 'code',
    ...(state && { state }),
  });

  return `${FACEBOOK_OAUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<FacebookTokenResponse> {
  const config = getFacebookConfig();

  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });

  const response = await fetch(`${FACEBOOK_TOKEN_URL}?${params.toString()}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('Facebook token exchange failed:', err);
    throw new Error(`Facebook token exchange failed: ${err.error?.message || response.statusText}`);
  }

  return response.json();
}

export async function exchangeForLongLivedToken(shortToken: string): Promise<FacebookTokenResponse> {
  const config = getFacebookConfig();

  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortToken,
  });

  const response = await fetch(`${FACEBOOK_TOKEN_URL}?${params.toString()}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('Facebook long-lived token exchange failed:', err);
    throw new Error(`Long-lived token exchange failed: ${err.error?.message || response.statusText}`);
  }

  return response.json();
}

export async function getManagedPages(userAccessToken: string): Promise<FacebookPage[]> {
  const params = new URLSearchParams({
    access_token: userAccessToken,
    fields: 'id,name,access_token',
  });

  const response = await fetch(`${FACEBOOK_GRAPH_URL}/me/accounts?${params.toString()}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('Facebook pages fetch failed:', err);
    throw new Error(`Failed to fetch pages: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return (data.data || []) as FacebookPage[];
}

export async function getUserProfile(accessToken: string): Promise<{ id: string; name: string }> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'id,name',
  });

  const response = await fetch(`${FACEBOOK_GRAPH_URL}/me?${params.toString()}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Failed to fetch profile: ${err.error?.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Calls GET /me?fields=id,name with the given token.
 *
 * For a *user* access token this returns the user's profile.
 * For a *page* access token this returns the Page's own info
 * (id, name) — useful for detecting and handling page-scoped tokens.
 *
 * Returns null instead of throwing if the request fails.
 */
export async function getTokenSelf(
  accessToken: string
): Promise<{ id: string; name: string } | null> {
  try {
    const params = new URLSearchParams({ access_token: accessToken, fields: 'id,name' });
    const response = await fetch(`${FACEBOOK_GRAPH_URL}/me?${params.toString()}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.id && data?.name) return { id: data.id, name: data.name };
    return null;
  } catch {
    return null;
  }
}
