import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { getAccessToken } from '@/lib/instagram-token-manager';
import { logger } from '@/lib/server-logger';
import OpenAI from 'openai';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v22.0';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcEngagementRate(posts: any[], followers: number): number | null {
  if (!posts.length || !followers) return null;
  const avg =
    posts.reduce((sum: number, p: any) => sum + (p.like_count || 0) + (p.comments_count || 0), 0) /
    posts.length;
  return parseFloat(((avg / followers) * 100).toFixed(2));
}

function heuristicScore(
  bio: string,
  followers: number,
  engagementRate: number | null,
  niche?: string,
  followerMin?: number,
  followerMax?: number
): number {
  let score = 5;
  if (followerMin !== undefined && followers < followerMin) score -= 2;
  if (followerMax !== undefined && followers > followerMax) score -= 2;
  if (niche && bio.toLowerCase().includes(niche.toLowerCase())) score += 2;
  if (bio.length > 30) score += 1;
  if (engagementRate !== null && engagementRate > 2) score += 1;
  if (engagementRate !== null && engagementRate > 5) score += 1;
  return Math.min(10, Math.max(1, score));
}

// ─── Profile lookup ───────────────────────────────────────────────────────────

async function lookupUsername(accessToken: string, username: string): Promise<any | null> {
  try {
    const fields = [
      'username',
      'name',
      'biography',
      'followers_count',
      'follows_count',
      'media_count',
      'profile_picture_url',
      'website',
      'media.limit(6){id,caption,media_type,like_count,comments_count,timestamp,permalink}',
    ].join(',');

    const response = await fetch(
      `${INSTAGRAM_GRAPH_API}/me?fields=business_discovery.fields(${fields}).username(${encodeURIComponent(username)})&access_token=${accessToken}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const d = data?.business_discovery;
    if (!d) return null;

    const posts = d.media?.data || [];
    const followers = d.followers_count || 0;

    return {
      username: d.username || username,
      name: d.name || '',
      bio: d.biography || '',
      followers,
      following: d.follows_count || 0,
      mediaCount: d.media_count || 0,
      profilePicture: d.profile_picture_url || '',
      website: d.website || null,
      engagementRate: calcEngagementRate(posts, followers),
      recentPosts: posts.slice(0, 3).map((p: any) => ({
        id: p.id,
        caption: p.caption || '',
        likes: p.like_count || 0,
        comments: p.comments_count || 0,
        permalink: p.permalink,
        mediaType: p.media_type,
      })),
    };
  } catch {
    return null;
  }
}

// ─── Hashtag / place discovery ────────────────────────────────────────────────

async function searchHashtagAccounts(
  accessToken: string,
  hashtag: string,
  igUserId: string
): Promise<{ profiles: any[]; discoveredPosts: any[] }> {
  try {
    // Step 1: resolve hashtag ID
    const hashtagSearchRes = await fetch(
      `${INSTAGRAM_GRAPH_API}/ig_hashtag_search?q=${encodeURIComponent(hashtag)}&user_id=${igUserId}&access_token=${accessToken}`
    );
    if (!hashtagSearchRes.ok) return { profiles: [], discoveredPosts: [] };
    const hashtagData = await hashtagSearchRes.json();
    const hashtagId = hashtagData?.data?.[0]?.id;
    if (!hashtagId) return { profiles: [], discoveredPosts: [] };

    // Step 2: fetch top media, requesting owner.username (returned for business accounts)
    const topMediaRes = await fetch(
      `${INSTAGRAM_GRAPH_API}/${hashtagId}/top_media?user_id=${igUserId}&fields=id,caption,media_type,like_count,comments_count,permalink,owner{id,username}&access_token=${accessToken}`
    );
    if (!topMediaRes.ok) return { profiles: [], discoveredPosts: [] };
    const topMediaData = await topMediaRes.json();
    const posts: any[] = topMediaData?.data || [];

    const resolvedUsernames: string[] = [];
    const discoveredPosts: any[] = [];
    const seenUsernames = new Set<string>();

    for (const post of posts) {
      const ownerUsername = post.owner?.username;
      if (ownerUsername && !seenUsernames.has(ownerUsername)) {
        seenUsernames.add(ownerUsername);
        resolvedUsernames.push(ownerUsername);
      } else {
        discoveredPosts.push({
          id: post.id,
          caption: post.caption || '',
          likes: post.like_count || 0,
          comments: post.comments_count || 0,
          permalink: post.permalink,
          mediaType: post.media_type,
        });
      }
    }

    // Step 3: full Business Discovery lookup for each resolved username
    const settled = await Promise.allSettled(
      resolvedUsernames.slice(0, 8).map(username => lookupUsername(accessToken, username))
    );
    const profiles = settled
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);

    return { profiles, discoveredPosts };
  } catch (error) {
    logger.error('Error in hashtag account search', { hashtag, error });
    return { profiles: [], discoveredPosts: [] };
  }
}

// ─── Profile image analysis ───────────────────────────────────────────────────

async function runImageAnalysis(openai: OpenAI, profiles: any[]): Promise<any[]> {
  const results = await Promise.allSettled(
    profiles.map(async profile => {
      if (!profile.profilePicture) return { ...profile, imageAnalysis: null };
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    'Analyze this Instagram profile picture. Return ONLY a JSON object with no markdown:\n' +
                    '{"isPersonPhoto":boolean,' +
                    '"estimatedAgeRange":"18-24"|"25-34"|"35-44"|"45-54"|"55+"|"under-18"|null,' +
                    '"genderPresentation":"female"|"male"|"non-binary"|"unclear"|null,' +
                    '"imageQuality":"professional"|"casual"|"low-quality"}\n' +
                    'Set estimatedAgeRange and genderPresentation to null if this is not a clear photo of a real person (logo, illustration, group photo, product, animal, etc).',
                },
                {
                  type: 'image_url',
                  image_url: { url: profile.profilePicture, detail: 'low' },
                },
              ],
            },
          ],
          max_tokens: 80,
          temperature: 0.1,
        });
        const raw = completion.choices[0]?.message?.content?.trim() || '';
        const cleaned = raw.replace(/```(?:json)?|```/g, '').trim();
        const imageAnalysis = JSON.parse(cleaned);
        return { ...profile, imageAnalysis };
      } catch {
        return { ...profile, imageAnalysis: null };
      }
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map(r => r.value);
}

// ─── AI scoring ───────────────────────────────────────────────────────────────

async function scoreProfiles(
  openai: OpenAI | null,
  profiles: any[],
  niche?: string,
  followerMin?: number,
  followerMax?: number
): Promise<any[]> {
  const results = await Promise.allSettled(
    profiles.map(async profile => {
      if (!openai) {
        return {
          ...profile,
          score: heuristicScore(
            profile.bio,
            profile.followers,
            profile.engagementRate,
            niche,
            followerMin,
            followerMax
          ),
          aiSummary: null,
          aiSuggestedAngle: null,
        };
      }

      try {
        const recentCaptions = (profile.recentPosts || [])
          .map((p: any) => p.caption || '')
          .filter(Boolean)
          .slice(0, 4)
          .join(' | ');

        const prompt =
          `You are a social media outreach analyst. Score this Instagram account for cold outreach marketing potential.\n\n` +
          `Account:\n` +
          `- Username: @${profile.username}\n` +
          `- Bio: ${profile.bio || '(no bio)'}\n` +
          `- Followers: ${profile.followers.toLocaleString()}\n` +
          `- Engagement: ${profile.engagementRate !== null ? `${profile.engagementRate}%` : 'unknown'}\n` +
          `- Posts: ${profile.mediaCount}\n` +
          (profile.website ? `- Website: ${profile.website}\n` : '') +
          `- Recent content: ${recentCaptions || '(none)'}` +
          (niche ? `\n\nTarget niche: ${niche}` : '') +
          `\n\nRespond ONLY with valid JSON (no markdown):\n{"score":<1-10>,"summary":"<one sentence>","suggestedAngle":"<one sentence>"}`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.3,
        });

        const raw = completion.choices[0]?.message?.content?.trim() || '';
        const cleaned = raw.replace(/```(?:json)?|```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
          ...profile,
          score:
            typeof parsed.score === 'number'
              ? Math.min(10, Math.max(1, Math.round(parsed.score)))
              : heuristicScore(
                  profile.bio,
                  profile.followers,
                  profile.engagementRate,
                  niche,
                  followerMin,
                  followerMax
                ),
          aiSummary: parsed.summary || null,
          aiSuggestedAngle: parsed.suggestedAngle || null,
        };
      } catch {
        return {
          ...profile,
          score: heuristicScore(
            profile.bio,
            profile.followers,
            profile.engagementRate,
            niche,
            followerMin,
            followerMax
          ),
          aiSummary: null,
          aiSuggestedAngle: null,
        };
      }
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map(r => r.value);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const {
    searchMode = 'username',
    query: queryParam,
    usernames: usernamesParam,
    niche,
    followerMin,
    followerMax,
    hasWebsite,
    minPosts,
    maxFollowing,
    analyzeImage,
    targetAgeRange,
    targetGender,
  } = req.query;

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
    return res.status(400).json({
      error: 'Failed to get Instagram access token. Please reconnect your account.',
    });
  }

  const userSettings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const openaiKey = userSettings?.openaiApiKey || process.env.OPENAI_API_KEY;
  const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

  const minFollowers = followerMin ? parseInt(followerMin as string, 10) : undefined;
  const maxFollowers = followerMax ? parseInt(followerMax as string, 10) : undefined;
  const minPostsNum = minPosts ? parseInt(minPosts as string, 10) : undefined;
  const maxFollowingNum = maxFollowing ? parseInt(maxFollowing as string, 10) : undefined;
  const nicheStr = typeof niche === 'string' ? niche.trim() : undefined;
  const mode = searchMode as string;

  let profiles: any[] = [];
  let discoveredPosts: any[] = [];

  try {
    if (mode === 'username') {
      const input = ((usernamesParam || queryParam) as string) || '';
      const usernamesToSearch = input
        .split(/[\n,]+/)
        .map(u => u.replace(/^@/, '').trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10);

      if (!usernamesToSearch.length) {
        return res.status(400).json({ error: 'At least one username is required' });
      }

      const settled = await Promise.allSettled(
        usernamesToSearch.map(username => lookupUsername(accessToken, username))
      );
      profiles = settled
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);
    } else {
      // hashtag or place mode
      const rawQuery = (queryParam as string) || '';
      if (!rawQuery.trim()) {
        return res.status(400).json({ error: 'A search query is required' });
      }

      const hashtag =
        mode === 'place'
          ? rawQuery.replace(/\s+/g, '').toLowerCase()
          : rawQuery.replace(/^#/, '').trim().toLowerCase();

      // Need our own IG user ID for the hashtag API
      const meRes = await fetch(`${INSTAGRAM_GRAPH_API}/me?fields=id&access_token=${accessToken}`);
      if (!meRes.ok) {
        return res.status(400).json({ error: 'Failed to get Instagram user info' });
      }
      const meData = await meRes.json();
      const igUserId = meData.id;

      const result = await searchHashtagAccounts(accessToken, hashtag, igUserId);
      profiles = result.profiles;
      discoveredPosts = result.discoveredPosts;
    }
  } catch (error) {
    logger.error('Instagram prospect search error', { error });
    return res.status(500).json({ error: 'Search failed. Please try again.' });
  }

  // Apply server-side profile filters
  profiles = profiles.filter(p => {
    if (minFollowers !== undefined && p.followers < minFollowers) return false;
    if (maxFollowers !== undefined && p.followers > maxFollowers) return false;
    if (hasWebsite === 'true' && !p.website) return false;
    if (minPostsNum !== undefined && p.mediaCount < minPostsNum) return false;
    if (maxFollowingNum !== undefined && p.following > maxFollowingNum) return false;
    return true;
  });

  // Optional profile image analysis via OpenAI Vision
  if (analyzeImage === 'true' && openai && profiles.length > 0) {
    profiles = await runImageAnalysis(openai, profiles);

    const ageRangeFilter =
      typeof targetAgeRange === 'string' && targetAgeRange !== 'any' ? targetAgeRange : null;
    const genderFilter =
      typeof targetGender === 'string' && targetGender !== 'any' ? targetGender : null;

    if (ageRangeFilter || genderFilter) {
      profiles = profiles.filter(p => {
        if (!p.imageAnalysis) return true; // keep if analysis failed (don't over-filter)
        if (ageRangeFilter && p.imageAnalysis.estimatedAgeRange) {
          if (p.imageAnalysis.estimatedAgeRange !== ageRangeFilter) return false;
        }
        if (genderFilter && p.imageAnalysis.genderPresentation) {
          if (p.imageAnalysis.genderPresentation !== genderFilter) return false;
        }
        return true;
      });
    }
  }

  // AI scoring + sort
  if (profiles.length > 0) {
    profiles = await scoreProfiles(openai, profiles, nicheStr, minFollowers, maxFollowers);
    profiles.sort((a, b) => b.score - a.score);
  }

  return res.status(200).json({ results: profiles, discoveredPosts });
}
