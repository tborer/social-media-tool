import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Protect this endpoint with a server-only secret header name
const ADMIN_API_KEY_HEADER = 'x-admin-secret';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.setHeader('Allow', 'POST').status(405).json({ error: 'Method not allowed' });
  }

  const providedSecret = (req.headers[ADMIN_API_KEY_HEADER] as string) || '';
  if (!process.env.ADMIN_API_SECRET || providedSecret !== process.env.ADMIN_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId, newPassword } = req.body ?? {};

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid userId' });
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'Missing or invalid newPassword (min length 6)' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) {
      console.error('Supabase admin updateUserById error:', error);
      return res.status(500).json({ error: error.message || 'Failed to update user password' });
    }

    return res.status(200).json({ success: true, user: data });
  } catch (err: any) {
    console.error('Unexpected error in admin/reset-password:', err);
    return res.status(500).json({ error: err?.message ?? 'Unknown error' });
  }
}