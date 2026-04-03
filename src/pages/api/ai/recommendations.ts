import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { getPerformanceSummary, PerformanceSummary } from '@/lib/performance-analyzer';

type RecommendationType = 'general' | 'caption_review' | 'hashtag_suggestions';

interface RecommendationRequest {
  type: RecommendationType;
  caption?: string;
  imageUrl?: string;
}

function formatPerformanceContext(summary: PerformanceSummary): string {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let context = `=== User Performance Summary ===
Total published posts analyzed: ${summary.totalPosts}
${summary.followerCount !== null ? `Current follower count: ${summary.followerCount}` : ''}

Average metrics per post:
- Engagement rate: ${summary.avgEngagement}%
- Likes: ${summary.avgLikes}
- Comments: ${summary.avgComments}
- Shares: ${summary.avgShares}
- Saves: ${summary.avgSaves}
- Reach: ${summary.avgReach}
`;

  if (summary.topPosts.length > 0) {
    context += `\nTop performing posts:\n`;
    summary.topPosts.forEach((p, i) => {
      context += `${i + 1}. "${p.captionSnippet}" — engagement: ${p.engagement}%, likes: ${p.likes}, reach: ${p.reach}\n`;
    });
  }

  if (summary.worstPosts.length > 0) {
    context += `\nLowest performing posts:\n`;
    summary.worstPosts.forEach((p, i) => {
      context += `${i + 1}. "${p.captionSnippet}" — engagement: ${p.engagement}%, likes: ${p.likes}, reach: ${p.reach}\n`;
    });
  }

  if (summary.bestPostingTimes.length > 0) {
    context += `\nBest posting times (from top posts):\n`;
    summary.bestPostingTimes.forEach((t) => {
      context += `- ${dayNames[t.dayOfWeek]} at ${t.hour}:00 UTC (${t.postCount} top posts)\n`;
    });
  }

  if (summary.hashtagAnalysis.recommendedHashtags.length > 0) {
    context += `\nHashtags found in top posts: ${summary.hashtagAnalysis.topPostHashtags.join(', ')}\n`;
    context += `Hashtags found only in low-performing posts: ${summary.hashtagAnalysis.avoidHashtags.join(', ') || 'none'}\n`;
  }

  return context;
}

function buildSystemPrompt(type: RecommendationType, performanceContext: string): string {
  const base = `You are an expert social media strategist and content coach. You have access to the user's actual performance data below. Use this data to give specific, actionable advice.\n\n${performanceContext}\n\n`;

  switch (type) {
    case 'general':
      return (
        base +
        `Analyze the user's performance data and provide:
1. Key observations about what content is working and what isn't
2. Specific content strategy recommendations (themes, formats, posting frequency)
3. Optimal posting schedule based on their data
4. Engagement improvement tactics
5. Growth opportunities

Be specific — reference their actual metrics and top/bottom posts. Format your response as actionable recommendations.

Respond with JSON in this exact format:
{
  "recommendations": "Your detailed analysis and recommendations as a single text block",
  "actionItems": ["Action item 1", "Action item 2", ...]
}`
      );

    case 'caption_review':
      return (
        base +
        `You are reviewing a draft caption for the user. Based on their performance data, suggest improvements:
1. Evaluate the hook (first line) — is it attention-grabbing?
2. Check for a clear call-to-action
3. Suggest hashtag improvements based on what works for them
4. Recommend tone/style adjustments based on their top-performing posts
5. Provide a rewritten version

Respond with JSON in this exact format:
{
  "recommendations": "Your analysis of the caption with specific feedback",
  "actionItems": ["Improvement 1", "Improvement 2", ...],
  "suggestedCaption": "Your improved version of the full caption",
  "suggestedHashtags": ["#hashtag1", "#hashtag2", ...]
}`
      );

    case 'hashtag_suggestions':
      return (
        base +
        `Based on the user's top-performing content and hashtag patterns, suggest optimal hashtag sets.
Provide:
1. A primary hashtag set (15-20 hashtags) for their best content type
2. Niche-specific hashtags they should try
3. Hashtags to avoid based on poor performance
4. A mix strategy (broad vs niche hashtags)

Respond with JSON in this exact format:
{
  "recommendations": "Your hashtag strategy analysis",
  "actionItems": ["Strategy point 1", "Strategy point 2", ...],
  "suggestedHashtags": ["#hashtag1", "#hashtag2", ...]
}`
      );
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, caption, imageUrl } = req.body as RecommendationRequest;

  if (!type || !['general', 'caption_review', 'hashtag_suggestions'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type. Must be general, caption_review, or hashtag_suggestions.' });
  }

  if (type === 'caption_review' && !caption) {
    return res.status(400).json({ error: 'caption is required for caption_review type.' });
  }

  try {
    // 1. Get performance context
    const summary = await getPerformanceSummary(user.id);
    const performanceContext = formatPerformanceContext(summary);

    // 2. Resolve API key — user's own key takes priority
    const userSettings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    const apiKey = userSettings?.openaiApiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: 'No OpenAI API key configured. Add one in Settings or contact support.' });
    }

    const openai = new OpenAI({ apiKey });

    // 3. Build prompts
    const systemPrompt = buildSystemPrompt(type, performanceContext);

    let userMessage = '';
    switch (type) {
      case 'general':
        userMessage = 'Analyze my social media performance and give me specific recommendations to improve.';
        break;
      case 'caption_review':
        userMessage = `Please review and improve this draft caption:\n\n"${caption}"${imageUrl ? `\n\nThe post image/content: ${imageUrl}` : ''}`;
        break;
      case 'hashtag_suggestions':
        userMessage = caption
          ? `Suggest optimal hashtags for this caption:\n\n"${caption}"`
          : 'Suggest optimal hashtag sets based on my content performance.';
        break;
    }

    // 4. Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });

    const rawContent = completion.choices[0]?.message?.content || '';

    // 5. Parse the JSON response from the model
    let parsed: Record<string, unknown>;
    try {
      // Try to extract JSON from the response (model may wrap in markdown code blocks)
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendations: rawContent, actionItems: [] };
    } catch {
      parsed = { recommendations: rawContent, actionItems: [] };
    }

    // 6. Return structured response
    const response: Record<string, unknown> = {
      type,
      recommendations: parsed.recommendations || rawContent,
      actionItems: parsed.actionItems || [],
    };

    if (type === 'caption_review') {
      response.suggestedCaption = parsed.suggestedCaption || null;
      response.suggestedHashtags = parsed.suggestedHashtags || [];
    }

    if (type === 'hashtag_suggestions') {
      response.suggestedHashtags = parsed.suggestedHashtags || [];
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Recommendations API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to generate recommendations', details: message });
  }
}
