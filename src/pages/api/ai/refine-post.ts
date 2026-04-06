import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { getPerformanceSummary } from '@/lib/performance-analyzer';
import { logger } from '@/lib/server-logger';

type Tone = 'casual' | 'professional' | 'storytelling' | 'direct_cta';
type RefinementType = 'caption' | 'hashtags' | 'media_suggestion';

const PLATFORM_LIMITS: Record<string, number> = {
  INSTAGRAM: 2200,
  LINKEDIN: 3000,
  X: 280,
};

const TONE_DESCRIPTIONS: Record<Tone, string> = {
  casual: 'conversational, friendly, relatable — as if talking to a friend',
  professional: 'authoritative, polished, business-appropriate',
  storytelling: 'narrative-driven, emotionally engaging, personal',
  direct_cta: 'action-oriented, concise, with a strong call-to-action',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { postId, type = 'caption', tone = 'casual', platform = 'INSTAGRAM' } = req.body as {
    postId?: string;
    type?: RefinementType;
    tone?: Tone;
    platform?: string;
  };

  if (!postId) {
    return res.status(400).json({ error: 'postId is required' });
  }

  try {
    // Fetch the post
    const post = await prisma.contentPost.findFirst({
      where: { id: postId, userId: user.id },
      include: {
        postInsights: {
          orderBy: { fetchedAt: 'desc' },
          take: 1,
        },
        socialMediaAccount: { select: { accountType: true } },
      },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Fetch user performance summary for context
    const summary = await getPerformanceSummary(user.id);
    const resolvedPlatform = platform || post.socialMediaAccount?.accountType || 'INSTAGRAM';
    const charLimit = PLATFORM_LIMITS[resolvedPlatform] ?? 2200;

    // Get API key
    const userSettings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    const apiKey = userSettings?.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'No OpenAI API key configured. Add one in Settings.' });
    }

    const openai = new OpenAI({ apiKey });

    // Build performance context for this specific post
    const insight = post.postInsights[0] ?? null;
    const plStats = summary.platformStats.find((ps) => ps.platform === resolvedPlatform);
    const avgEngagement = plStats?.avgEngagement ?? summary.avgEngagement;

    let postContext = `Platform: ${resolvedPlatform}\nOriginal caption:\n"${post.caption}"\n`;
    if (insight) {
      postContext += `\nPost performance metrics:
- Engagement rate: ${insight.engagement.toFixed(2)}% (your ${resolvedPlatform} average: ${avgEngagement.toFixed(2)}%)
- Reach: ${insight.reach.toLocaleString()}
- Likes: ${insight.likes.toLocaleString()}
- Comments: ${insight.comments.toLocaleString()}
- Shares: ${insight.shares.toLocaleString()}
- Saves: ${(insight.saves || 0).toLocaleString()}
`;
      if (insight.impressions > 0 && insight.engagement < avgEngagement * 0.5) {
        postContext += `\nNote: This post had good impressions (${insight.impressions.toLocaleString()}) but low engagement — the caption or media likely failed to connect.\n`;
      }
    } else {
      postContext += '\n(No performance data yet for this post)\n';
    }

    postContext += `\nYour overall ${resolvedPlatform} averages: ${avgEngagement.toFixed(2)}% engagement, ${plStats?.avgLikes.toFixed(0) ?? summary.avgLikes} avg likes, ${plStats?.avgReach.toFixed(0) ?? summary.avgReach} avg reach\n`;

    if (summary.hashtagAnalysis.recommendedHashtags.length > 0) {
      postContext += `\nHashtags that perform well for you: ${summary.hashtagAnalysis.recommendedHashtags.slice(0, 8).join(', ')}\n`;
    }
    if (summary.hashtagAnalysis.avoidHashtags.length > 0) {
      postContext += `Hashtags to avoid (low performers): ${summary.hashtagAnalysis.avoidHashtags.slice(0, 5).join(', ')}\n`;
    }

    let systemPrompt: string;
    let userMessage: string;

    if (type === 'caption') {
      systemPrompt = `You are an expert social media content strategist specializing in ${resolvedPlatform}.
You have access to the user's real performance data. Your goal is to rewrite captions that dramatically improve engagement.

Tone: ${TONE_DESCRIPTIONS[tone as Tone] ?? TONE_DESCRIPTIONS.casual}
Platform character limit: ${charLimit} characters
${resolvedPlatform === 'X' ? 'Note: For X, write a primary tweet of max 280 chars. If the content is longer, note that it would become a thread.' : ''}

Rules:
- Always include a strong hook in the first line
- Include a clear call-to-action
- ${resolvedPlatform === 'INSTAGRAM' ? 'Add a question to drive comments. Include relevant hashtags after the main text.' : ''}
- ${resolvedPlatform === 'LINKEDIN' ? 'Write in a professional but engaging tone. Use line breaks for readability.' : ''}
- ${resolvedPlatform === 'X' ? 'Be punchy and concise. Limit to 3 hashtags max.' : ''}
- Keep the core message and intent of the original post

Respond with valid JSON in this exact format:
{
  "refinedCaption": "The improved caption text",
  "explanation": "Brief explanation of what was changed and why (1-2 sentences)",
  "keyImprovements": ["improvement 1", "improvement 2", "improvement 3"],
  "suggestedHashtags": ["#tag1", "#tag2"]
}`;

      userMessage = `Here is the post context and performance data:\n\n${postContext}\n\nPlease rewrite the caption with a ${tone} tone to maximize engagement on ${resolvedPlatform}.`;

    } else if (type === 'hashtags') {
      systemPrompt = `You are a hashtag strategy expert for ${resolvedPlatform}.
Based on the user's performance data, recommend an optimized hashtag set.

Platform: ${resolvedPlatform}
Ideal hashtag count: ${resolvedPlatform === 'INSTAGRAM' ? '8-15' : resolvedPlatform === 'LINKEDIN' ? '3-5' : '1-3'}

Respond with valid JSON in this exact format:
{
  "suggestedHashtags": ["#tag1", "#tag2", ...],
  "explanation": "Strategy explanation",
  "replace": ["#bad_tag1", "#bad_tag2"],
  "rationale": "Why these hashtags should perform better"
}`;

      userMessage = `Here is the post context:\n\n${postContext}\n\nSuggest an optimized hashtag set for this post.`;

    } else {
      // media_suggestion
      systemPrompt = `You are a visual content expert analyzing social media post performance.
Based on the metrics (high impressions but low engagement often signals a visual problem), provide specific media improvement suggestions.

Respond with valid JSON in this exact format:
{
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"],
  "primaryIssue": "The main reason this post underperformed visually",
  "actionItems": ["action 1", "action 2"]
}`;

      userMessage = `Here is the post context and metrics:\n\n${postContext}\n\nWhat media improvements would increase engagement?`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices[0]?.message?.content ?? '{}';

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      logger.error('Failed to parse AI refine-post response', { rawContent, userId: user.id });
      return res.status(500).json({ error: 'AI returned invalid JSON. Please try again.' });
    }

    logger.info(`Refine-post ${type} for post ${postId}`, { userId: user.id, platform: resolvedPlatform, tone });

    return res.status(200).json({
      type,
      platform: resolvedPlatform,
      tone,
      postId,
      originalCaption: post.caption,
      insight: insight
        ? { engagement: insight.engagement, reach: insight.reach, avgEngagement }
        : null,
      ...parsed,
    });
  } catch (error) {
    logger.error('Error in refine-post:', error, { userId: user.id });
    return res.status(500).json({
      error: 'Failed to generate refinement suggestions',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
