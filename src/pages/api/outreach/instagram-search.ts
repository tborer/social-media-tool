import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { getAccessToken } from '@/lib/instagram-token-manager';
import { logger } from '@/lib/server-logger';
import OpenAI from 'openai';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v22.0';

function calcEngagementRate(posts: any[], followers: number): number | null {
  if (!posts.length || !followers) return null;
  const avg = posts.reduce((sum: number, p: any) => sum + (p.like_count || 0) + (p.comments_count || 0), 0) / posts.length;
  return parseFloat(((avg / followers) * 100).toFixed(2));
}

function basicScore(
  bio: string,
  followers: number,
  engagementRate: number | null,
  niche?: string,
  followerMin?: number,
  followerMax?: number
): number {
  let score = 5;
  if (followerMin && followers < followerMin) score -= 2;
  if (followerMax && followers > followerMax) score -= 2;
  if (niche && bio.toLowerCase().includes(niche.toLowerCase())) score += 2;
  if (bio.length > 30) score += 1;
  if (engagementRate !== null && engagementRate > 2) score += 1;
  if (engagementRate !== null && engagementRate > 5) score += 1;
  return Math.min(10, Math.max(1, score));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { usernames, niche, followerMin, followerMax } = req.query;

  if (!usernames || typeof usernames !== 'string' || !usernames.trim()) {
    return res.status(400).json({ error: 'usernames query param is required' });
  }

  const igAccount = await prisma.socialMediaAccount.findFirst({
    where: { userId: user.id, accountType: 'INSTAGRAM' },
  });

  if (!igAccount) {
    return res.status(400).json({
      error: 'No Instagram account connected. Please connect an Instagram Business or Creator account first.',
      noIgAccount: true,
    });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(igAccount.id, user.id);
  } catch {
    return res.status(400).json({ error: 'Failed to get Instagram access token. Please reconnect your account.' });
  }

  const userSettings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const openaiKey = userSettings?.openaiApiKey || process.env.OPENAI_API_KEY;
  const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

  const minFollowers = followerMin ? parseInt(followerMin as string, 10) : undefined;
  const maxFollowers = followerMax ? parseInt(followerMax as string, 10) : undefined;
  const nicheStr = typeof niche === 'string' ? niche.trim() : undefined;

  const usernamesToSearch = (usernames as string)
    .split(/[\n,]+/)
    .map(u => u.replace(/^@/, '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10); // max 10 per request

  const settled = await Promise.allSettled(
    usernamesToSearch.map(username =>
      lookupAndScore(accessToken, username, nicheStr, minFollowers, maxFollowers, openai)
    )
  );

  const results = settled
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)
    .sort((a, b) => b.score - a.score);

  return res.status(200).json({ results });
}

async function lookupAndScore(
  accessToken: string,
  username: string,
  niche?: string,
  followerMin?: number,
  followerMax?: number,
  openai?: OpenAI | null
): Promise<any | null> {
  try {
    const fields = [
      'username',
      'name',
      'biography',
      'followers_count',
      'follows_count',
      'media_count',
      'profile_picture_url',
      'media.limit(6){id,caption,media_type,like_count,comments_count,timestamp,permalink}',
    ].join(',');

    const response = await fetch(
      `${INSTAGRAM_GRAPH_API}/me?fields=business_discovery.fields(${fields}).username(${encodeURIComponent(username)})&access_token=${accessToken}`
    );

    if (!response.ok) {
      if (response.status === 400) return null; // account not found or not business/creator
      logger.error('IG Business Discovery lookup failed', { username, status: response.status });
      return null;
    }

    const data = await response.json();
    const d = data?.business_discovery;
    if (!d) return null;

    const posts = d.media?.data || [];
    const followers = d.followers_count || 0;
    const bio = d.biography || '';
    const engagementRate = calcEngagementRate(posts, followers);

    // Apply follower filters — return null to exclude from results
    if (followerMin !== undefined && followers < followerMin) return null;
    if (followerMax !== undefined && followers > followerMax) return null;

    let aiScore: number | null = null;
    let aiSummary: string | null = null;
    let aiSuggestedAngle: string | null = null;

    if (openai) {
      try {
        const recentCaptions = posts
          .map((p: any) => p.caption || '')
          .filter(Boolean)
          .slice(0, 4)
          .join(' | ');

        const followerRangeStr =
          followerMin || followerMax
            ? `${followerMin?.toLocaleString() || '0'} – ${followerMax?.toLocaleString() || 'any'}`
            : null;

        const prompt = `You are a social media outreach analyst. Evaluate this Instagram account's potential as a cold outreach target for marketing purposes.

Account:
- Username: @${d.username || username}
- Bio: ${bio || '(no bio)'}
- Followers: ${followers.toLocaleString()}
- Engagement rate: ${engagementRate !== null ? `${engagementRate}%` : 'unknown'}
- Recent post content: ${recentCaptions || '(no recent posts)'}
${niche ? `\nTarget niche: ${niche}` : ''}${followerRangeStr ? `\nTarget follower range: ${followerRangeStr}` : ''}

Respond ONLY with valid JSON (no markdown, no explanation):
{"score": <integer 1-10>, "summary": "<one sentence suitability summary>", "suggestedAngle": "<one sentence outreach angle>"}`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.3,
        });

        const raw = completion.choices[0]?.message?.content?.trim() || '';
        const parsed = JSON.parse(raw);
        if (typeof parsed.score === 'number') {
          aiScore = Math.min(10, Math.max(1, Math.round(parsed.score)));
        }
        aiSummary = typeof parsed.summary === 'string' ? parsed.summary : null;
        aiSuggestedAngle = typeof parsed.suggestedAngle === 'string' ? parsed.suggestedAngle : null;
      } catch {
        // AI scoring failed — fall through to basic score
      }
    }

    const score = aiScore ?? basicScore(bio, followers, engagementRate, niche, followerMin, followerMax);

    return {
      username: d.username || username,
      name: d.name || '',
      bio,
      followers,
      following: d.follows_count || 0,
      mediaCount: d.media_count || 0,
      profilePicture: d.profile_picture_url || '',
      engagementRate,
      score,
      aiSummary,
      aiSuggestedAngle,
      recentPosts: posts.slice(0, 3).map((p: any) => ({
        id: p.id,
        caption: p.caption || '',
        likes: p.like_count || 0,
        comments: p.comments_count || 0,
        permalink: p.permalink,
        mediaType: p.media_type,
      })),
    };
  } catch (error) {
    logger.error('Error in IG prospect lookup', { username, error });
    return null;
  }
}
