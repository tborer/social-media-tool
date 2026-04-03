import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  switch (req.method) {
    case 'GET': {
      const hashtags = await prisma.trackedHashtag.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      return res.status(200).json(hashtags);
    }

    case 'POST': {
      const { hashtag } = req.body;
      if (!hashtag || typeof hashtag !== 'string') {
        return res.status(400).json({ error: 'hashtag is required' });
      }

      const normalized = hashtag.replace(/^#/, '').toLowerCase().trim();
      if (!normalized) {
        return res.status(400).json({ error: 'Invalid hashtag' });
      }

      const existing = await prisma.trackedHashtag.findUnique({
        where: { userId_hashtag: { userId: user.id, hashtag: normalized } },
      });
      if (existing) {
        return res.status(409).json({ error: 'Hashtag already tracked' });
      }

      const created = await prisma.trackedHashtag.create({
        data: { userId: user.id, hashtag: normalized },
      });
      return res.status(201).json(created);
    }

    case 'DELETE': {
      const { id } = req.body;
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'id is required' });
      }

      await prisma.trackedHashtag.deleteMany({
        where: { id, userId: user.id },
      });
      return res.status(200).json({ success: true });
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
