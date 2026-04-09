import { logger } from './server-logger';

/**
 * Bluesky (AT Protocol) Client
 *
 * Handles Bluesky authentication via App Passwords and post publishing.
 * Uses the AT Protocol XRPC API endpoints.
 *
 * No environment variables required — users provide their handle + App Password.
 */

const BLUESKY_API_URL = 'https://bsky.social/xrpc';

export interface BlueskySession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

export interface BlueskyPostResult {
  uri: string;
  cid: string;
}

/**
 * Create an authenticated session with Bluesky using handle + App Password.
 */
export async function createSession(handle: string, appPassword: string): Promise<BlueskySession> {
  const response = await fetch(`${BLUESKY_API_URL}/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('Bluesky session creation failed:', err);
    throw new Error(`Bluesky auth failed: ${err.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    did: data.did,
    handle: data.handle,
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt,
  };
}

/**
 * Refresh an existing Bluesky session using the refresh JWT.
 */
export async function refreshSession(refreshJwt: string): Promise<BlueskySession> {
  const response = await fetch(`${BLUESKY_API_URL}/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshJwt}`,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('Bluesky session refresh failed:', err);
    throw new Error(`Bluesky session refresh failed: ${err.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    did: data.did,
    handle: data.handle,
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt,
  };
}

/**
 * Upload a blob (image) to Bluesky for embedding in a post.
 */
export async function uploadBlob(
  accessJwt: string,
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ blob: any }> {
  const response = await fetch(`${BLUESKY_API_URL}/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      Authorization: `Bearer ${accessJwt}`,
    },
    body: imageBuffer,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Bluesky blob upload failed: ${err.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Create a post (record) on Bluesky.
 */
export async function createPost(
  accessJwt: string,
  did: string,
  text: string,
  imageBlob?: any
): Promise<BlueskyPostResult> {
  const record: any = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
  };

  if (imageBlob) {
    record.embed = {
      $type: 'app.bsky.embed.images',
      images: [{ alt: '', image: imageBlob }],
    };
  }

  const response = await fetch(`${BLUESKY_API_URL}/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessJwt}`,
    },
    body: JSON.stringify({
      repo: did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    logger.error('Bluesky post creation failed:', err);
    throw new Error(`Bluesky post failed: ${err.message || response.statusText}`);
  }

  return response.json();
}
