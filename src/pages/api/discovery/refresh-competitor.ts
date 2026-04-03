import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { getAccessToken } from '@/lib/instagram-token-manager';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v22.0';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { competitorId } = req.body;
  if (!competitorId || typeof competitorId !== 'string') {
    return res.status(400).json({ error: 'competitorId is required' });
  }

  const competitor = await prisma.trackedCompetitor.findFirst({
    where: { id: competitorId, userId: user.id },
  });
  if (!competitor) {
    return res.status(404).json({ error: 'Competitor not found' });
  }

  const account = await prisma.socialMediaAccount.findFirst({
    where: { userId: user.id, accountType: 'INSTAGRAM' },
  });
  if (!account) {
    return res.status(400).json({ error: 'No Instagram account connected' });
  }

  const accessToken = await getAccessToken(account.id, user.id);

  try {
    // Search for the competitor's IG user ID
    const searchRes = await fetch(
      `${INSTAGRAM_GRAPH_API}/ig_user_search?q=${encodeURIComponent(competitor.username)}&access_token=${accessToken}`
    );
    const searchData = await searchRes.json();

    if (!searchData.data?.length) {
      return res.status(404).json({ error: 'Instagram user not found' });
    }

    const igUserId = searchData.data[0].id;

    // Fetch profile details
    const profileRes = await fetch(
      `${INSTAGRAM_GRAPH_API}/${igUserId}?fields=username,biography,followers_count,media_count&access_token=${accessToken}`
    );
    const profile = await profileRes.json();

    const updated = await prisma.trackedCompetitor.update({
      where: { id: competitorId },
      data: {
        igUserId,
        followerCount: profile.followers_count ?? null,
        mediaCount: profile.media_count ?? null,
        bio: profile.biography ?? null,
        lastFetchedAt: new Date(),
      },
    });

    return res.status(200).json(updated);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch competitor data from Instagram' });
  }
}
