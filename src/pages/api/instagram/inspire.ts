import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { logger } from '@/lib/logger';
import { generateContent } from '@/lib/openai';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create Supabase client for authentication
  const supabase = createClient(req, res);
  
  // Get the user from the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { inspirationPost, contentType = 'IMAGE', customPrompt } = req.body;
  
  if (!inspirationPost) {
    return res.status(400).json({ error: 'Inspiration post data is required' });
  }
  
  try {
    // Create a prompt based on the inspiration post
    let prompt = '';
    
    if (customPrompt) {
      prompt = `Create ${contentType.toLowerCase()} content inspired by this Instagram post: "${inspirationPost.caption}" by @${inspirationPost.username}. 
      
      Additional context: ${customPrompt}
      
      Please create similar content that:
      1. Captures the same mood and style
      2. Uses similar hashtags and themes
      3. Is original and not a copy
      4. Matches the engagement style that made the original successful`;
    } else {
      prompt = `Create ${contentType.toLowerCase()} content inspired by this high-performing Instagram post: "${inspirationPost.caption}" by @${inspirationPost.username}.
      
      This post had ${inspirationPost.likes} likes and ${inspirationPost.comments} comments, showing strong engagement.
      
      Please create similar content that:
      1. Captures the same mood, style, and energy
      2. Uses similar hashtags: ${inspirationPost.hashtags.join(', ')}
      3. Appeals to the same audience
      4. Is completely original and not a copy
      5. Incorporates elements that likely contributed to the high engagement
      
      Focus on creating content that would perform well with a similar audience while being authentic and unique.`;
    }
    
    // Generate content using OpenAI
    const generatedContent = await generateContent(prompt, contentType);
    
    // Log the inspiration request
    await logger.log({
      type: 'INSTAGRAM_INSPIRE',
      endpoint: '/api/instagram/inspire',
      userId: user.id,
      requestData: {
        inspirationPostId: inspirationPost.id,
        inspirationUsername: inspirationPost.username,
        contentType,
        hasCustomPrompt: !!customPrompt
      },
      response: {
        captionLength: generatedContent.caption?.length || 0,
        imageCount: generatedContent.imageUrls?.length || 0
      },
      status: 200,
    });
    
    return res.status(200).json({
      success: true,
      generatedContent,
      inspirationPost: {
        id: inspirationPost.id,
        username: inspirationPost.username,
        caption: inspirationPost.caption.substring(0, 100) + '...',
        engagement: inspirationPost.engagement
      }
    });
    
  } catch (error) {
    console.error('Error generating inspired content:', error);
    
    // Log the error
    await logger.log({
      type: 'INSTAGRAM_INSPIRE',
      endpoint: '/api/instagram/inspire',
      userId: user.id,
      requestData: {
        inspirationPostId: inspirationPost?.id,
        contentType,
        hasCustomPrompt: !!customPrompt
      },
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    });
    
    return res.status(500).json({ 
      error: 'Failed to generate inspired content',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}