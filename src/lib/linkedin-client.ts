import { decrypt, isEncryptionConfigured } from './encryption';
import { logger } from './server-logger';

const LINKEDIN_API_VERSION = '202411';

export interface LinkedInAccount {
  id: string;
  accessToken: string;
  isEncrypted: boolean;
  tokenExpiresAt: Date | null;
  linkedinUserId: string | null;
}

export interface LinkedInPostResult {
  success: boolean;
  postId: string | null;
}

/**
 * Get a valid (decrypted) LinkedIn access token.
 * LinkedIn tokens last 60 days with no refresh token — surfaces a clear error
 * if the token is expired so the user knows to reconnect.
 */
export function getLinkedInAccessToken(account: LinkedInAccount): string {
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) <= new Date()) {
    throw new Error(
      'Your LinkedIn access token has expired. Please reconnect your LinkedIn account in the Accounts tab.'
    );
  }

  let accessToken = account.accessToken;
  if (account.isEncrypted && isEncryptionConfigured()) {
    accessToken = decrypt(accessToken);
  }
  return accessToken;
}

/**
 * Upload an image to LinkedIn via the Images API.
 * Returns the image URN (e.g. "urn:li:image:C4D22AQH…") for use in post creation.
 *
 * @param accessToken - Decrypted LinkedIn access token
 * @param authorUrn   - LinkedIn person URN (e.g. "urn:li:person:{id}")
 * @param imageUrl    - Publicly accessible image URL
 * @param userId      - App user ID for logging
 */
export async function uploadLinkedInImage(
  accessToken: string,
  authorUrn: string,
  imageUrl: string,
  userId: string
): Promise<string> {
  logger.info(`Uploading image to LinkedIn from: ${imageUrl}`, { userId });

  // Step 1: Initialize upload
  const initRes = await fetch(
    'https://api.linkedin.com/rest/images?action=initializeUpload',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(`LinkedIn image upload initialization failed: ${JSON.stringify(err)}`);
  }

  const initData = await initRes.json();
  const uploadUrl: string = initData.value.uploadUrl;
  const imageUrn: string = initData.value.image;

  // Step 2: Fetch image and PUT to LinkedIn's presigned URL
  const imgFetch = await fetch(imageUrl);
  if (!imgFetch.ok) {
    throw new Error(
      `Failed to fetch image for LinkedIn upload (status ${imgFetch.status}): ${imageUrl}`
    );
  }

  const imgBuffer = await imgFetch.arrayBuffer();
  const contentType = imgFetch.headers.get('content-type') || 'image/jpeg';

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body: imgBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`LinkedIn image upload PUT failed (status ${uploadRes.status})`);
  }

  logger.info(`LinkedIn image uploaded: ${imageUrn}`, { userId });
  return imageUrn;
}

/**
 * Publish a post to LinkedIn. Handles text-only and single-image posts.
 * Uses the LinkedIn Posts REST API (2024).
 *
 * @param account          - SocialMediaAccount record (LinkedIn)
 * @param caption          - Post text (max 3,000 chars for personal; 700 for org pages)
 * @param resolvedImageUrl - Already-resolved public image URL, or null for text-only posts
 * @param userId           - App user ID for logging
 */
export async function publishPost(
  account: LinkedInAccount,
  caption: string,
  resolvedImageUrl: string | null,
  userId: string
): Promise<LinkedInPostResult> {
  const accessToken = getLinkedInAccessToken(account);

  if (!account.linkedinUserId) {
    throw new Error(
      'LinkedIn member ID is missing for this account. Please reconnect your LinkedIn account.'
    );
  }

  const authorUrn = `urn:li:person:${account.linkedinUserId}`;

  // Upload image if provided
  let imageUrn: string | null = null;
  if (resolvedImageUrl) {
    try {
      imageUrn = await uploadLinkedInImage(accessToken, authorUrn, resolvedImageUrl, userId);
    } catch (err: any) {
      logger.warn(`LinkedIn image upload failed, posting without image: ${err.message}`, { userId });
    }
  }

  // Build the post payload
  const postPayload: any = {
    author: authorUrn,
    commentary: caption,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  if (imageUrn) {
    postPayload.content = {
      media: {
        altText: 'Post image',
        id: imageUrn,
      },
    };
  }

  const postRes = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postPayload),
  });

  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({}));
    throw new Error(`LinkedIn post creation failed (${postRes.status}): ${JSON.stringify(err)}`);
  }

  // LinkedIn returns the post URN in the x-restli-id header
  const linkedinPostId =
    postRes.headers.get('x-restli-id') ||
    postRes.headers.get('X-RestLi-Id') ||
    null;

  logger.info(`LinkedIn post created: ${linkedinPostId}`, { userId });
  return { success: true, postId: linkedinPostId };
}
