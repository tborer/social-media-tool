import {
  refreshAccessToken as refreshXToken,
  calculateExpirationDate as calcXExpiry,
} from './x-oauth';
import { decrypt, encrypt, isEncryptionConfigured } from './encryption';
import { logger } from './server-logger';
import prisma from './prisma';

export interface XAccount {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  isEncrypted: boolean;
  tokenExpiresAt: Date | null;
}

export interface XPostResult {
  success: boolean;
  tweetId: string;
  tweetIds: string[];
}

/**
 * Split a long caption into tweet-sized chunks (≤ 280 chars each).
 * Adds a " (N/M)" thread counter suffix when splitting into multiple tweets.
 * Splits on word boundaries where possible.
 */
export function splitIntoTweets(text: string, maxLength = 280): string[] {
  if (text.length <= maxLength) return [text];

  // Reserve space for the suffix " (N/M)" — worst case 8 chars for ≥10-part threads
  const SUFFIX_RESERVE = 8;
  const chunkMax = maxLength - SUFFIX_RESERVE;

  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= chunkMax) {
      chunks.push(remaining);
      break;
    }
    // Find last space within chunkMax characters
    let splitAt = remaining.lastIndexOf(' ', chunkMax);
    if (splitAt <= 0) splitAt = chunkMax; // No space found, hard-cut
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (chunks.length === 1) return chunks;
  return chunks.map((c, i) => `${c} (${i + 1}/${chunks.length})`);
}

/**
 * Get a valid (decrypted, auto-refreshed) X access token for an account.
 * Handles the short 2-hour expiry by rotating via the stored refresh token.
 *
 * When a refresh occurs the new tokens are persisted to the database.
 */
export async function getXAccessToken(account: XAccount, userId: string): Promise<string> {
  let accessToken = account.accessToken;

  if (account.isEncrypted && isEncryptionConfigured()) {
    accessToken = decrypt(accessToken);
  }

  // If token is expired (or within 5 minutes of expiry), refresh it
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  const isExpired =
    account.tokenExpiresAt && new Date(account.tokenExpiresAt) <= fiveMinutesFromNow;

  if (isExpired) {
    if (!account.refreshToken) {
      throw new Error(
        'X access token is expired and no refresh token is stored. Please reconnect your X account.'
      );
    }

    let rawRefreshToken = account.refreshToken;
    if (account.isEncrypted && isEncryptionConfigured()) {
      rawRefreshToken = decrypt(rawRefreshToken);
    }

    logger.info('Refreshing X access token before posting', { accountId: account.id, userId });
    const tokenResponse = await refreshXToken(rawRefreshToken);

    let newAccessToken = tokenResponse.access_token;
    let newRefreshToken = tokenResponse.refresh_token ?? null;
    const isEncrypted = isEncryptionConfigured();

    if (isEncrypted) {
      newAccessToken = encrypt(tokenResponse.access_token);
      if (newRefreshToken) newRefreshToken = encrypt(newRefreshToken);
    }

    await prisma.socialMediaAccount.update({
      where: { id: account.id },
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        isEncrypted,
        tokenExpiresAt: calcXExpiry(tokenResponse.expires_in),
        updatedAt: new Date(),
      },
    });

    logger.info('X access token refreshed successfully', { accountId: account.id, userId });
    return tokenResponse.access_token;
  }

  return accessToken;
}

/**
 * Upload a single image to X using the v1.1 media upload endpoint.
 * Returns the media_id_string for use in tweet creation.
 *
 * @param accessToken - Decrypted X access token
 * @param imageUrl    - Publicly accessible image URL
 * @param userId      - App user ID for logging
 */
export async function uploadMedia(
  accessToken: string,
  imageUrl: string,
  userId: string
): Promise<string> {
  logger.info(`Uploading media to X from: ${imageUrl}`, { userId });

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(
      `Failed to fetch image for X upload (status ${imageResponse.status}): ${imageUrl}`
    );
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  const totalBytes = imageBuffer.length;

  // Use chunked INIT → APPEND → FINALIZE for reliability with all image sizes

  // INIT
  const initParams = new URLSearchParams({
    command: 'INIT',
    total_bytes: String(totalBytes),
    media_type: contentType,
    media_category: 'tweet_image',
  });

  const initRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: initParams,
  });

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(`X media upload INIT failed: ${JSON.stringify(err)}`);
  }

  const initData = await initRes.json();
  const mediaId = initData.media_id_string as string;

  // APPEND (send full buffer as segment 0)
  const formData = new FormData();
  formData.append('command', 'APPEND');
  formData.append('media_id', mediaId);
  formData.append('segment_index', '0');
  formData.append('media', new Blob([imageBuffer], { type: contentType }), 'upload');

  const appendRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!appendRes.ok && appendRes.status !== 204) {
    const err = await appendRes.text().catch(() => '');
    throw new Error(`X media upload APPEND failed (${appendRes.status}): ${err}`);
  }

  // FINALIZE
  const finalizeParams = new URLSearchParams({ command: 'FINALIZE', media_id: mediaId });
  const finalizeRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: finalizeParams,
  });

  if (!finalizeRes.ok) {
    const err = await finalizeRes.json().catch(() => ({}));
    throw new Error(`X media upload FINALIZE failed: ${JSON.stringify(err)}`);
  }

  logger.info(`X media uploaded successfully: ${mediaId}`, { userId });
  return mediaId;
}

/**
 * Publish a tweet (or thread) to X. Handles:
 * - Text-only tweets
 * - Tweets with a single image (uploaded via X Media API)
 * - Automatic thread splitting when caption exceeds 280 chars
 *
 * @param account          - SocialMediaAccount record (X)
 * @param caption          - Tweet text; auto-split into a thread if > 280 chars
 * @param resolvedImageUrl - Already-resolved public image URL, or null for text-only
 * @param userId           - App user ID for logging
 */
export async function publishTweet(
  account: XAccount,
  caption: string,
  resolvedImageUrl: string | null,
  userId: string
): Promise<XPostResult> {
  const accessToken = await getXAccessToken(account, userId);

  // Upload media if we have an image (attached to the first tweet only)
  let mediaId: string | null = null;
  if (resolvedImageUrl) {
    try {
      mediaId = await uploadMedia(accessToken, resolvedImageUrl, userId);
    } catch (err: any) {
      logger.warn(`X media upload failed, posting without image: ${err.message}`, { userId });
    }
  }

  // Split caption into tweets if needed
  const tweets = splitIntoTweets(caption);
  logger.info(`Posting ${tweets.length} tweet(s) to X`, { userId, count: tweets.length });

  let previousTweetId: string | null = null;
  const tweetIds: string[] = [];

  for (let i = 0; i < tweets.length; i++) {
    const tweetBody: any = { text: tweets[i] };

    // Attach media to the first tweet only
    if (i === 0 && mediaId) {
      tweetBody.media = { media_ids: [mediaId] };
    }

    // Chain subsequent tweets as replies
    if (previousTweetId) {
      tweetBody.reply = { in_reply_to_tweet_id: previousTweetId };
    }

    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetBody),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`X tweet ${i + 1}/${tweets.length} failed: ${JSON.stringify(err)}`);
    }

    const data = await response.json();
    const tweetId = data.data?.id as string;
    previousTweetId = tweetId;
    tweetIds.push(tweetId);

    logger.info(`X tweet ${i + 1}/${tweets.length} posted: ${tweetId}`, { userId });
  }

  return { success: true, tweetId: tweetIds[0], tweetIds };
}
