import prisma from './prisma';
import { decrypt, encrypt, isEncryptionConfigured } from './encryption';
import {
  refreshAccessToken,
  shouldRefreshToken,
  calculateExpirationDate,
} from './instagram-oauth';
import { logger } from './logger';

export interface TokenInfo {
  token: string;
  expiresAt: Date | null;
  isExpired: boolean;
  needsRefresh: boolean;
}

/**
 * Get and decrypt access token for a social media account
 * Automatically refreshes the token if it's close to expiration
 *
 * @param accountId - Social media account ID
 * @param userId - User ID (for verification)
 * @returns Decrypted access token
 */
export async function getAccessToken(accountId: string, userId: string): Promise<string> {
  try {
    // Fetch the account
    const account = await prisma.socialMediaAccount.findFirst({
      where: {
        id: accountId,
        userId: userId,
      },
    });

    if (!account) {
      throw new Error('Social media account not found');
    }

    // Get the token (decrypt if needed)
    let accessToken = account.accessToken;

    if (account.isEncrypted) {
      if (!isEncryptionConfigured()) {
        throw new Error('Token is encrypted but encryption is not configured');
      }
      accessToken = decrypt(accessToken);
    }

    // Check if token needs refresh
    if (
      account.accountType === 'INSTAGRAM' &&
      account.tokenExpiresAt &&
      shouldRefreshToken(account.tokenExpiresAt)
    ) {
      logger.info('Instagram token needs refresh', { accountId, userId });

      try {
        // Refresh the token
        const refreshedToken = await refreshAccessToken(accessToken);

        // Encrypt the new token
        let newAccessToken = refreshedToken.access_token;
        if (isEncryptionConfigured()) {
          newAccessToken = encrypt(refreshedToken.access_token);
        }

        // Update the database
        await prisma.socialMediaAccount.update({
          where: { id: accountId },
          data: {
            accessToken: newAccessToken,
            isEncrypted: isEncryptionConfigured(),
            tokenExpiresAt: calculateExpirationDate(refreshedToken.expires_in),
            updatedAt: new Date(),
          },
        });

        logger.info('Instagram token refreshed successfully', { accountId, userId });

        // Return the refreshed, decrypted token
        return refreshedToken.access_token;
      } catch (refreshError) {
        logger.error('Failed to refresh Instagram token:', refreshError, { accountId, userId });
        // Continue with the existing token - it might still work
      }
    }

    return accessToken;
  } catch (error) {
    logger.error('Error getting access token:', error, { accountId, userId });
    throw error;
  }
}

/**
 * Get token information without decrypting the full token
 * Useful for checking token status
 *
 * @param accountId - Social media account ID
 * @param userId - User ID (for verification)
 * @returns Token information
 */
export async function getTokenInfo(accountId: string, userId: string): Promise<TokenInfo> {
  const account = await prisma.socialMediaAccount.findFirst({
    where: {
      id: accountId,
      userId: userId,
    },
  });

  if (!account) {
    throw new Error('Social media account not found');
  }

  const now = new Date();
  const expiresAt = account.tokenExpiresAt;
  const isExpired = expiresAt ? expiresAt <= now : false;
  const needsRefresh = expiresAt ? shouldRefreshToken(expiresAt) : false;

  return {
    token: account.isEncrypted ? '[ENCRYPTED]' : '[PLAINTEXT]',
    expiresAt,
    isExpired,
    needsRefresh,
  };
}

/**
 * Manually refresh a token
 * Useful for admin operations or when automatic refresh fails
 *
 * @param accountId - Social media account ID
 * @param userId - User ID (for verification)
 * @returns true if refresh succeeded
 */
export async function manuallyRefreshToken(
  accountId: string,
  userId: string
): Promise<boolean> {
  try {
    const account = await prisma.socialMediaAccount.findFirst({
      where: {
        id: accountId,
        userId: userId,
      },
    });

    if (!account) {
      throw new Error('Social media account not found');
    }

    if (account.accountType !== 'INSTAGRAM') {
      throw new Error('Token refresh only supported for Instagram accounts');
    }

    // Decrypt current token
    let currentToken = account.accessToken;
    if (account.isEncrypted) {
      if (!isEncryptionConfigured()) {
        throw new Error('Token is encrypted but encryption is not configured');
      }
      currentToken = decrypt(currentToken);
    }

    // Refresh the token
    const refreshedToken = await refreshAccessToken(currentToken);

    // Encrypt the new token
    let newAccessToken = refreshedToken.access_token;
    if (isEncryptionConfigured()) {
      newAccessToken = encrypt(refreshedToken.access_token);
    }

    // Update the database
    await prisma.socialMediaAccount.update({
      where: { id: accountId },
      data: {
        accessToken: newAccessToken,
        isEncrypted: isEncryptionConfigured(),
        tokenExpiresAt: calculateExpirationDate(refreshedToken.expires_in),
        updatedAt: new Date(),
      },
    });

    logger.info('Token manually refreshed', { accountId, userId });
    return true;
  } catch (error) {
    logger.error('Manual token refresh failed:', error, { accountId, userId });
    return false;
  }
}

/**
 * Check if a token is expired
 *
 * @param accountId - Social media account ID
 * @param userId - User ID (for verification)
 * @returns true if token is expired
 */
export async function isTokenExpired(accountId: string, userId: string): Promise<boolean> {
  const tokenInfo = await getTokenInfo(accountId, userId);
  return tokenInfo.isExpired;
}
