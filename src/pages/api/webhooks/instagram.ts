import { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'crypto';
import { logger } from '@/lib/server-logger';

/**
 * Instagram Webhook Endpoint
 *
 * Handles two request types from Meta:
 *
 * 1. GET  - Verification handshake when you subscribe to webhook fields in the
 *           Meta app dashboard. Meta sends hub.mode, hub.verify_token, and
 *           hub.challenge. If the verify token matches our env var, we echo
 *           the challenge back as plain text.
 *
 * 2. POST - Event delivery. Meta sends JSON payloads for subscribed fields
 *           (e.g. comments, mentions, messages). We verify the X-Hub-Signature-256
 *           header using the app secret, then ack with 200.
 *
 * Environment Variables Required:
 * - INSTAGRAM_WEBHOOK_VERIFY_TOKEN: Any random secret you invented and pasted
 *   into the Meta app dashboard "Verify token" field.
 * - INSTAGRAM_APP_SECRET: Used to validate the X-Hub-Signature-256 header.
 *
 * Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */

// We need the raw body to compute the HMAC signature, so disable Next's
// automatic JSON body parsing.
export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function verifySignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const received = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  const receivedBuf = Buffer.from(received, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (receivedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

    if (!verifyToken) {
      logger.error('INSTAGRAM_WEBHOOK_VERIFY_TOKEN is not set');
      return res.status(500).send('Webhook verify token not configured');
    }

    if (mode === 'subscribe' && typeof token === 'string' && token === verifyToken && typeof challenge === 'string') {
      logger.info('Instagram webhook verified');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    }

    logger.warn('Instagram webhook verification failed', { mode, tokenMatch: token === verifyToken });
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (!appSecret) {
      logger.error('INSTAGRAM_APP_SECRET is not set');
      return res.status(500).send('App secret not configured');
    }

    let rawBody: Buffer;
    try {
      rawBody = await readRawBody(req);
    } catch (e) {
      logger.error('Failed to read webhook body:', e);
      return res.status(400).send('Invalid body');
    }

    const signature = req.headers['x-hub-signature-256'];
    const signatureHeader = Array.isArray(signature) ? signature[0] : signature;

    if (!verifySignature(rawBody, signatureHeader, appSecret)) {
      logger.warn('Instagram webhook signature mismatch');
      return res.status(401).send('Invalid signature');
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf-8'));
    } catch (e) {
      logger.error('Invalid JSON in Instagram webhook:', e);
      return res.status(400).send('Invalid JSON');
    }

    logger.info('Instagram webhook received', {
      object: payload?.object,
      entryCount: Array.isArray(payload?.entry) ? payload.entry.length : 0,
    });

    // TODO: route payload.entry[].changes[] to handlers for each subscribed field
    // (comments, mentions, messages, etc.) as you enable them in the Meta app.

    return res.status(200).send('OK');
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).send('Method not allowed');
}
