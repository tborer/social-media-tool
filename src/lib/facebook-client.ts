import { logger } from './server-logger';

/**
 * Facebook Graph API client for publishing Page posts.
 */

const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com/v19.0';

export interface FacebookPostResult {
  postId: string;
}

/**
 * Publish a post to a Facebook Page.
 *
 * @param pageId - The Facebook Page ID
 * @param pageAccessToken - Page-scoped access token
 * @param message - Post message/caption
 * @param imageUrl - Optional image URL to attach
 */
export async function publishFacebookPost(
  pageId: string,
  pageAccessToken: string,
  message: string,
  imageUrl?: string | null
): Promise<FacebookPostResult> {
  let endpoint: string;
  const body: Record<string, string> = {
    access_token: pageAccessToken,
    message,
  };

  if (imageUrl) {
    // Photo post
    endpoint = `${FACEBOOK_GRAPH_URL}/${pageId}/photos`;
    body.url = imageUrl;
  } else {
    // Text-only post
    endpoint = `${FACEBOOK_GRAPH_URL}/${pageId}/feed`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('Facebook publish failed:', err);
    throw new Error(`Facebook publish failed: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return { postId: data.id || data.post_id };
}
