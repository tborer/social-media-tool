import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { refreshAccessToken, calculateExpirationDate } from '@/lib/x-oauth';
import { encrypt, decrypt, isEncryptionConfigured } from '@/lib/encryption';
import { logger } from '@/lib/server-logger';
import prisma from '@/lib/prisma';

/**
 * X Token Refresh Endpoint
 *
 * Refreshes the X access token for a given SocialMediaAccount using the
 * stored refresh token.  X refresh tokens rotate on every use — this
 * endpoint always persists the newly issued refresh token.
 *
 * POST body:
 * - accountId: ID of the SocialMediaAccount to refresh
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { accountId } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId is required' });
    }

    // Fetch the account and verify ownership
    const account = await prisma.socialMediaAccount.findFirst({
      where: { id: accountId, userId: user.id, accountType: 'X' },
    });

    if (!account) {
      return res.status(404).json({ error: 'X account not found' });
    }

    if (!account.refreshToken) {
      return res.status(400).json({
        error: 'No refresh token stored for this account. Please reconnect via OAuth.',
      });
    }

    // Decrypt the refresh token if it was stored encrypted
    let rawRefreshToken = account.refreshToken;
    if (account.isEncrypted && isEncryptionConfigured()) {
      try {
        rawRefreshToken = decrypt(account.refreshToken);
      } catch (decErr) {
        logger.error('Failed to decrypt X refresh token:', decErr, { accountId });
        return res.status(500).json({
          error: 'Failed to decrypt stored refresh token. Please reconnect your X account.',
        });
      }
    }

    logger.info('Refreshing X access token', { accountId, userId: user.id });

    // Call X token refresh endpoint
    const tokenResponse = await refreshAccessToken(rawRefreshToken);

    // Encrypt the new tokens
    let newAccessToken = tokenResponse.access_token;
    let newRefreshToken = tokenResponse.refresh_token ?? null;
    let isEncrypted = false;

    if (isEncryptionConfigured()) {
      try {
        newAccessToken = encrypt(tokenResponse.access_token);
        if (newRefreshToken) {
          newRefreshToken = encrypt(newRefreshToken);
        }
        isEncrypted = true;
      } catch (encErr) {
        logger.error('Failed to encrypt refreshed X tokens:', encErr, { accountId });
        // Store plaintext rather than failing the refresh
      }
    }

    const tokenExpiresAt = calculateExpirationDate(tokenResponse.expires_in);

    // Persist the rotated tokens
    await prisma.socialMediaAccount.update({
      where: { id: accountId },
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        isEncrypted,
        tokenExpiresAt,
        updatedAt: new Date(),
      },
    });

    logger.info('X access token refreshed successfully', { accountId, userId: user.id });

    return res.status(200).json({
      success: true,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
    });
  } catch (error) {
    logger.error('Error refreshing X token:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to refresh X token',
    });
  }
}
