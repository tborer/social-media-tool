import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { getPerformanceSummary } from '@/lib/performance-analyzer';
import { logger } from '@/lib/server-logger';

/**
 * POST /api/ai/improve-post
 *
 * Generates N configurable improved versions of a post with tone selection,
 * focus options, and "Save as Draft" integration.
 *
 * Body:
 *  - postId: string                       — source post to improve
 *  - count?: number                       — number of versions to generate (default: 3, max: 5)
 *  - tone?: string                        — desired tone (casual | professional | storytelling | humorous | inspirational | direct_cta)
 *  - focus?: string[]                     — areas to focus on (e.g. ["engagement", "hashtags", "cta", "hook", "brevity"])
 *  - platform?: string                    — target platform (default: from post's targetPlatforms)
 *  - saveDrafts?: boolean                 — if true, save each version as a new DRAFT post with originalPostId lineage
 */

const TONE_DESCRIPTIONS: Record<string, string> = {
  casual: 'conversational, friendly, relatable',
  professional: 'authoritative, polished, business-appropriate',
  storytelling: 'narrative-driven, emotionally engaging, personal',
  humorous: 'witty, light-hearted, entertaining',
  inspirational: 'motivational, uplifting, empowering',
  direct_cta: 'action-oriented, concise, with a strong call-to-action',
};

const PLATFORM_LIMITS: Record<string, number> = {
  INSTAGRAM: 2200,
  LINKEDIN: 3000,
  X: 280,
  FACEBOOK: 63206,
  BLUESKY: 300,
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

  const {
    postId,
    count = 3,
    tone = 'casual',
    focus = [],
    platform,
    saveDrafts = false,
  } = req.body;

  if (!postId) {
    return res.status(400).json({ error: 'postId is required' });
  }

  const versionCount = Math.min(Math.max(1, Number(count) || 3), 5);

  try {
    const post = await prisma.contentPost.findFirst({
      where: { id: postId, userId: user.id },
      include: {
        postInsights: { orderBy: { fetchedAt: 'desc' }, take: 1 },
        socialMediaAccount: { select: { accountType: true } },
      },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const resolvedPlatform =
      platform ||
      (post.targetPlatforms.length > 0 ? post.targetPlatforms[0] : null) ||
      post.socialMediaAccount?.accountType ||
      'INSTAGRAM';

    const charLimit = PLATFORM_LIMITS[resolvedPlatform] ?? 2200;
    const toneDesc = TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.casual;

    const summary = await getPerformanceSummary(user.id);
    const userSettings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    const apiKey = userSettings?.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'No OpenAI API key configured. Add one in Settings.' });
    }

    const openai = new OpenAI({ apiKey });

    // Performance context
    const insight = post.postInsights[0] ?? null;
    const plStats = summary.platformStats.find((ps) => ps.platform === resolvedPlatform);
    const avgEngagement = plStats?.avgEngagement ?? summary.avgEngagement;

    let perfContext = `Platform: ${resolvedPlatform} (char limit: ${charLimit})\nOriginal caption:\n"${post.caption}"\n`;
    if (insight) {
      perfContext += `\nPost metrics: ${insight.engagement.toFixed(2)}% engagement (avg: ${avgEngagement.toFixed(2)}%), ${insight.reach} reach, ${insight.likes} likes\n`;
    }
    if (summary.hashtagAnalysis.recommendedHashtags.length > 0) {
      perfContext += `Top hashtags: ${summary.hashtagAnalysis.recommendedHashtags.slice(0, 8).join(', ')}\n`;
    }

    const focusInstructions = focus.length > 0
      ? `\nFocus areas: ${focus.join(', ')}. Prioritize improvements in these areas.`
      : '';

    const systemPrompt = `You are an expert social media content optimizer. Generate exactly ${versionCount} improved versions of the given post.

Tone: ${toneDesc}
${focusInstructions}

Rules:
- Each version must stay within ${charLimit} characters
- Each version should take a meaningfully different approach
- Always include a strong hook in the first line
- Include a clear CTA
${resolvedPlatform === 'INSTAGRAM' ? '- Include relevant hashtags after the main text' : ''}
${resolvedPlatform === 'X' ? '- Be punchy and concise. Max 3 hashtags.' : ''}
${resolvedPlatform === 'BLUESKY' ? '- Keep under 300 characters. No hashtags needed.' : ''}

Respond ONLY with valid JSON:
{
  "versions": [
    {
      "caption": "The improved caption text",
      "approach": "Brief label for this approach (e.g. 'Story-led hook', 'Question opener', 'Bold CTA')",
      "changes": ["change 1", "change 2"],
      "expectedImpact": "Why this version should perform better"
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: perfContext },
      ],
      temperature: 0.9,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices[0]?.message?.content ?? '{}';

    let parsed: { versions?: Array<{ caption: string; approach: string; changes: string[]; expectedImpact: string }> };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      logger.error('Failed to parse AI improve-post response', { rawContent, userId: user.id });
      return res.status(500).json({ error: 'AI returned invalid JSON. Please try again.' });
    }

    const versions = parsed.versions || [];

    // Optionally save each version as a new draft
    let savedDrafts: Array<{ id: string; approach: string }> = [];
    if (saveDrafts && versions.length > 0) {
      for (const v of versions) {
        const draft = await prisma.contentPost.create({
          data: {
            caption: v.caption,
            imageUrl: post.imageUrl,
            contentType: post.contentType,
            videoType: post.videoType,
            status: 'DRAFT',
            targetPlatforms: post.targetPlatforms,
            originalPostId: post.id,
            platformOverrides: post.platformOverrides ?? undefined,
            userId: user.id,
            socialMediaAccountId: post.socialMediaAccountId,
          },
        });
        savedDrafts.push({ id: draft.id, approach: v.approach });
      }
      logger.info(`Saved ${savedDrafts.length} improved drafts for post ${postId}`, { userId: user.id });
    }

    logger.info(`improve-post generated ${versions.length} versions for post ${postId}`, {
      userId: user.id,
      platform: resolvedPlatform,
      tone,
    });

    return res.status(200).json({
      postId,
      platform: resolvedPlatform,
      tone,
      focus,
      originalCaption: post.caption,
      versions,
      savedDrafts: saveDrafts ? savedDrafts : undefined,
    });
  } catch (error) {
    logger.error('Error in improve-post:', error, { userId: user.id });
    return res.status(500).json({
      error: 'Failed to generate improved versions',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
