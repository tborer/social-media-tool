import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { logger } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create Supabase client for authentication
  const supabase = createClient(req, res);
  
  // Get the user from the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { query, hashtag, username } = req.query;
  
  try {
    // For now, we'll return mock data since Instagram's Basic Display API
    // doesn't allow searching public content without special permissions
    // In a real implementation, you would need Instagram's Content Publishing API
    // or partner with a service that provides Instagram content discovery
    
    const mockResults = [
      {
        id: '1',
        username: 'travel_blogger',
        caption: 'Amazing sunset at Santorini! 🌅 The colors were absolutely breathtaking. Can\'t wait to share more from this incredible trip! #santorini #sunset #travel #greece #wanderlust',
        imageUrl: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=400&h=400&fit=crop',
        likes: 2847,
        comments: 156,
        engagement: 3003,
        timestamp: '2024-01-15T18:30:00Z',
        hashtags: ['#santorini', '#sunset', '#travel', '#greece', '#wanderlust'],
        accountType: 'personal',
        verified: false
      },
      {
        id: '2',
        username: 'foodie_adventures',
        caption: 'Homemade pasta night! 🍝 Nothing beats fresh ingredients and a cozy kitchen. Recipe in my stories! #pasta #homecooking #italian #foodie #delicious',
        imageUrl: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400&h=400&fit=crop',
        likes: 1923,
        comments: 89,
        engagement: 2012,
        timestamp: '2024-01-15T19:45:00Z',
        hashtags: ['#pasta', '#homecooking', '#italian', '#foodie', '#delicious'],
        accountType: 'personal',
        verified: false
      },
      {
        id: '3',
        username: 'fitness_motivation',
        caption: 'Morning workout complete! 💪 Remember, consistency is key. Every small step counts towards your goals. What\'s your favorite way to start the day? #fitness #motivation #workout #health #morningvibes',
        imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop',
        likes: 3456,
        comments: 234,
        engagement: 3690,
        timestamp: '2024-01-15T07:30:00Z',
        hashtags: ['#fitness', '#motivation', '#workout', '#health', '#morningvibes'],
        accountType: 'business',
        verified: true
      },
      {
        id: '4',
        username: 'nature_photography',
        caption: 'Forest therapy 🌲 Sometimes you need to disconnect from the digital world and reconnect with nature. This peaceful trail reminded me why I love photography. #nature #forest #photography #peaceful #mindfulness',
        imageUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=400&fit=crop',
        likes: 1567,
        comments: 78,
        engagement: 1645,
        timestamp: '2024-01-15T14:20:00Z',
        hashtags: ['#nature', '#forest', '#photography', '#peaceful', '#mindfulness'],
        accountType: 'creator',
        verified: false
      },
      {
        id: '5',
        username: 'tech_reviews',
        caption: 'Latest smartphone review is live! 📱 The camera quality on this device is incredible. Swipe to see some sample shots. Full review on my blog! #tech #smartphone #review #photography #gadgets',
        imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=400&fit=crop',
        likes: 2134,
        comments: 167,
        engagement: 2301,
        timestamp: '2024-01-15T16:15:00Z',
        hashtags: ['#tech', '#smartphone', '#review', '#photography', '#gadgets'],
        accountType: 'business',
        verified: true
      }
    ];
    
    // Filter results based on query parameters
    let filteredResults = mockResults;
    
    if (query) {
      const searchTerm = query.toString().toLowerCase();
      filteredResults = filteredResults.filter(post => 
        post.caption.toLowerCase().includes(searchTerm) ||
        post.hashtags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
        post.username.toLowerCase().includes(searchTerm)
      );
    }
    
    if (hashtag) {
      const hashtagTerm = hashtag.toString().toLowerCase();
      filteredResults = filteredResults.filter(post =>
        post.hashtags.some(tag => tag.toLowerCase().includes(hashtagTerm))
      );
    }
    
    if (username) {
      const usernameTerm = username.toString().toLowerCase();
      filteredResults = filteredResults.filter(post =>
        post.username.toLowerCase().includes(usernameTerm)
      );
    }
    
    // Log the search request
    await logger.log({
      type: 'INSTAGRAM_SEARCH',
      endpoint: '/api/instagram/search',
      userId: user.id,
      requestData: {
        query,
        hashtag,
        username,
        resultsCount: filteredResults.length
      },
      status: 200,
    });
    
    return res.status(200).json({
      success: true,
      results: filteredResults,
      total: filteredResults.length,
      note: 'This is demo data. In production, this would connect to Instagram\'s API or a content discovery service.'
    });
    
  } catch (error) {
    console.error('Error searching Instagram content:', error);
    
    // Log the error
    await logger.log({
      type: 'INSTAGRAM_SEARCH',
      endpoint: '/api/instagram/search',
      userId: user.id,
      requestData: { query, hashtag, username },
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    });
    
    return res.status(500).json({ 
      error: 'Failed to search Instagram content',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}