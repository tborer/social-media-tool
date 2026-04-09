import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { createSession } from '@/lib/bluesky-client';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { logger } from '@/lib/server-logger';
import prisma from '@/lib/prisma';

/**
 * POST /api/auth/bluesky/connect
 *
 * Connects a Bluesky account using handle + App Password.
 * Creates an ATP session, stores the tokens, handle, and DID.
 *
 * Body:
 *  - handle: string (e.g. "user.bsky.social")
 *  - appPassword: string (generated from Bluesky Settings → App Passwords)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { handle, appPassword } = req.body;
  if (!handle || !appPassword) {
    return res.status(400).json({ error: 'handle and appPassword are required' });
  }

  try {
    // Create a Bluesky session to validate the credentials
    const session = await createSession(handle, appPassword);

    // Encrypt the access JWT for storage
    let accessToken = session.accessJwt;
    let refreshToken: string | null = session.refreshJwt;
    let isEncrypted = false;

    if (isEncryptionConfigured()) {
      try {
        accessToken = encrypt(session.accessJwt);
        refreshToken = encrypt(session.refreshJwt);
        isEncrypted = true;
      } catch (e) {
        logger.error('Failed to encrypt Bluesky tokens:', e);
      }
    }

    // Upsert the Bluesky account
    const existing = await prisma.socialMediaAccount.findFirst({
      where: { userId: user.id, accountType: 'BLUESKY', blueskyDid: session.did },
    });

    let account;
    if (existing) {
      account = await prisma.socialMediaAccount.update({
        where: { id: existing.id },
        data: {
          accessToken,
          refreshToken,
          isEncrypted,
          blueskyHandle: session.handle,
          updatedAt: new Date(),
        },
      });
      logger.info('Updated existing Bluesky account', { userId: user.id, did: session.did });
    } else {
      account = await prisma.socialMediaAccount.create({
        data: {
          username: session.handle,
          accessToken,
          refreshToken,
          isEncrypted,
          accountType: 'BLUESKY',
          blueskyHandle: session.handle,
          blueskyDid: session.did,
          userId: user.id,
        },
      });
      logger.info('Created new Bluesky account', { userId: user.id, did: session.did });
    }

    return res.status(200).json({
      success: true,
      account: {
        id: account.id,
        handle: session.handle,
        did: session.did,
      },
    });
  } catch (error) {
    logger.error('Error connecting Bluesky account:', error, { userId: user.id });
    return res.status(400).json({
      error: 'Failed to connect Bluesky account',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
