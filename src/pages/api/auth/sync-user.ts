import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email || undefined,
      },
      create: {
        id: user.id,
        email: user.email || '',
      },
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('sync-user error:', error);
    return res.status(500).json({ error: 'Failed to sync user' });
  }
}
