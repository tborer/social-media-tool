import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { logger } from '@/lib/logger';
import { openaiClient } from '@/lib/openai-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error('Authentication failed in Instagram inspire', { error: authError });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { inspirationPost, contentType, customPrompt } = req.body;

    if (!inspirationPost) {
      return res.status(400).json({ error: 'Inspiration post is required' });
    }

    logger.info('Instagram inspire request', { 
      userId: user.id, 
      inspirationPostId: inspirationPost.id,
      contentType,
      hasCustomPrompt: !!customPrompt
    });

    // Generate inspired content using AI
    const generatedContent = await generateInspiredContent(
      inspirationPost, 
      contentType || 'IMAGE', 
      customPrompt
    );

    logger.info('Instagram inspire completed', { 
      userId: user.id, 
      inspirationPostId: inspirationPost.id,
      generatedCaptionLength: generatedContent.caption.length
    });

    res.status(200).json({ generatedContent });
  } catch (error) {
    logger.error('Error in Instagram inspire', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function generateInspiredContent(inspirationPost: any, contentType: string, customPrompt?: string) {
  try {
    const basePrompt = `
You are a social media content creator. Create original content inspired by this high-performing Instagram post:

Original Post:
- Username: @${inspirationPost.username}
- Caption: ${inspirationPost.caption}
- Engagement: ${inspirationPost.likes.toLocaleString()} likes, ${inspirationPost.comments.toLocaleString()} comments
- Hashtags: ${inspirationPost.hashtags.join(' ')}

${customPrompt ? `Additional Instructions: ${customPrompt}` : ''}

Create NEW, ORIGINAL content that:
1. Takes inspiration from the style, tone, and structure of the original
2. Uses similar themes but with completely different content
3. Maintains the engaging elements that made the original successful
4. Is appropriate for ${contentType.toLowerCase()} content
5. Includes relevant hashtags (8-12 hashtags)
6. Has a compelling hook in the first line
7. Includes a call-to-action or engagement question

Return ONLY a JSON object with this structure:
{
  "caption": "Your generated caption here with hashtags",
  "imageUrls": ["https://images.unsplash.com/photo-example"],
  "contentType": "${contentType}"
}

Make sure the caption is engaging, original, and follows current social media best practices.
`;

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert social media content creator who specializes in creating viral, engaging Instagram content. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: basePrompt
        }
      ],
      temperature: 0.8,
      max_tokens: 1000
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response
    let generatedContent;
    try {
      generatedContent = JSON.parse(response);
    } catch (parseError) {
      // If JSON parsing fails, create a fallback response
      logger.warn('Failed to parse AI response as JSON, creating fallback', { response });
      generatedContent = createFallbackContent(inspirationPost, contentType);
    }

    // Ensure we have the required fields
    if (!generatedContent.caption) {
      generatedContent = createFallbackContent(inspirationPost, contentType);
    }

    // Add a relevant image URL if not provided
    if (!generatedContent.imageUrls || generatedContent.imageUrls.length === 0) {
      generatedContent.imageUrls = [getRelevantImageUrl(inspirationPost, contentType)];
    }

    return generatedContent;
  } catch (error) {
    logger.error('Error generating inspired content with AI', { error });
    // Return fallback content if AI fails
    return createFallbackContent(inspirationPost, contentType);
  }
}

function createFallbackContent(inspirationPost: any, contentType: string) {
  const themes = extractThemes(inspirationPost.caption);
  const mainTheme = themes[0] || 'inspiration';
  
  const fallbackCaptions = {
    travel: `✨ Every journey tells a story! Just like this amazing adventure, life's best moments happen when we step outside our comfort zone. What's the most memorable place you've ever visited? Share your travel stories below! 🌍 #travel #adventure #wanderlust #explore #journey #memories #inspiration #lifestyle`,
    
    food: `🍽️ There's something magical about creating delicious meals from scratch! Food brings people together and creates lasting memories. What's your favorite dish to cook when you want to impress? Drop your go-to recipes in the comments! #food #cooking #homemade #delicious #recipe #foodie #kitchen #yummy`,
    
    fitness: `💪 Progress over perfection, always! Every workout is a step closer to your goals. Remember, the hardest part is showing up - but once you do, you've already won half the battle. What motivates you to stay active? #fitness #motivation #workout #health #progress #strength #mindset #goals`,
    
    photography: `📸 Capturing moments that take your breath away! Photography is about seeing the extraordinary in the ordinary. Every shot tells a unique story. What's your favorite subject to photograph? Share your best shots below! #photography #art #creative #moments #capture #beautiful #inspiration #visual`,
    
    fashion: `👗 Style is a way to express who you are without saying a word! Fashion is about confidence and feeling amazing in your own skin. What's your signature style? Show us your favorite outfit in the comments! #fashion #style #ootd #confidence #expression #trendy #chic #outfit`,
    
    default: `✨ Inspired by amazing content creators who share their passion with the world! There's something beautiful about authentic storytelling and genuine connection. What inspires you to create and share? Let's build a community of inspiration together! #inspiration #authentic #community #create #share #passion #storytelling #connect`
  };

  const caption = fallbackCaptions[mainTheme] || fallbackCaptions.default;
  
  return {
    caption,
    imageUrls: [getRelevantImageUrl(inspirationPost, contentType)],
    contentType
  };
}

function extractThemes(caption: string): string[] {
  const themes = [];
  const lowerCaption = caption.toLowerCase();
  
  if (lowerCaption.includes('travel') || lowerCaption.includes('adventure') || lowerCaption.includes('mountain') || lowerCaption.includes('sunset')) {
    themes.push('travel');
  }
  if (lowerCaption.includes('food') || lowerCaption.includes('recipe') || lowerCaption.includes('cooking') || lowerCaption.includes('pasta')) {
    themes.push('food');
  }
  if (lowerCaption.includes('fitness') || lowerCaption.includes('workout') || lowerCaption.includes('running') || lowerCaption.includes('strength')) {
    themes.push('fitness');
  }
  if (lowerCaption.includes('photo') || lowerCaption.includes('portrait') || lowerCaption.includes('camera') || lowerCaption.includes('golden hour')) {
    themes.push('photography');
  }
  if (lowerCaption.includes('fashion') || lowerCaption.includes('style') || lowerCaption.includes('outfit') || lowerCaption.includes('ootd')) {
    themes.push('fashion');
  }
  
  return themes.length > 0 ? themes : ['default'];
}

function getRelevantImageUrl(inspirationPost: any, contentType: string): string {
  const themes = extractThemes(inspirationPost.caption);
  const mainTheme = themes[0] || 'default';
  
  const imageUrls = {
    travel: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&h=400&fit=crop',
    food: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=400&fit=crop',
    fitness: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop',
    photography: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400&h=400&fit=crop',
    fashion: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=400&fit=crop',
    default: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=400&fit=crop'
  };
  
  return imageUrls[mainTheme] || imageUrls.default;
}