import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { logger } from '@/lib/server-logger';
import OpenAI from 'openai';

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
      logger.error('Authentication failed in Instagram search', { error: authError });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { query, filters: filtersParam } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Parse and validate filters
    const filters: SearchFilter[] = typeof filtersParam === 'string'
      ? filtersParam.split(',').filter((f): f is SearchFilter => VALID_FILTERS.includes(f as SearchFilter))
      : ['for_you'];

    logger.info('Instagram search request', { userId: user.id, query, filters });

    const results = await generateSearchResults(query, filters);

    logger.info('Instagram search completed', {
      userId: user.id,
      query,
      filters,
      resultsCount: results.length
    });

    res.status(200).json({ results });
  } catch (error) {
    logger.error('Error in Instagram search', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function generateSearchResults(query: string, filters: SearchFilter[]) {
  const filterDescriptions = filters.map(f => {
    switch (f) {
      case 'for_you': return 'general/recommended content';
      case 'accounts': return 'Instagram accounts/profiles';
      case 'audio': return 'audio tracks, songs, and sound clips used in reels';
      case 'tags': return 'hashtags and tagged content';
      case 'places': return 'locations and geo-tagged content';
      default: return '';
    }
  }).filter(Boolean).join(', ');

  const prompt = `Generate realistic Instagram search results for the query "${query}".
The user is searching in these categories: ${filterDescriptions}.

Generate 5-6 results as a JSON array. Each result must be contextually relevant to the search query "${query}" and the selected categories.

${filters.includes('accounts') ? 'Include account-focused results with realistic usernames related to the query.' : ''}
${filters.includes('audio') ? 'Include audio/music results with track names and artist info relevant to the query.' : ''}
${filters.includes('tags') ? 'Include hashtag-focused results showing popular tags related to the query.' : ''}
${filters.includes('places') ? 'Include location-based results with real place names relevant to the query.' : ''}

Each result object must have these exact fields:
- id: unique string number ("1", "2", etc.)
- username: realistic Instagram username relevant to the query/category (no @ prefix)
- accountType: either "creator" or "business"
- verified: boolean
- imageUrl: leave as empty string
- caption: a realistic, engaging Instagram caption relevant to "${query}" (include emojis, 2-3 sentences)
- likes: realistic number (1000-50000)
- comments: realistic number (50-1000)
- hashtags: array of 5-8 relevant hashtags (with # prefix)
- timestamp: ISO date string within the last 7 days from now
${filters.includes('audio') ? '- audioName: name of the audio track\n- audioArtist: artist name' : ''}
${filters.includes('places') ? '- placeName: name of the location' : ''}

IMPORTANT: Make results genuinely relevant to "${query}". Do NOT use generic/stock content. The captions, usernames, and hashtags must all be specifically about "${query}".

Return ONLY valid JSON array, no other text.`;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a data generator that outputs only valid JSON arrays. No markdown, no code blocks, just raw JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      logger.warn('Empty AI response for Instagram search, using fallback');
      return generateFallbackResults(query, filters);
    }

    // Strip potential markdown code blocks
    const jsonStr = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      logger.warn('Invalid AI response format for Instagram search, using fallback');
      return generateFallbackResults(query, filters);
    }

    // Validate and sanitize each result
    return parsed.map((result: any, index: number) => ({
      id: String(result.id || index + 1),
      username: String(result.username || `${query}_user_${index + 1}`),
      accountType: result.accountType === 'business' ? 'business' : 'creator',
      verified: Boolean(result.verified),
      imageUrl: '', // No stock images
      caption: String(result.caption || ''),
      likes: typeof result.likes === 'number' ? result.likes : Math.floor(Math.random() * 20000) + 1000,
      comments: typeof result.comments === 'number' ? result.comments : Math.floor(Math.random() * 500) + 50,
      hashtags: Array.isArray(result.hashtags) ? result.hashtags.map(String) : [`#${query}`],
      timestamp: result.timestamp || new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      ...(result.audioName ? { audioName: String(result.audioName) } : {}),
      ...(result.audioArtist ? { audioArtist: String(result.audioArtist) } : {}),
      ...(result.placeName ? { placeName: String(result.placeName) } : {}),
    }));
  } catch (error) {
    logger.error('Error generating AI search results', { error, query, filters });
    return generateFallbackResults(query, filters);
  }
}

function generateFallbackResults(query: string, filters: SearchFilter[]) {
  // Minimal fallback if AI is unavailable - clearly labeled as suggestions
  const now = Date.now();
  const results = [
    {
      id: '1',
      username: `${query.replace(/\s+/g, '_').toLowerCase()}_daily`,
      accountType: 'creator' as const,
      verified: false,
      imageUrl: '',
      caption: `Exploring the world of ${query}! What are your thoughts on this? Share your experience below.`,
      likes: Math.floor(Math.random() * 15000) + 2000,
      comments: Math.floor(Math.random() * 400) + 50,
      hashtags: [`#${query.replace(/\s+/g, '')}`, `#${query.replace(/\s+/g, '')}community`, '#explore', '#trending', '#instagood'],
      timestamp: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '2',
      username: `best_${query.replace(/\s+/g, '_').toLowerCase()}`,
      accountType: 'business' as const,
      verified: true,
      imageUrl: '',
      caption: `The ultimate guide to ${query}. Save this for later! We've been working on this for months and can't wait to share.`,
      likes: Math.floor(Math.random() * 25000) + 5000,
      comments: Math.floor(Math.random() * 600) + 100,
      hashtags: [`#${query.replace(/\s+/g, '')}`, `#${query.replace(/\s+/g, '')}tips`, '#guide', '#howto', '#lifestyle'],
      timestamp: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '3',
      username: `${query.replace(/\s+/g, '_').toLowerCase()}_vibes`,
      accountType: 'creator' as const,
      verified: false,
      imageUrl: '',
      caption: `Can't get enough of ${query}! This has completely changed my perspective. Who else is into this?`,
      likes: Math.floor(Math.random() * 10000) + 1000,
      comments: Math.floor(Math.random() * 300) + 30,
      hashtags: [`#${query.replace(/\s+/g, '')}`, '#vibes', '#passion', '#authentic', '#community'],
      timestamp: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  return results.sort((a, b) => b.likes - a.likes);
}
