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

  console.log('[Bluesky connect] Received connect request', {
    userId: user.id,
    handle: handle || '(missing)',
    hasAppPassword: !!appPassword,
  });

  if (!handle || !appPassword) {
    console.error('[Bluesky connect] Missing handle or appPassword');
    return res.status(400).json({ error: 'handle and appPassword are required' });
  }

  try {
    // Create a Bluesky session to validate the credentials
    console.log('[Bluesky connect] Creating ATP session for handle', { handle });
    const session = await createSession(handle, appPassword);
    console.log('[Bluesky connect] Session created', { did: session.did, handle: session.handle });

    // Encrypt the access JWT for storage
    let accessToken = session.accessJwt;
    let refreshToken: string | null = session.refreshJwt;
    let isEncrypted = false;

    if (isEncryptionConfigured()) {
      try {
        accessToken = encrypt(session.accessJwt);
        refreshToken = encrypt(session.refreshJwt);
        isEncrypted = true;
        console.log('[Bluesky connect] Tokens encrypted');
      } catch (e) {
        console.error('[Bluesky connect] Token encryption failed (storing plaintext)', { e });
        logger.error('Failed to encrypt Bluesky tokens:', e);
      }
    } else {
      console.warn('[Bluesky connect] ENCRYPTION_KEY not set — storing tokens in plaintext');
    }

    // Upsert the Bluesky account
    console.log('[Bluesky connect] Upserting Bluesky account in DB', {
      did: session.did,
      handle: session.handle,
    });
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
      console.log('[Bluesky connect] Updated existing Bluesky account', { accountId: existing.id });
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
      console.log('[Bluesky connect] Created new Bluesky account', { accountId: account.id });
      logger.info('Created new Bluesky account', { userId: user.id, did: session.did });
    }

    console.log('[Bluesky connect] Success — account connected', {
      did: session.did,
      handle: session.handle,
    });
    return res.status(200).json({
      success: true,
      account: {
        id: account.id,
        handle: session.handle,
        did: session.did,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Bluesky connect] Error connecting account', { handle, error: msg });
    logger.error('Error connecting Bluesky account:', error, { userId: user.id });
    return res.status(400).json({
      error: 'Failed to connect Bluesky account',
      details: msg,
    });
  }
}
