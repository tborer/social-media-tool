import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { logger } from '@/lib/logger';

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

    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    logger.info('Instagram search request', { userId: user.id, query });

    // Since we don't have access to actual Instagram API for searching public content,
    // we'll simulate search results with realistic mock data
    const mockResults = generateMockInstagramResults(query);

    logger.info('Instagram search completed', { 
      userId: user.id, 
      query, 
      resultsCount: mockResults.length 
    });

    res.status(200).json({ results: mockResults });
  } catch (error) {
    logger.error('Error in Instagram search', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}

function generateMockInstagramResults(query: string) {
  const baseResults = [
    {
      id: '1',
      username: 'travel_explorer',
      accountType: 'creator',
      verified: true,
      imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop',
      caption: `Amazing sunset views from the mountains! 🌅 There's nothing quite like watching the world wake up from this height. The journey was challenging but so worth it for moments like these. #${query} #mountains #sunrise #adventure #nature #hiking #photography #wanderlust`,
      likes: 15420,
      comments: 342,
      hashtags: [`#${query}`, '#mountains', '#sunrise', '#adventure', '#nature', '#hiking', '#photography', '#wanderlust'],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: '2',
      username: 'foodie_adventures',
      accountType: 'business',
      verified: false,
      imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=400&fit=crop',
      caption: `Homemade pasta night! 🍝 Nothing beats the satisfaction of making fresh pasta from scratch. This carbonara recipe has been passed down through generations in my family. Swipe for the recipe! #${query} #pasta #homemade #cooking #italian #recipe #foodblogger #delicious`,
      likes: 8934,
      comments: 156,
      hashtags: [`#${query}`, '#pasta', '#homemade', '#cooking', '#italian', '#recipe', '#foodblogger', '#delicious'],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: '3',
      username: 'fitness_motivation',
      accountType: 'creator',
      verified: true,
      imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop',
      caption: `Morning workout complete! 💪 Started the day with a 5K run followed by strength training. Remember, consistency is key - small steps every day lead to big changes. What's your favorite way to start the morning? #${query} #fitness #morning #workout #running #strength #motivation #healthy`,
      likes: 12567,
      comments: 289,
      hashtags: [`#${query}`, '#fitness', '#morning', '#workout', '#running', '#strength', '#motivation', '#healthy'],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: '4',
      username: 'photo_artist',
      accountType: 'creator',
      verified: false,
      imageUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400&h=400&fit=crop',
      caption: `Golden hour magic ✨ Captured this stunning portrait during the perfect lighting conditions. The key to great ${query} is patience and understanding natural light. Camera settings: ISO 100, f/2.8, 1/250s #${query} #portrait #goldenhour #naturallight #photographer #art #creative #beautiful`,
      likes: 9876,
      comments: 203,
      hashtags: [`#${query}`, '#portrait', '#goldenhour', '#naturallight', '#photographer', '#art', '#creative', '#beautiful'],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: '5',
      username: 'fashion_forward',
      accountType: 'business',
      verified: true,
      imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=400&fit=crop',
      caption: `Fall vibes are here! 🍂 Loving this cozy sweater paired with classic denim. Sometimes the simplest combinations make the biggest impact. This look is perfect for transitioning from day to night. #${query} #fall #cozy #sweater #denim #style #ootd #casual #chic`,
      likes: 18234,
      comments: 445,
      hashtags: [`#${query}`, '#fall', '#cozy', '#sweater', '#denim', '#style', '#ootd', '#casual', '#chic'],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: '6',
      username: 'tech_reviewer',
      accountType: 'creator',
      verified: false,
      imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&h=400&fit=crop',
      caption: `New setup reveal! 💻 After months of planning, my home office is finally complete. The key to productivity is having a space that inspires you. Swipe to see the before photos! #${query} #setup #homeoffice #productivity #tech #workspace #minimal #design #inspiration`,
      likes: 7654,
      comments: 178,
      hashtags: [`#${query}`, '#setup', '#homeoffice', '#productivity', '#tech', '#workspace', '#minimal', '#design', '#inspiration'],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  // Filter and customize results based on query
  return baseResults
    .map(result => ({
      ...result,
      caption: result.caption.replace(/Amazing|Homemade|Morning|Golden hour|Fall vibes|New setup/, 
        query.charAt(0).toUpperCase() + query.slice(1)),
      hashtags: [
        `#${query}`,
        ...result.hashtags.slice(1)
      ]
    }))
    .sort((a, b) => b.likes - a.likes) // Sort by engagement
    .slice(0, Math.floor(Math.random() * 3) + 4); // Return 4-6 results
}