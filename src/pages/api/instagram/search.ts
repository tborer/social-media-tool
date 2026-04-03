import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken } from '@/lib/instagram-token-manager';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v22.0';

const VALID_FILTERS = ['for_you', 'accounts', 'audio', 'tags', 'places'] as const;
type SearchFilter = typeof VALID_FILTERS[number];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { query, type, filters: filtersParam } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Parse filters from the multi-select UI
    const filters: SearchFilter[] = typeof filtersParam === 'string'
      ? filtersParam.split(',').filter((f): f is SearchFilter => VALID_FILTERS.includes(f as SearchFilter))
      : [];

    // Determine search type from filters or legacy type param
    const searchType = type as string || (filters.length > 0 ? null : 'hashtag');

    // Find user's first Instagram account for API access
    const igAccount = await prisma.socialMediaAccount.findFirst({
      where: { userId: user.id, accountType: 'INSTAGRAM' },
    });

    if (!igAccount) {
      return res.status(400).json({
        error: 'No Instagram account connected. Please connect an Instagram Business or Creator account first.',
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

    // When filters are provided, run searches for each applicable filter
    if (filters.length > 0) {
      const allResults: any[] = [];
      const allAccountResults: any[] = [];

      // Tags, For you, Audio, Places all use hashtag search as the closest API match
      const useHashtagSearch = filters.some(f => ['for_you', 'tags', 'audio', 'places'].includes(f));
      const useAccountSearch = filters.includes('accounts');

      if (useHashtagSearch) {
        const hashtagResults = await searchHashtag(accessToken, query, user.id);
        allResults.push(...hashtagResults);
      }

      if (useAccountSearch) {
        const accountResults = await searchAccounts(accessToken, query, user.id);
        allAccountResults.push(...accountResults);
      }

      // Return combined results with appropriate search type
      if (allAccountResults.length > 0 && allResults.length > 0) {
        return res.status(200).json({
          results: allResults,
          accountResults: allAccountResults,
          searchType: 'combined',
          filters,
        });
      } else if (allAccountResults.length > 0) {
        return res.status(200).json({ results: allAccountResults, searchType: 'account', filters });
      } else {
        return res.status(200).json({ results: allResults, searchType: 'hashtag', filters });
      }
    }

    // Legacy behavior: use type param directly
    if (searchType === 'account') {
      const results = await searchAccounts(accessToken, query, user.id);
      return res.status(200).json({ results, searchType: 'account' });
    } else {
      const results = await searchHashtag(accessToken, query, user.id);
      return res.status(200).json({ results, searchType: 'hashtag' });
    }
  } catch (error) {
    logger.error('Error in Instagram search', { error });
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
}

async function searchHashtag(accessToken: string, query: string, userId: string) {
  // Normalize: strip # prefix
  const hashtag = query.replace(/^#/, '').trim().toLowerCase();

  if (!hashtag) return [];

  try {
    // Step 1: Get the hashtag ID
    // Need the user's IG user ID first
    const meResponse = await fetch(`${INSTAGRAM_GRAPH_API}/me?fields=id&access_token=${accessToken}`);
    if (!meResponse.ok) {
      logger.error('Failed to fetch IG user ID for hashtag search', { userId });
      return [];
    }
    const meData = await meResponse.json();
    const igUserId = meData.id;

    const hashtagSearchResponse = await fetch(
      `${INSTAGRAM_GRAPH_API}/ig_hashtag_search?q=${encodeURIComponent(hashtag)}&user_id=${igUserId}&access_token=${accessToken}`
    );

    if (!hashtagSearchResponse.ok) {
      const errorData = await hashtagSearchResponse.json();
      logger.error('Hashtag search failed', { errorData, userId });
      // Return empty rather than error — API may rate limit (30 unique hashtags per 7 days)
      return [];
    }

    const hashtagData = await hashtagSearchResponse.json();
    const hashtagId = hashtagData?.data?.[0]?.id;

    if (!hashtagId) {
      return [];
    }

    // Step 2: Get top media for this hashtag
    const topMediaResponse = await fetch(
      `${INSTAGRAM_GRAPH_API}/${hashtagId}/top_media?user_id=${igUserId}&fields=id,caption,media_type,media_url,permalink,like_count,comments_count,timestamp&access_token=${accessToken}`
    );

    if (!topMediaResponse.ok) {
      logger.error('Hashtag top media fetch failed', { userId });
      return [];
    }

    const topMediaData = await topMediaResponse.json();
    const posts = topMediaData?.data || [];

    return posts.map((post: any) => ({
      id: post.id,
      username: '', // Not available from hashtag search
      accountType: 'unknown',
      verified: false,
      imageUrl: post.media_url || '',
      caption: post.caption || '',
      likes: post.like_count || 0,
      comments: post.comments_count || 0,
      hashtags: extractHashtags(post.caption || ''),
      timestamp: post.timestamp,
      permalink: post.permalink,
      mediaType: post.media_type,
    }));
  } catch (error) {
    logger.error('Error in hashtag search', { error, userId });
    return [];
  }
}

async function searchAccounts(accessToken: string, query: string, userId: string) {
  // Normalize: strip @ prefix
  const username = query.replace(/^@/, '').trim().toLowerCase();

  if (!username) return [];

  try {
    // Instagram Graph API doesn't have a direct user search endpoint for Business accounts.
    // We use the Business Discovery API to look up a specific username.
    const response = await fetch(
      `${INSTAGRAM_GRAPH_API}/me?fields=business_discovery.fields(username,name,biography,followers_count,follows_count,media_count,profile_picture_url,media.limit(6){id,caption,media_type,media_url,permalink,like_count,comments_count,timestamp}).username(${encodeURIComponent(username)})&access_token=${accessToken}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      // 400 usually means user not found or not a business/creator account
      if (response.status === 400) {
        logger.info('Account not found or not a business account', { username, userId });
        return [];
      }
      logger.error('Account lookup failed', { errorData, userId });
      return [];
    }

    const data = await response.json();
    const discovery = data?.business_discovery;

    if (!discovery) return [];

    const recentMedia = discovery.media?.data || [];

    return [{
      id: discovery.id || username,
      username: discovery.username || username,
      name: discovery.name || '',
      bio: discovery.biography || '',
      followers: discovery.followers_count || 0,
      following: discovery.follows_count || 0,
      mediaCount: discovery.media_count || 0,
      profilePicture: discovery.profile_picture_url || '',
      accountType: 'business',
      verified: false,
      recentPosts: recentMedia.map((post: any) => ({
        id: post.id,
        caption: post.caption || '',
        imageUrl: post.media_url || '',
        likes: post.like_count || 0,
        comments: post.comments_count || 0,
        hashtags: extractHashtags(post.caption || ''),
        timestamp: post.timestamp,
        permalink: post.permalink,
        mediaType: post.media_type,
      })),
    }];
  } catch (error) {
    logger.error('Error in account search', { error, userId });
    return [];
  }
}

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#\w+/g) || [];
  return matches.slice(0, 10); // Limit to 10 for display
}
