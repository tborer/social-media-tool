import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[api/user/sync] Received sync request');

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('[api/user/sync] Auth failed:', authError?.message || 'No user in session');
    return res.status(401).json({ error: 'Unauthorized', detail: authError?.message });
  }

  console.log('[api/user/sync] Authenticated user:', user.id, user.email);

  try {
    const result = await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email || undefined,
      },
      create: {
        id: user.id,
        email: user.email || '',
      },
    });

    console.log('[api/user/sync] Upsert successful:', result.id);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[api/user/sync] Prisma upsert error:', error);
    return res.status(500).json({ error: 'Failed to sync user' });
  }
}
