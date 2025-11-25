import { logger } from './logger';

/**
 * Instagram OAuth 2.0 Helper
 *
 * Handles Instagram OAuth flow and token management
 * Docs: https://developers.facebook.com/docs/instagram-basic-display-api/getting-started
 *
 * Environment Variables Required:
 * - INSTAGRAM_APP_ID: Your Instagram App ID
 * - INSTAGRAM_APP_SECRET: Your Instagram App Secret
 * - INSTAGRAM_REDIRECT_URI: OAuth callback URL
 * - NEXT_PUBLIC_APP_URL: Your application URL
 */

const INSTAGRAM_OAUTH_URL = 'https://api.instagram.com/oauth/authorize';
const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_GRAPH_API_URL = 'https://graph.instagram.com';
const INSTAGRAM_LONG_LIVED_TOKEN_URL = 'https://graph.instagram.com/access_token';
const INSTAGRAM_REFRESH_TOKEN_URL = 'https://graph.instagram.com/refresh_access_token';

// Token expiration times
const SHORT_LIVED_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds
const LONG_LIVED_TOKEN_EXPIRY = 60 * 24 * 60 * 60; // 60 days in seconds

export interface InstagramTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface InstagramLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface InstagramUserInfo {
  id: string;
  username: string;
  account_type?: string;
  media_count?: number;
}

/**
 * Get Instagram OAuth configuration from environment
 */
export function getInstagramConfig() {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new Error(
      'Instagram OAuth not configured. Please set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and INSTAGRAM_REDIRECT_URI environment variables.'
    );
  }

  return {
    appId,
    appSecret,
    redirectUri,
  };
}

/**
 * Generate Instagram OAuth authorization URL
 * @param state - Optional state parameter for CSRF protection
 * @returns Authorization URL to redirect user to
 */
export function getAuthorizationUrl(state?: string): string {
  const config = getInstagramConfig();

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: 'user_profile,user_media',
    response_type: 'code',
    ...(state && { state }),
  });

  return `${INSTAGRAM_OAUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 * @param code - Authorization code from OAuth callback
 * @returns Short-lived access token response
 */
export async function exchangeCodeForToken(code: string): Promise<InstagramTokenResponse> {
  const config = getInstagramConfig();

  try {
    const response = await fetch(INSTAGRAM_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('Instagram token exchange failed:', errorData);
      throw new Error(
        `Token exchange failed: ${errorData.error_message || response.statusText}`
      );
    }

    const data = await response.json();

    return {
      access_token: data.access_token,
      token_type: data.token_type || 'bearer',
      expires_in: SHORT_LIVED_TOKEN_EXPIRY,
    };
  } catch (error) {
    logger.error('Error exchanging code for token:', error);
    throw error;
  }
}

/**
 * Exchange short-lived token for long-lived token
 * Long-lived tokens are valid for 60 days
 * @param shortLivedToken - Short-lived access token
 * @returns Long-lived access token response
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<InstagramLongLivedTokenResponse> {
  const config = getInstagramConfig();

  try {
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: config.appSecret,
      access_token: shortLivedToken,
    });

    const response = await fetch(`${INSTAGRAM_LONG_LIVED_TOKEN_URL}?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('Instagram long-lived token exchange failed:', errorData);
      throw new Error(
        `Long-lived token exchange failed: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();

    return {
      access_token: data.access_token,
      token_type: data.token_type || 'bearer',
      expires_in: data.expires_in || LONG_LIVED_TOKEN_EXPIRY,
    };
  } catch (error) {
    logger.error('Error exchanging for long-lived token:', error);
    throw error;
  }
}

/**
 * Refresh a long-lived access token
 * Tokens should be refreshed before they expire (within 24 hours of expiration recommended)
 * @param accessToken - Current long-lived access token
 * @returns New long-lived access token response
 */
export async function refreshAccessToken(
  accessToken: string
): Promise<InstagramLongLivedTokenResponse> {
  try {
    const params = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: accessToken,
    });

    const response = await fetch(`${INSTAGRAM_REFRESH_TOKEN_URL}?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('Instagram token refresh failed:', errorData);
      throw new Error(
        `Token refresh failed: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();

    return {
      access_token: data.access_token,
      token_type: data.token_type || 'bearer',
      expires_in: data.expires_in || LONG_LIVED_TOKEN_EXPIRY,
    };
  } catch (error) {
    logger.error('Error refreshing access token:', error);
    throw error;
  }
}

/**
 * Get Instagram user information
 * @param accessToken - Access token
 * @returns User information
 */
export async function getUserInfo(accessToken: string): Promise<InstagramUserInfo> {
  try {
    const params = new URLSearchParams({
      fields: 'id,username,account_type,media_count',
      access_token: accessToken,
    });

    const response = await fetch(`${INSTAGRAM_GRAPH_API_URL}/me?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('Instagram user info fetch failed:', errorData);
      throw new Error(
        `Failed to fetch user info: ${errorData.error?.message || response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    logger.error('Error fetching user info:', error);
    throw error;
  }
}

/**
 * Check if a token needs to be refreshed
 * Returns true if token expires within 7 days
 * @param expiresAt - Token expiration date
 * @returns true if token should be refreshed
 */
export function shouldRefreshToken(expiresAt: Date): boolean {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return expiresAt <= sevenDaysFromNow;
}

/**
 * Calculate token expiration date
 * @param expiresIn - Seconds until expiration
 * @returns Expiration date
 */
export function calculateExpirationDate(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

/**
 * Validate Instagram configuration
 * @returns true if configuration is valid
 */
export function isInstagramConfigured(): boolean {
  try {
    getInstagramConfig();
    return true;
  } catch {
    return false;
  }
}
