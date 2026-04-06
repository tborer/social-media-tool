import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { lintCaption } from '@/lib/performance-analyzer';

/**
 * POST /api/insights/lint-caption
 * Body: { caption: string; platform: 'INSTAGRAM' | 'LINKEDIN' | 'X' }
 *
 * Returns a CaptionLintResult with score (0-100), grade (red/yellow/green),
 * and specific improvement suggestions.
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

  const { caption, platform } = req.body;

  if (!caption || typeof caption !== 'string') {
    return res.status(400).json({ error: 'caption is required' });
  }

  const validPlatforms = ['INSTAGRAM', 'LINKEDIN', 'X'];
  const resolvedPlatform = validPlatforms.includes(platform) ? platform : 'INSTAGRAM';

  const result = lintCaption(caption, resolvedPlatform);
  return res.status(200).json(result);
}
