# Social Media Tool (InstaCreate) - Implementation Plan

**Last Updated**: April 9, 2026
**Status**: Phases 1–4 Implemented (Features 1–8 Complete), Phase 5 Feature 9 Complete, Features 10–14 Not Started. Phase 6 audit complete — bugs, gaps, and test plan documented. Feature 15 (Critical Bugs & Build Issues) Complete. Feature 16 (Schema & Migration Gaps) Complete. Feature 17 (Multi-Platform Publishing Gaps) Complete.

---

## Overview

A social media management tool built with Next.js, Prisma, PostgreSQL (Supabase), and AI services (OpenAI, Google Gemini). Supports Instagram posting, scheduling, content discovery, AI-powered recommendations, and a manual-assist outreach system.

### Tech Stack
- **Frontend**: Next.js 14 (Pages Router), React 18, TypeScript, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Supabase) with Prisma 5.19.1 ORM
- **Storage**: Supabase Storage
- **Auth**: Supabase Auth
- **AI**: OpenAI GPT-4 / DALL-E 3, Google Gemini
- **Deployment**: Vercel with daily cron (`0 0 * * *`)
- **Security**: AES-256-GCM token encryption

### Design Principles
- **Cron scheduling once daily** — all scheduled tasks bundled under a single daily cron run
- **Manual triggers in the UI** — users can fetch data on-demand without waiting for the cron
- **Manual-assist outreach** — AI helps build contact lists and draft messages; user sends messages manually via Instagram

---

## Phase 1: Core Publishing & Insights ✅ COMPLETED

### Feature 1: Publishing Polish & Scheduling

**What was built:**
- Scheduling dialog with date/time picker for posts
- Caption validation (2,200 character limit, 30 hashtag limit) — both client-side and server-side
- Carousel (multi-image) support: comma-separated image URLs → Instagram Carousel API
- `igMediaId` tracking on published posts for insights fetching
- Error details display for failed posts
- Daily cron scheduler (`/api/scheduler/run`) that publishes due posts and fetches insights

**Key files:**
- `src/pages/dashboard.tsx` — scheduling dialog, caption counters, error details
- `src/pages/api/content-posts/index.ts` — server-side caption validation
- `src/pages/api/social-media-accounts/[id]/post.ts` — carousel support, igMediaId storage
- `src/pages/api/scheduler/run.ts` — daily cron endpoint
- `vercel.json` — cron configuration

### Feature 2: Post & Account Insights

**What was built:**
- `PostInsight` model — impressions, reach, likes, comments, shares, saves, engagement rate
- `AccountInsight` model — followers, following, media count, profile views, website clicks
- Manual "Fetch Insights" buttons in the Insights tab
- Account performance cards and post performance table
- Daily auto-fetch via cron (`/api/insights/fetch-all`)

**Key files:**
- `src/pages/api/insights/post-insights.ts` — GET stored / POST fetch fresh from Instagram
- `src/pages/api/insights/account-insights.ts` — GET stored / POST fetch fresh from Instagram
- `src/pages/api/insights/fetch-all.ts` — batch fetch for cron
- `prisma/schema.prisma` — PostInsight, AccountInsight models

**Migration:** `prisma/migrations/20260401000000_add_insights_models_and_ig_media_id/migration.sql`

---

## Phase 2: Discovery & Intelligence ✅ COMPLETED

### Feature 3: Content Discovery (Search, Ideas, Tracking)

**What was built:**
- Instagram hashtag search using `ig_hashtag_search` + `top_media` API
- Instagram account search using Business Discovery API (profile + recent 6 posts)
- "Save as Idea" from search results → `ContentIdea` model
- Content Ideas list with status management (NEW → IN_PROGRESS → USED → ARCHIVED)
- Tracked Hashtags with refresh capability
- Tracked Competitors with profile data refresh via Business Discovery API
- Discovery tab in dashboard with search, ideas, hashtags, and competitors sections

**Key files:**
- `src/pages/api/instagram/search.ts` — real Instagram API search (hashtag + account)
- `src/pages/api/content-ideas/index.ts` — CRUD for content ideas
- `src/pages/api/content-ideas/[id].ts` — update/delete individual ideas
- `src/pages/api/discovery/tracked-hashtags.ts` — GET/POST/DELETE
- `src/pages/api/discovery/tracked-competitors.ts` — GET/POST/DELETE
- `src/pages/api/discovery/refresh-competitor.ts` — refresh via Instagram API

**Migration:** `prisma/migrations/20260401010000_add_discovery_models/migration.sql`

### Feature 4: AI-Powered Recommendations

**What was built:**
- Performance analyzer (`src/lib/performance-analyzer.ts`) — aggregates post insights into averages, top/worst posts, best posting times, hashtag analysis
- AI recommendations endpoint with three modes:
  - `general` — overall strategy recommendations based on performance data
  - `caption_review` — AI review of a draft caption before publishing
  - `hashtag_suggestions` — data-driven hashtag recommendations
- "Get AI Recommendations" card in the Insights tab
- "AI Review" button in the create post dialog for pre-publish caption review

**Key files:**
- `src/lib/performance-analyzer.ts` — performance data aggregation
- `src/pages/api/ai/recommendations.ts` — AI recommendations endpoint
- `src/pages/dashboard.tsx` — recommendations UI, caption review UI

---

## Phase 3: Outreach System ✅ COMPLETED

### Feature 5: Manual-Assist Outreach

**What was built:**
- **Contact Management**: full CRUD for outreach contacts with search/filter by status
  - Fields: igUsername, displayName, niche, location, followerCount, engagementRate, bio, notes
  - Status pipeline: PROSPECT → CONTACTED → RESPONDED → CONVERTED → INACTIVE
- **Outreach Messages**: create, track, and manage messages per contact
  - Status tracking: DRAFT → SENT → REPLIED → NO_REPLY
  - Auto-timestamps (sentAt when marked SENT, responseReceivedAt when marked REPLIED)
  - Auto-updates contact status to RESPONDED when a message is marked REPLIED
  - Copy-to-clipboard for manual sending in Instagram
- **AI Message Generator**: personalized DM drafts using contact context
  - Template types: introduction, collaboration, product_pitch, follow_up
  - Uses contact profile data (niche, follower count, bio) for personalization
- **Outreach Criteria**: saved search criteria for finding prospects
  - Search terms, locations, niches, follower range
- **Outreach Stats**: funnel metrics dashboard
  - Contacts by status, messages by status, response rate
- **Outreach tab** in dashboard with:
  - Funnel stats overview
  - Contact list sidebar with search/filter
  - Contact detail panel with edit, notes, message history
  - AI message generation dialog
  - Message list with copy and status management

**Key files:**
- `src/pages/api/outreach/contacts.ts` — contact list CRUD with search
- `src/pages/api/outreach/contacts/[id].ts` — individual contact CRUD
- `src/pages/api/outreach/messages.ts` — message CRUD with auto-timestamps
- `src/pages/api/outreach/generate-message.ts` — AI message generation
- `src/pages/api/outreach/stats.ts` — funnel metrics
- `src/pages/api/outreach/criteria.ts` — search criteria CRUD

**Migration:** `prisma/migrations/20260402000000_add_outreach_models/migration.sql`

---

## Phase 4: Multi-Platform Expansion & Combined Insights ✅ COMPLETED

The goal of Phase 4 is to extend posting to LinkedIn and X, then consolidate performance data from all connected platforms into a unified insights experience that actively helps users understand what is working, what is not, and how to improve it. Every feature should serve the north-star goal of **increasing engagement through data-driven refinement**.

---

### Feature 6: LinkedIn & X Account Connection ✅ COMPLETED

**What to build:**

**Database / schema changes**
- Add `LINKEDIN`, `X`, and `BLUESKY` to the `AccountType` enum (LINKEDIN added in migration `20260405000000`; X and BLUESKY added in migration `20260409000000`)
- Add `linkedinUserId`, `linkedinOrganizationId` (optional — for company page posting) columns to `SocialMediaAccount`
- Add `xUserId` column to `SocialMediaAccount` for the Twitter/X numeric user ID
- Store per-platform post IDs on `ContentPost`: `igMediaId` (Instagram), `linkedinPostId` (LinkedIn), `xPostId` (X) — each nullable String storing the native post ID returned by the respective platform after publishing

**LinkedIn OAuth (OAuth 2.0 with PKCE)**
- Scopes required: `openid`, `profile`, `email`, `w_member_social`, `r_basicprofile`, `r_organization_social` (for org pages)
- Callback endpoint: `/api/auth/linkedin/callback`
- Store: access token (encrypted), token expiry, LinkedIn member URN (`urn:li:person:{id}`)
- Token refresh: LinkedIn access tokens last 60 days; surface a re-connect prompt when < 7 days remain
- UI: "Connect LinkedIn" button in the Accounts section, same pattern as existing Instagram connect flow

**X (Twitter) OAuth (OAuth 2.0 with PKCE)**
- Scopes required: `tweet.read`, `tweet.write`, `users.read`, `offline.access`
- Callback endpoint: `/api/auth/x/callback`
- Store: access token (encrypted), refresh token (encrypted), token expiry, X user ID
- Token refresh: X uses refresh tokens (rotate on each use); implement `/api/auth/x/refresh`
- UI: "Connect X" button in the Accounts section

**Key files to create / modify:**
- `src/pages/api/auth/linkedin/connect.ts` — initiate LinkedIn OAuth
- `src/pages/api/auth/linkedin/callback.ts` — exchange code, store tokens
- `src/pages/api/auth/x/connect.ts` — initiate X OAuth 2.0 PKCE
- `src/pages/api/auth/x/callback.ts` — exchange code, store tokens
- `src/pages/api/auth/x/refresh.ts` — refresh X access token
- `src/lib/linkedin-client.ts` — LinkedIn API wrapper
- `src/lib/x-client.ts` — X API v2 wrapper
- `prisma/schema.prisma` — enum + column additions
- `src/pages/dashboard.tsx` — account connection UI updates

**Migration:** new migration for AccountType enum update and new columns

---

### Feature 7: Multi-Platform Publishing ✅ COMPLETED

**What to build:**

**LinkedIn publishing**
- Text posts (up to 3,000 characters)
- Single image posts (`ugcPosts` API with `shareMediaCategory: IMAGE`)
- Multi-image posts (up to 20 images via LinkedIn carousel UGC post)
- Character limit validation: 3,000 chars for personal, 700 chars for company pages
- Hashtag support (no hard limit, but 3–5 recommended — surface this as a lint warning)
- Endpoint: `POST /api/social-media-accounts/[id]/post` — extend existing handler with a `platform` branch for `LINKEDIN`

**X (Twitter) publishing**
- Text tweets (up to 280 characters)
- Tweets with media (up to 4 images, or 1 video via X Media Upload API v1.1)
- Thread support: if caption > 280 chars, offer to auto-split into a numbered thread
- Character limit validation: 280 chars (23 chars consumed by any URL/media)
- Extend existing post endpoint with an `X` platform branch

**Unified post creation UI**
- "Post to" selector in the create-post dialog: Instagram, LinkedIn, X, or any combination (multi-select)
- Per-platform preview pane showing how the post will render (character count, truncation warnings)
- Platform-specific warnings shown inline (e.g., "LinkedIn ignores hashtags beyond 5", "This tweet will be split into a 3-part thread")
- `ContentPost.targetPlatforms` — new `String[]` field storing which platforms a post targets
- After publishing, store the native post ID in the per-platform field (`igMediaId`, `linkedinPostId`, `xPostId`). A `PostPublication` join table may be needed if publishing to multiple platforms from a single `ContentPost` record in one go

**Scheduler updates**
- `scheduler/run.ts` — extend to publish scheduled posts to LinkedIn and X in addition to Instagram
- Respect per-platform token validity before attempting publish; skip + log if token expired

**Key files to create / modify:**
- `src/pages/api/social-media-accounts/[id]/post.ts` — LinkedIn + X publish branches
- `src/lib/linkedin-client.ts` — `publishPost(account, postData)` implementation
- `src/lib/x-client.ts` — `publishTweet(account, postData)`, `uploadMedia(account, buffer)`, `publishThread(account, tweets)` implementation
- `src/pages/dashboard.tsx` — multi-platform post creation UI
- `src/pages/api/scheduler/run.ts` — multi-platform scheduler
- `prisma/schema.prisma` — `targetPlatforms` field, per-platform post ID fields (`linkedinPostId`, `xPostId`)

> **Architecture note (16d resolution):** The current approach is one `ContentPost` per `SocialMediaAccount` (single-account-per-record). Multi-platform posting creates separate `ContentPost` records for each platform via the `publish-all` endpoint. The `PostPublication` join table is deferred; it should be reconsidered if/when Feature 12 (Enhanced Multi-Platform Publishing UI) introduces true single-record multi-platform publishing.

---

### Feature 8: Combined Insights Tab & Post Refinement Engine ✅ COMPLETED

The core of Phase 4. A single tab that aggregates performance data from all connected accounts and uses it to tell the user exactly what to do next to improve engagement.

**What to build:**

#### 8a: Cross-Platform Metrics Collection

**Instagram (existing, extend)**
- Already fetches impressions, reach, likes, comments, shares, saves, engagement rate
- Add: profile visits per post, link clicks, story exits (where available from API)

**LinkedIn metrics**
- Post: impressions, clicks, reactions (LIKE, CELEBRATE, etc.), comments, shares, CTR, engagement rate
- Account: follower count, follower growth, profile views, unique impressions
- Fetch via LinkedIn Marketing API (`organizationalEntityShareStatistics`, `shareStatistics`)
- Store in `PostInsight` (extend with `platform` discriminator) and `AccountInsight`

**X metrics**
- Tweet: impressions, likes, retweets, replies, quotes, link clicks, profile visits, engagement rate
- Account: follower count, following, tweet count
- Fetch via X API v2 `GET /2/tweets/:id` with `tweet.fields=public_metrics,non_public_metrics`
- Store in `PostInsight` and `AccountInsight` (same models, add `platform` column)

**Schema changes**
- Add `platform` String column to `PostInsight` and `AccountInsight` (e.g., `"INSTAGRAM"`, `"LINKEDIN"`, `"X"`)
- Add `platformPostId` String? to `PostInsight` for cross-referencing
- Add extended metric columns to `PostInsight`: `clicks Int?`, `profileVisits Int?`, `linkClicks Int?`
- Add `followerGrowth Int?` to `AccountInsight` (delta since last fetch)

#### 8b: Combined Insights Dashboard UI

**Account overview strip**
- Row of cards, one per connected account (Instagram, LinkedIn, X)
- Each card: platform icon, username, follower count, follower growth (delta), last-fetched timestamp
- "Refresh All" button — triggers fetch across all platforms in parallel

**Cross-platform post performance table**
- All published posts across all platforms in a single sortable/filterable table
- Columns: thumbnail, caption preview, platform badge, date, impressions, engagement rate, likes, comments, shares
- Sort by engagement rate descending by default
- Filter by platform, date range, content type

**Platform comparison charts**
- Engagement rate over time per platform (line chart)
- Best posting days/times per platform (heat-map grid: day × hour, colored by avg engagement)
- Content type breakdown (IMAGE vs VIDEO vs text-only) by platform

#### 8c: What's Working Analysis

Surfaces patterns from top-performing posts to guide future content decisions.

**Top performers panel**
- Top 5 posts per platform by engagement rate (last 30/90 days, switchable)
- For each: thumbnail, caption, metrics, tags used, day/time posted
- AI-generated summary: "Your Instagram posts with behind-the-scenes content average 4.2% engagement vs 1.8% for product shots"

**Hashtag performance tracker**
- Per-platform hashtag usage vs engagement correlation
- Which hashtags appear in top 20% of posts vs bottom 20%
- Recommended hashtag sets based on historical data

**Timing insights**
- Best time to post per platform derived from historical post performance
- Recommended posting schedule: "Post on Instagram Tuesday 7–9 PM, LinkedIn Wednesday 8–10 AM, X Thursday 12–2 PM"
- Shown as a weekly calendar overlay suggestion

**Content-type signals**
- VIDEO vs IMAGE vs text-only performance comparison per platform
- Average engagement rate, reach, and saves per content type

#### 8d: What's Not Working Analysis

Identifies underperformers and diagnoses causes.

**Underperformers panel**
- Bottom 20% of posts by engagement rate in the last 90 days
- Grouped by likely cause (detected patterns): low reach, high impressions / low engagement, good reach / no saves
- Failure mode tags: "Caption too long", "Too many hashtags", "No call to action", "Posted off-peak", "Low-quality image"

**Caption quality linter**
- Pre-publish (integrated into create-post dialog) and post-publish analysis
- Rules: CTA presence, question mark (drives comments), readability score, hashtag count vs platform norm, link in bio mention for Instagram
- Red/yellow/green score with specific suggestions

**Decline alerts**
- If follower growth rate or avg engagement rate drops > 20% week-over-week, surface a banner in the Insights tab
- Suggested actions: "Your X engagement dropped 35% this week. Your last 3 posts had no images — try adding media."

#### 8e: Post Refinement Suggestions (AI-Powered)

AI uses the aggregated performance data as context to give specific, actionable improvement suggestions.

**Caption refinement**
- Rewrite a past underperforming post's caption using AI (using the post's actual metrics as context: "This got 0.4% engagement, which is below your 2.1% average")
- Tone options: casual, professional, storytelling, direct CTA
- Platform-appropriate rewrite (280 chars for X, long-form for LinkedIn)

**Media quality suggestions**
- If `PostInsight.engagement` is low but `PostInsight.impressions` is high (people saw it but didn't engage), suggest media improvement: brighter image, stronger thumbnail, add text overlay
- Link to AI image generation tool pre-seeded with the original post context

**Tag optimization**
- Replace underperforming hashtags with suggested alternatives based on historical data
- Cross-platform: suggest LinkedIn topics, X cashtags for financial content, etc.

**Timing optimizer**
- One-click "Schedule for best time" in the create-post dialog — automatically selects the platform-specific optimal posting window based on historical data

**A/B test tracker**
- User can mark two posts as an "A/B pair" (same content, different caption/image/time)
- Insights tab shows side-by-side comparison after 48 hours

**Refinement history**
- Log of suggestions accepted/rejected, with outcome tracking (did engagement improve after acting on a suggestion?)

**What was built:**
- All PostInsight/AccountInsight records carry a `platform` discriminator (`INSTAGRAM`, `LINKEDIN`, `X`)
- LinkedIn and X-specific insights endpoints (`linkedin-insights.ts`, `x-insights.ts`)
- `fetch-all.ts` extended for multi-platform cron collection
- `performance-analyzer.ts` extended with cross-platform aggregation, `platformStats`, `contentTypeBreakdown`, `underperformers`, `declineAlerts`, hashtag analysis
- Combined Insights dashboard tab with account overview strip, cross-platform post table, platform comparison stats
- **Performance charts** (recharts): engagement rate over time line chart per platform, content type performance bar chart
- What's Working section: top performers per platform, hashtag signals, best posting times
- What's Not Working section: decline alerts, underperformers with failure mode tags
- AI Post Refinement panel: caption rewrite (with tone), hashtag optimization, media suggestions
- A/B Test Tracker: create pairs, side-by-side comparison, mark winner
- Caption quality linter (pre-publish in create-post dialog and via `/api/insights/lint-caption`)
- Best-time optimizer with one-click schedule-for-best-time in create-post dialog
- `ABTest` model, extended `PostInsight`/`AccountInsight` columns

**Key files:**
- `src/pages/api/insights/linkedin-insights.ts`, `x-insights.ts`, `combined-insights.ts`, `fetch-all.ts`
- `src/pages/api/ai/refine-post.ts`, `src/pages/api/insights/ab-tests.ts`, `lint-caption.ts`, `best-time.ts`
- `src/lib/performance-analyzer.ts`
- `src/pages/dashboard.tsx` — full Insights tab redesign with recharts charts
- `prisma/schema.prisma` — ABTest model, platform + extended metric columns

**Migrations:** `20260405020000_add_cross_platform_insight_fields`, `20260405030000_add_ab_test`

---

## Phase 5: Content Quality, AI Advisor & Platform Expansion (Planned)

### Feature 9: Advanced AI Content Generation ✅ COMPLETED

**What was built:**
- **Brand voice customization** — save a brand voice profile (tone, target audience, brand personality, key phrases to include/avoid, example captions); all AI-generated captions automatically conform to it via the `/api/ai/generate-caption` endpoint
- **Enhanced image generation** — style presets (photorealistic, artistic, cartoon, minimalist, vintage, professional, cinematic) and aspect ratios (square 1:1, portrait 4:5, landscape 16:9, story 9:16) selectable in the AI Content Generator UI and passed through to both DALL-E 3 and Gemini
- AI video generation: deferred (pending suitable API availability)
- Image-to-video conversion: deferred (pending suitable API availability)

**Key files:**
- `prisma/schema.prisma` — added 6 brand voice fields to `UserSettings`
- `prisma/migrations/20260408000000_add_brand_voice/migration.sql` — brand voice columns
- `src/pages/api/user/settings.ts` — GET/POST updated for brand voice fields
- `src/pages/api/ai/generate-caption.ts` — auto-fetches user's brand voice and injects it into the prompt
- `src/pages/api/ai/generate-images.ts` — accepts `style` and `aspectRatio` params
- `src/lib/openai-client.ts` — `generateCaptionWithMessage(prompt, brandVoice?)`, `generateImages(prompt, count, style?, aspectRatio?)`
- `src/lib/gemini-client.ts` — same signatures; aspect ratio and style woven into the image prompt
- `src/lib/openai.ts`, `src/lib/gemini.ts` — updated wrapper signatures
- `src/pages/settings.tsx` — new **Brand Voice** tab with tone selector, audience, personality, key phrases, avoid phrases, examples
- `src/components/AIContentGenerator.tsx` — style preset grid + aspect ratio selector added before the prompt input

---

Phase 5 deepens the value of the insights system and broadens the platform reach. The north-star goal is a **closed loop**: publish → measure → AI advises → improve draft → publish again. Every feature below serves a step in that loop.

---

### Feature 10: Copy Post to Draft from Insights

Enable users to duplicate any published post (high or low performing) directly into a new draft so it can be revised and re-published. This is the foundation of the iterative improvement loop.

**What to build:**

**UI changes**
- Add a "Copy to Draft" button to every post row in the Insights tab (post performance table) and to the individual post detail view
- On click, open a pre-filled "Create/Edit Post" dialog with:
  - Caption copied from the original
  - Image URL carried over (if present)
  - Platform selection defaulting to the original post's platform
  - A subtle banner: "Copied from post published on [date] — [metric summary, e.g., 0.4% engagement]"
- The copied draft is saved with status `DRAFT` and `originalPostId` reference (see schema below)

**API changes**
- `POST /api/content-posts/[id]/copy-to-draft` — creates a new `ContentPost` record with `status: DRAFT`, copies caption + imageUrl, records `originalPostId` as a reference for tracking improvement chains

**Schema changes**
- Add `originalPostId String?` to `ContentPost` — nullable self-referential FK pointing to the post this draft was copied from; used to build a lineage chain and later compare performance

**Key files to create / modify:**
- `src/pages/api/content-posts/[id]/copy-to-draft.ts` — new endpoint
- `src/pages/dashboard.tsx` — "Copy to Draft" button in Insights post table + detail view, pre-filled dialog logic
- `prisma/schema.prisma` — add `originalPostId` to `ContentPost`

**Migration:** add `originalPostId String?` self-relation to `ContentPost`

---

---

### Feature 11: Facebook & Bluesky Account Connection

Extend account management to support Facebook Pages and Bluesky (AT Protocol) so they can be used for publishing in Feature 12.

**What to build:**

#### Facebook

**OAuth flow**
- Use Facebook Login (OAuth 2.0) via the Meta Graph API
- Scopes: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, `public_profile`
- Flow: user authorizes → app receives short-lived user token → exchange for long-lived token (60-day) → fetch list of Pages the user manages → store the selected Page's `page_access_token` and `pageId`
- Callback endpoint: `GET /api/auth/facebook/callback`
- Token refresh: Facebook page access tokens derived from long-lived user tokens do not expire — re-fetch via `/me/accounts` when needed

**Schema additions to `SocialMediaAccount`**
- `facebookPageId String?` — the Page ID used as the actor for all Page posts
- `facebookPageName String?` — display name for the connected Page

**UI**
- Add `FACEBOOK` to the account type selector in the Accounts tab
- "Connect Facebook Page" OAuth button → redirects to Facebook Login with page permissions
- After OAuth: if user manages multiple Pages, show a Page picker dialog before saving

#### Bluesky

**Connection flow**
- Bluesky uses the AT Protocol (ATP) — no traditional OAuth; authentication is via App Passwords
- User enters their Bluesky handle (e.g., `user.bsky.social`) and an App Password generated at `bsky.app/settings/app-passwords`
- App calls `POST https://bsky.social/xrpc/com.atproto.server.createSession` with `identifier` + `password` to get a session JWT (accessJwt + refreshJwt)
- Store encrypted accessJwt and refreshJwt; refresh via `com.atproto.server.refreshSession` when needed
- Note: App Passwords are scoped and do not expose the user's main password

**Schema additions to `SocialMediaAccount`**
- `blueskyHandle String?` — the user's AT identifier (DID or handle)
- `blueskyDid String?` — the resolved DID (decentralized identifier), used as the actor in all ATP requests

**UI**
- Add `BLUESKY` to the account type selector
- Instead of an OAuth redirect button, show a form: handle input + App Password input
- On submit, call a new API endpoint to create the session and store tokens
- Link to Bluesky's App Password settings page for guidance

**Key files to create / modify:**
- `src/pages/api/auth/facebook/connect.ts` — initiate Facebook OAuth
- `src/pages/api/auth/facebook/callback.ts` — exchange token, fetch pages, store
- `src/lib/facebook-oauth.ts` — Facebook OAuth helpers
- `src/pages/api/auth/bluesky/connect.ts` — create ATP session, store tokens
- `src/lib/bluesky-client.ts` — ATP session helpers (createSession, refreshSession)
- `src/pages/dashboard.tsx` — account UI for Facebook (OAuth button + page picker) and Bluesky (form-based)
- `prisma/schema.prisma` — `FACEBOOK` to AccountType enum, add `facebookPageId`, `facebookPageName`, `blueskyHandle`, `blueskyDid`

**Migration:** extend `AccountType` enum + add new nullable columns to `SocialMediaAccount`

---

### Feature 12: Enhanced Multi-Platform Publishing UI

Redesign the post creation UI to support publishing to any combination of Instagram, LinkedIn, X, Facebook, and Bluesky. Fields that are shared across platforms are entered once; fields that are platform-specific get their own dedicated input area.

**What to build:**

#### Shared vs. Platform-Specific Fields

| Field | Shared | Platform-specific notes |
|---|---|---|
| Image / media | ✅ Shared | Video type only relevant for IG (REELS vs FEED); FB accepts video too |
| Hashtags | ✅ Shared base | Instagram: in caption or first comment (30 max); LinkedIn: appended (3–5 recommended); X: counted in 280 chars; Facebook: optional; Bluesky: hashtag facets (via rich text) |
| Schedule time | ✅ Shared | One scheduled time applies to all platforms |
| Caption / body text | ⚠️ Platform override | Shared base caption + optional per-platform override |
| X tweet text | ❌ X-only | 280 char hard limit; shown only when X account selected |
| LinkedIn article intro | ❌ LinkedIn-only | Long-form lead paragraph option (up to 3,000 chars) |
| Facebook link preview URL | ❌ Facebook-only | Attached link with OG metadata preview |
| Bluesky external link card | ❌ Bluesky-only | ATP `app.bsky.feed.post` embed card |

#### UI Design

**Platform selector**
- Multi-select toggle row: Instagram · LinkedIn · X · Facebook · Bluesky
- Each toggle shows the platform icon; active platforms are highlighted
- Only accounts the user has connected appear as options
- Selecting a platform shows its specific fields below the shared fields section

**Shared fields section**
- Media upload (image or video)
- Base caption / body (labelled "Caption — applies to all selected platforms unless overridden below")
- Hashtags (shared pool; platform-specific application explained via tooltip)
- Schedule picker

**Per-platform override panels** (shown only when that platform is selected)
- Each panel is collapsible; collapsed by default if the shared caption is short enough
- **Instagram panel**: character counter (2,200), hashtag count warning (> 30), first-comment hashtag option
- **LinkedIn panel**: character counter (3,000), hashtag warning (> 5), long-form toggle
- **X panel**: tweet text field (280 char hard limit with visual counter), thread preview if > 280 chars on base caption
- **Facebook panel**: link URL field + preview card, audience selector (public / friends)
- **Bluesky panel**: external link card URL, character counter (300)

**Live preview strip**
- Row of per-platform preview cards below the form
- Each card shows how the post will appear on that platform (truncated caption, character count badge, "Will split into N tweets" warning for X)

**Validation**
- Block publish if any selected platform's content exceeds its hard limit
- Warn (not block) for soft limits (LinkedIn hashtag count, Instagram hashtag count)
- Warn if X text will auto-thread

#### API changes
- Extend `POST /api/social-media-accounts/[id]/post` to route to Facebook and Bluesky publishers
- Add `platformOverrides` field to `ContentPost`: JSON object keyed by platform with caption override + platform-specific metadata

**Facebook publishing**
- `POST /{pageId}/feed` with `message` + optional `link`, `object_attachment`
- Image posts: upload to `/{pageId}/photos` first, then publish
- Video posts: upload via Resumable Upload API, then publish

**Bluesky publishing**
- `com.atproto.repo.createRecord` with `$type: app.bsky.feed.post`
- Image: upload blob via `com.atproto.repo.uploadBlob`, embed in post
- Rich text: parse hashtags and mentions into ATP facets (byte-range annotations)
- 300 character limit (grapheme count, not byte count)

**Schema changes**
- Add `platformOverrides Json?` to `ContentPost` — stores per-platform caption overrides and metadata as `{ "X": { "tweetText": "..." }, "LINKEDIN": { "caption": "..." }, ... }`

**Key files to create / modify:**
- `src/pages/api/social-media-accounts/[id]/post.ts` — add Facebook + Bluesky publisher branches
- `src/lib/facebook-client.ts` — Facebook Graph API publish helpers
- `src/lib/bluesky-client.ts` — ATP post creation, blob upload, rich text facet builder
- `src/pages/dashboard.tsx` — redesigned post creation dialog (platform selector, per-platform panels, preview strip)
- `prisma/schema.prisma` — add `platformOverrides Json?` to `ContentPost`

---

### Feature 13: In-Draft AI Post Advisor

Allow users to get AI-powered feedback on a post while it is still being drafted — before publishing. The advisor returns **structured recommendations** parsed from the AI response, displayed inline with one-click "Apply" actions where possible.

**What to build:**

**Trigger**
- "Get AI Advice" button inside the post creation / edit dialog, positioned near the caption field
- Available as soon as a caption (and optionally an image) is entered
- Also available on draft posts in the Posts tab via an "Advise" button on each draft row

**Request payload** (sent to `POST /api/ai/draft-advisor`)
```json
{
  "caption": "...",
  "platforms": ["INSTAGRAM", "LINKEDIN"],
  "imageUrl": "...",
  "scheduledFor": "2026-04-10T19:00:00Z",
  "accountIds": ["..."],
  "performanceContext": {
    "avgEngagementRate": 2.1,
    "topHashtags": ["#productivity", "#growth"]
  }
}
```

**Structured response schema** (AI returns JSON; server validates before returning to client)
```json
{
  "overallScore": 7.2,
  "summary": "Solid hook but missing a call-to-action. LinkedIn version is within character limit.",
  "recommendations": [
    {
      "id": "rec_1",
      "category": "engagement",
      "priority": "high",
      "issue": "No call-to-action detected",
      "suggestion": "End with a question or direct ask, e.g., 'What's your biggest challenge with X?'",
      "applyAction": "append_cta"
    },
    {
      "id": "rec_2",
      "category": "hashtags",
      "priority": "medium",
      "issue": "Only 2 hashtags — Instagram performs better with 8–15 relevant tags",
      "suggestion": "Consider adding: #contentmarketing #socialmediatips #growthhacking",
      "applyAction": "append_hashtags",
      "applyValue": "#contentmarketing #socialmediatips #growthhacking"
    },
    {
      "id": "rec_3",
      "category": "timing",
      "priority": "low",
      "issue": "Scheduled for Monday 7 AM — below your historical average engagement time",
      "suggestion": "Your best Instagram window is Tuesday–Thursday 7–9 PM based on past posts",
      "applyAction": null
    }
  ],
  "platformNotes": {
    "INSTAGRAM": "Caption length is ideal (under 500 chars for feed). Hashtags should be at the end.",
    "LINKEDIN": "Consider expanding the middle section — LinkedIn rewards longer, story-driven posts."
  },
  "revisedCaption": "...(optional AI-rewritten version of the full caption)..."
}
```

**UI display**
- Slide-out panel or inline card below the caption field
- Overall score badge (e.g., "7.2 / 10")
- Each recommendation shown as a card with priority badge (HIGH / MEDIUM / LOW), issue label, and suggestion text
- "Apply" button on recommendations with an `applyAction` — e.g., appending hashtags or a CTA stub directly into the caption field
- "Use Revised Caption" button to replace the current caption with the AI-rewritten version
- Per-platform notes shown in a tab-strip keyed to selected platforms

**API endpoint:** `POST /api/ai/draft-advisor`
- Auth-protected (Supabase session)
- Builds a structured prompt from the request, calls OpenAI or Gemini
- Parses and validates the JSON response (Zod schema) before returning to the client
- Falls back gracefully if AI returns malformed JSON (returns a plain-text summary)

**Key files to create / modify:**
- `src/pages/api/ai/draft-advisor.ts` — new endpoint
- `src/pages/dashboard.tsx` — "Get AI Advice" button + recommendations panel in post creation dialog
- `src/lib/performance-analyzer.ts` — export `getUserPerformanceContext(userId)` for injecting into the prompt

---

### Feature 14: AI Post Improvement Engine from Insights

From the Insights tab, when viewing a high or low performing post, allow users to invoke an AI engine that returns a configurable number of improved versions of that post. Each version is fully formed, ready to save as a draft.

**What to build:**

**Trigger**
- "Generate Improved Versions" button on each post in the Insights post performance table and the post detail panel
- Opens a configuration dialog before calling AI:
  - **Number of versions** (slider or number input: 1–10, default 5)
  - **Tone** (multi-select: Casual, Professional, Storytelling, Direct CTA, Humorous)
  - **Platform target** (defaults to the original post's platform; can be changed to cross-post variants)
  - **Focus** (optional checkboxes: Improve engagement, Add CTA, Optimize hashtags, Shorten for X, Expand for LinkedIn)

**Request payload** (sent to `POST /api/ai/improve-post`)
```json
{
  "postId": "...",
  "originalCaption": "...",
  "platform": "INSTAGRAM",
  "metrics": {
    "impressions": 4200,
    "engagementRate": 0.42,
    "likes": 12,
    "comments": 1,
    "shares": 0,
    "avgEngagementRate": 2.1
  },
  "count": 5,
  "tones": ["casual", "storytelling"],
  "focus": ["improve_engagement", "add_cta"]
}
```

**Structured response schema** (AI returns JSON; server validates before returning)
```json
{
  "originalPostId": "...",
  "analysisNote": "This post had 0.42% engagement vs your 2.1% average. Low likes suggest the hook did not resonate. No CTA was detected.",
  "versions": [
    {
      "versionNumber": 1,
      "tone": "casual",
      "caption": "...(full rewritten caption)...",
      "changesSummary": "Rewrote the hook, added a question at the end, trimmed hashtags to 10 relevant tags",
      "predictedImpact": "Hook-first openers average +38% engagement in your top posts",
      "hashtags": ["#tag1", "#tag2"]
    },
    {
      "versionNumber": 2,
      "tone": "storytelling",
      "caption": "...",
      "changesSummary": "...",
      "predictedImpact": "...",
      "hashtags": []
    }
  ]
}
```

**UI display**
- Results shown in a modal / slide-over panel titled "Improved Versions"
- Analysis note shown at the top in a callout box ("Here's why this post underperformed…")
- Each version displayed as a card:
  - Version number + tone badge
  - Full caption (with character count for selected platform)
  - Changes summary in a collapsed "What changed?" section
  - Predicted impact note
  - **"Save as Draft"** button — calls `POST /api/content-posts/[originalId]/copy-to-draft` with the new caption pre-filled
  - **"Copy to Clipboard"** button
- "Save All as Drafts" button at the bottom of the modal
- After saving, show a toast: "5 drafts created — view them in the Posts tab"

**API endpoint:** `POST /api/ai/improve-post`
- Auth-protected (Supabase session)
- Fetches the original post + its `PostInsight` records from the DB
- Fetches user's performance context via `getUserPerformanceContext(userId)` for comparison metrics
- Builds a structured prompt with full context (post content, real metrics, user's avg metrics, requested tone/focus)
- Calls OpenAI GPT-4o (primary) or Gemini (fallback)
- Validates response with Zod schema; retries once if malformed
- Returns the validated structured response

**Key files to create / modify:**
- `src/pages/api/ai/improve-post.ts` — new endpoint
- `src/pages/dashboard.tsx` — "Generate Improved Versions" button in Insights post table + detail; version card modal; "Save as Draft" integration
- `src/lib/performance-analyzer.ts` — extend `getUserPerformanceContext` to include per-platform averages
- `src/pages/api/content-posts/[id]/copy-to-draft.ts` — shared with Feature 10; ensure it accepts an optional `captionOverride` param so the AI version is used instead of the original

---

## Phase 6: Fixes, Gaps & Production Readiness (Planned)

Phase 6 consolidates all issues, inconsistencies, and gaps discovered during a comprehensive audit of Phases 1–5 against the actual codebase. It also introduces a full test suite covering every feature. The goal is to bring the application to production quality before adding net-new functionality.

---

### Feature 15: Critical Bugs & Build Issues ✅ COMPLETED

#### 15a: Prisma Client Build Error (CRITICAL) ✅ FIXED
- **Issue**: Production builds failed with `Module not found: Can't resolve '.prisma/client/index-browser'`. Import chain: `prisma.ts → logger.ts → LogsViewer.tsx → dashboard.tsx`.
- **Impact**: Blocked all production deployments.
- **Resolution**: Added `"postinstall": "prisma generate"` script to `package.json`. This ensures the Prisma client is generated after every `npm install` / `pnpm install`, including in CI/CD and Vercel deployments.

#### 15b: Outreach Stats Field Name Mismatch (BUG) ✅ FIXED
- **Issue**: `/api/outreach/stats.ts` returned `{ contactStats, messageStats }` but `dashboard.tsx` (lines 4418–4421) read `outreachStats.contactsByStatus.PROSPECT`, etc. All outreach funnel metrics displayed as **0** in the UI.
- **Resolution**: Renamed API response keys from `contactStats` → `contactsByStatus` and `messageStats` → `messagesByStatus` in `/api/outreach/stats.ts` to match the dashboard's expectations.

#### 15c: next.config.mjs Warnings ✅ FIXED
- **Issue**: Build output showed `Invalid next.config.mjs options detected: Unrecognized key(s) in object: 'turbopack', 'api'`.
- **Resolution**: Removed the empty `turbopack: {}` key and the invalid top-level `api.bodyParser` config from `next.config.mjs`. (In Next.js Pages Router, body parser size is configured per-route, not globally.)

---

### Feature 16: Schema & Migration Gaps ✅ COMPLETED

#### 16a: Missing `X` and `BLUESKY` Enum Migrations ✅ FIXED
- **Issue**: The `AccountType` enum in `schema.prisma` includes `X` and `BLUESKY`, but no migration adds these values. Migration `20260405000000` only adds `LINKEDIN`. A fresh database deploy will fail because the enum values don't exist.
- **Fix**: Create a new migration that adds `X` and `BLUESKY` to the `AccountType` enum via `ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'X'` and `ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'BLUESKY'`.
- **Resolution**: Created migration `20260409000000_add_x_bluesky_enum_values` with `ALTER TYPE` statements for both values.

#### 16b: Missing `linkClicks` Column on `PostInsight` ✅ FIXED
- **Issue**: Feature 8 spec (section 8a) calls for a `linkClicks Int?` column on `PostInsight`. The column does not exist in the schema or any migration. The `clicks` column exists but is semantically different (total clicks vs. link-specific clicks).
- **Fix**: Either add `linkClicks Int?` to `PostInsight` or document that `clicks` serves as the combined metric and update the plan accordingly.
- **Resolution**: Added `linkClicks Int?` to the `PostInsight` model in `schema.prisma` and created migration `20260409010000_add_link_clicks_to_post_insight`. The existing `clicks` column is retained as the general/combined click metric; `linkClicks` tracks link-specific clicks (LinkedIn link clicks / X `url_link_clicks`). Updated the Database Models section to reflect both columns.

#### 16c: `platformPostId` on `ContentPost` — Plan vs. Reality ✅ FIXED
- **Issue**: The plan describes a single generic `platformPostId String?` on `ContentPost` to store the native post ID for any platform. The actual schema uses three separate fields: `igMediaId`, `linkedinPostId`, `xPostId`. This divergence is not documented.
- **Fix**: Update the plan's Database Models and Feature 6 sections to reflect the actual per-platform ID approach. If Facebook and Bluesky are added, decide whether to continue with per-platform fields or refactor to a `PostPublication` join table.
- **Resolution**: Updated Feature 6, Feature 7, and Database Models sections to document the per-platform ID approach (`igMediaId`, `linkedinPostId`, `xPostId`). Removed references to a generic `platformPostId` on `ContentPost` and `SocialMediaAccount`. Per-platform fields will continue for Facebook/Bluesky; a `PostPublication` join table is deferred to Feature 12 if needed. Also corrected Feature 6's claim that "X already exists" — `X` was added to the schema but not via migration until 16a.

#### 16d: Missing `PostPublication` Join Table ✅ RESOLVED
- **Issue**: Feature 7 mentions an optional `PostPublication` join model for tracking multi-platform publication of a single post. It was never created. The current approach (one `ContentPost` → one `SocialMediaAccount`) limits true multi-platform-in-one-go publishing.
- **Fix**: Decide on the architecture: either implement `PostPublication` (many-to-many between posts and accounts) or formalize the current single-account-per-record approach.
- **Resolution**: Formalized the current single-account-per-record approach. Multi-platform posting creates separate `ContentPost` records per platform via the `publish-all` endpoint. Added an architecture note in Feature 7 documenting this decision and deferring `PostPublication` to Feature 12 (Enhanced Multi-Platform Publishing UI) if true single-record multi-platform publishing is needed.

#### 16e: Phase 5 Schema Fields Not Yet Created ✅ VERIFIED
The following fields described in the Phase 5 plan are not present in the schema or any migration and must be created when their respective features are implemented:
- `ContentPost.originalPostId String?` (self-referential FK for copy-to-draft lineage — Feature 10)
- `ContentPost.platformOverrides Json?` (per-platform caption/metadata overrides — Feature 12)
- `SocialMediaAccount.facebookPageId String?` (Feature 11)
- `SocialMediaAccount.facebookPageName String?` (Feature 11)
- `SocialMediaAccount.blueskyHandle String?` (Feature 11)
- `SocialMediaAccount.blueskyDid String?` (Feature 11)
- `FACEBOOK` value in `AccountType` enum (Feature 11)
- **Resolution**: Confirmed none of these fields exist in the current schema. They will be added as part of their respective feature implementations (Features 10–12).

---

### Feature 17: Multi-Platform Publishing Gaps ✅ COMPLETED

#### 17a: `targetPlatforms` Field Not Used by Scheduler ✅ RESOLVED
- **Issue**: `ContentPost.targetPlatforms` (String[]) is stored in the database but never read by `scheduler/run.ts`. The scheduler publishes to whichever single `SocialMediaAccount` is linked to the post. Users setting multiple target platforms get no actual multi-platform posting.
- **Fix**: Refactor the scheduler to iterate over `targetPlatforms` and publish to each corresponding account, OR remove the field if multi-platform posting will use the `PostPublication` model instead.
- **Resolution**: Aligned with the Feature 16d architectural decision (single-account-per-record). The `targetPlatforms` field is advisory only — it is used by the dashboard UI to pre-select accounts in the publish dialog. The scheduler correctly publishes to the single `socialMediaAccountId` linked to each post; users who want multi-platform scheduled posting should create separate `ContentPost` records per account. Added an explanatory comment in `scheduler/run.ts` to document this behavior.

#### 17b: `publish-all` Endpoint Not Documented ✅ FIXED
- **Issue**: `/api/content-posts/[id]/publish-all.ts` exists in the codebase and is called from the dashboard (line 4874), but is not listed in the API Endpoints section of the plan.
- **Fix**: Add documentation for this endpoint in the API Endpoints section.
- **Resolution**: Updated the API Endpoints section — "Multi-Account Publishing" entry now marked ✅ Complete with a full description of the request shape, response behavior (HTTP 207 for partial success), and platform post ID storage.

#### 17c: Bluesky Posting Throws Unimplemented Error ✅ FIXED
- **Issue**: `BLUESKY` is in the `AccountType` enum and users could potentially select it, but both `post.ts` (line 98) and `scheduler/run.ts` (line 587) throw `Error('Bluesky posting is not yet implemented')`. There is no guard in the UI preventing users from attempting to post.
- **Fix**: Either implement Bluesky posting (Feature 11/12 dependency) or add UI-level guards that disable posting for Bluesky accounts until the feature is ready.
- **Resolution**: Added UI-level guards in `dashboard.tsx`: (1) In the multi-platform publish dialog, Bluesky account checkboxes are disabled with a `(coming soon)` label and `opacity-50 cursor-not-allowed` styling so users cannot select them. (2) In the schedule dialog account dropdown, Bluesky options are disabled with a `Bluesky — coming soon` label. Full Bluesky posting support is deferred to Feature 11/12.

---

### Feature 18: Plan Documentation Inconsistencies

#### 18a: AB Testing & AI Refinement Marked "(Planned)" in Endpoints Section
- **Issue**: The "Phase 4 Endpoints" section lists `POST /api/ai/refine-post` under "AI Refinement **(Planned)**" and `GET/POST /api/insights/ab-tests` under "A/B Testing **(Planned)**". However, Feature 8 is marked **✅ COMPLETED** and both endpoints are fully implemented.
- **Fix**: Update the Phase 4 Endpoints section to mark both as **✅ Complete**.

#### 18b: Feature 11 Self-Reference Error
- **Issue**: Feature 11's description says "Extend account management to support Facebook Pages and Bluesky (AT Protocol) so they can be used for publishing in Feature 12." This should reference Feature 12, not itself.
- **Fix**: Change "Feature 11" to "Feature 12" in the Feature 11 description.

#### 18c: Feature 6 Claims "X Already Exists"
- **Issue**: Feature 6 description says "Add `LINKEDIN` to the `AccountType` enum (X already exists; Bluesky is deferred)". However, no migration ever added `X` to the enum (see 16a above). The X enum value was added directly to the schema without a corresponding migration.
- **Fix**: Correct the plan to note that `X` was added to the schema alongside LINKEDIN support, and ensure a migration exists (see 16a).

#### 18d: Phase 4 Status Label
- **Issue**: Phase 4 header says "🚧 IN PROGRESS" but all three features (6, 7, 8) are marked ✅ COMPLETED.
- **Fix**: Update Phase 4 header to "✅ COMPLETED".

---

### Feature 19: Unimplemented Phase 5 Features (10–14)

The following Phase 5 features have zero codebase presence and need full implementation:

#### 19a: Feature 10 — Copy Post to Draft
- **Status**: Not started. No `originalPostId` field, no `copy-to-draft` endpoint, no UI button.
- **Dependencies**: Schema migration for `originalPostId`.
- **Note**: Feature 14 depends on this endpoint accepting a `captionOverride` parameter.

#### 19b: Feature 11 — Facebook & Bluesky Account Connection
- **Status**: Not started. `FACEBOOK` not in enum. No Facebook OAuth endpoints. No Bluesky connect endpoint. No `facebookPageId`, `facebookPageName`, `blueskyHandle`, or `blueskyDid` fields.
- **Dependencies**: Schema migration for enum + new columns. Facebook Developer App setup. Bluesky App Password flow.
- **Note**: `BLUESKY` exists in the enum but has no auth, connection, or field support.

#### 19c: Feature 12 — Enhanced Multi-Platform Publishing UI
- **Status**: Not started. No `platformOverrides` field. No Facebook/Bluesky publisher branches. No per-platform override panels or live preview strip.
- **Dependencies**: Feature 11 (Facebook & Bluesky connection), schema migration for `platformOverrides`.

#### 19d: Feature 13 — In-Draft AI Post Advisor
- **Status**: Not started. No `/api/ai/draft-advisor` endpoint.
- **Note**: The existing `/api/ai/recommendations` endpoint with `caption_review` type provides partial overlap. Feature 13 adds structured JSON recommendations with `applyAction` buttons, per-platform notes, and an overall score — a superset of the existing caption review.

#### 19e: Feature 14 — AI Post Improvement Engine
- **Status**: Not started. No `/api/ai/improve-post` endpoint.
- **Note**: The existing `/api/ai/refine-post` endpoint provides single-version refinement. Feature 14 generates N configurable improved versions with tone selection, focus options, and "Save as Draft" integration — a significant expansion beyond the existing refine-post.

---

### Feature 20: Production Polish

- Performance optimization (query optimization, pagination, caching layer)
- Enhanced error notifications (email/push alerts for failed scheduled posts)
- Security audit (token storage, API key exposure, CSRF, input sanitization)
- Trend charts and sparklines throughout the insights UI
- Rate limiting on AI endpoints to prevent abuse
- Proper error boundaries in React components
- Loading skeletons for data-heavy tabs (Insights, Discovery, Outreach)

---

### Feature 21: Comprehensive Test Suite

A full testing layer covering every feature from Phase 1 through Phase 5. Tests should be organized by feature and type (unit, integration, e2e).

#### 21a: Testing Infrastructure Setup
- Install and configure test framework: Jest + React Testing Library for unit/integration, Playwright or Cypress for e2e
- Configure test database (separate Supabase project or local PostgreSQL via Docker)
- Set up MSW (Mock Service Worker) for mocking Instagram, LinkedIn, X, OpenAI, and Gemini API responses
- Create shared test fixtures: mock user, mock accounts (Instagram, LinkedIn, X), mock posts, mock insights data
- Configure CI pipeline to run tests on pull requests
- Set up code coverage reporting with minimum thresholds

#### 21b: Phase 1 Tests — Core Publishing & Insights

**Feature 1: Publishing Polish & Scheduling**
- Unit: caption validation logic (2,200 char limit, 30 hashtag limit, edge cases)
- Unit: carousel URL parsing (comma-separated → array)
- Integration: `POST /api/content-posts` — create post with valid/invalid captions
- Integration: `POST /api/social-media-accounts/[id]/post` — publish single image, carousel, video (mocked Instagram API)
- Integration: `POST /api/scheduler/run` — picks up due scheduled posts, skips future posts, handles publish failures gracefully
- Integration: igMediaId storage after successful publish
- Integration: error details stored on failed publish
- e2e: create post → schedule → verify appears in scheduled list → manual publish → verify status changes

**Feature 2: Post & Account Insights**
- Unit: insights data normalization and engagement rate calculation
- Integration: `GET /api/insights/post-insights` — returns stored insights for user's posts only (user isolation)
- Integration: `POST /api/insights/post-insights` — fetches from Instagram API (mocked), stores correctly
- Integration: `GET /api/insights/account-insights` — returns stored account metrics
- Integration: `POST /api/insights/account-insights` — fetches from Instagram API (mocked)
- Integration: `POST /api/insights/fetch-all` — batch fetch for all accounts, handles partial failures
- e2e: navigate to Insights tab → click Fetch Insights → verify data appears in cards and table

#### 21c: Phase 2 Tests — Discovery & Intelligence

**Feature 3: Content Discovery**
- Integration: `GET /api/instagram/search` — hashtag search returns results (mocked Instagram API)
- Integration: `GET /api/instagram/search` — account search returns profile + posts (mocked)
- Integration: `POST /api/content-ideas` — save idea from search results
- Integration: `PUT /api/content-ideas/[id]` — status transitions (NEW → IN_PROGRESS → USED → ARCHIVED)
- Integration: `GET/POST/DELETE /api/discovery/tracked-hashtags` — CRUD with unique constraint enforcement
- Integration: `GET/POST/DELETE /api/discovery/tracked-competitors` — CRUD with unique constraint enforcement
- Integration: `POST /api/discovery/refresh-competitor` — refreshes via Instagram API (mocked)
- e2e: search hashtag → save as idea → change status → verify in ideas list

**Feature 4: AI-Powered Recommendations**
- Unit: `performance-analyzer.ts` — aggregation logic with various data shapes (no posts, one post, many posts, multi-platform)
- Unit: `performance-analyzer.ts` — hashtag analysis, best posting times calculation, content type breakdown
- Unit: `performance-analyzer.ts` — underperformer detection, decline alert thresholds
- Integration: `POST /api/ai/recommendations` (mode: general) — returns recommendations with performance context (mocked OpenAI)
- Integration: `POST /api/ai/recommendations` (mode: caption_review) — returns structured caption feedback
- Integration: `POST /api/ai/recommendations` (mode: hashtag_suggestions) — returns hashtag recommendations
- e2e: navigate to Insights → click Get AI Recommendations → verify recommendations display

#### 21d: Phase 3 Tests — Outreach System

**Feature 5: Manual-Assist Outreach**
- Integration: `GET/POST /api/outreach/contacts` — create contact, list with search, filter by status
- Integration: `GET/PUT/DELETE /api/outreach/contacts/[id]` — read, update status pipeline, delete
- Integration: `GET/POST /api/outreach/messages` — create message, list by contact
- Integration: message auto-timestamps: sentAt set when status → SENT, responseReceivedAt set when status → REPLIED
- Integration: contact auto-status: contact status → RESPONDED when any message marked REPLIED
- Integration: `POST /api/outreach/generate-message` — AI generates message for each template type (mocked OpenAI)
- Integration: `GET /api/outreach/stats` — returns correct funnel counts and response rate
- Integration: `GET/POST /api/outreach/criteria` — CRUD for search criteria
- Unit: verify stats API response field names match dashboard expectations (`contactsByStatus`, not `contactStats`)
- e2e: create contact → generate AI message → copy to clipboard → mark as sent → mark as replied → verify contact status updates → verify stats

#### 21e: Phase 4 Tests — Multi-Platform Expansion & Insights

**Feature 6: LinkedIn & X Account Connection**
- Integration: `GET /api/auth/linkedin/connect` — generates correct OAuth URL with required scopes
- Integration: `GET /api/auth/linkedin/callback` — exchanges code, stores encrypted tokens, sets expiry
- Integration: `GET /api/auth/x/connect` — generates correct PKCE OAuth URL
- Integration: `GET /api/auth/x/callback` — exchanges code, stores access + refresh tokens
- Integration: `POST /api/auth/x/refresh` — refreshes expired token, rotates refresh token
- Unit: token encryption/decryption round-trip
- Unit: CSRF state parameter validation

**Feature 7: Multi-Platform Publishing**
- Integration: `POST /api/social-media-accounts/[id]/post` — LinkedIn text post (mocked LinkedIn API)
- Integration: `POST /api/social-media-accounts/[id]/post` — LinkedIn image post with upload
- Integration: `POST /api/social-media-accounts/[id]/post` — X tweet (mocked X API v2)
- Integration: `POST /api/social-media-accounts/[id]/post` — X tweet with media upload
- Integration: `POST /api/social-media-accounts/[id]/post` — X thread auto-split for >280 chars
- Integration: `POST /api/scheduler/run` — publishes LinkedIn and X posts, skips expired tokens
- Integration: `POST /api/content-posts/[id]/publish-all` — multi-account publishing
- Unit: character limit validation per platform (280 X, 3000 LinkedIn, 2200 Instagram)

**Feature 8: Combined Insights & Refinement**
- Integration: `GET/POST /api/insights/linkedin-insights` — fetch and store LinkedIn metrics (mocked)
- Integration: `GET/POST /api/insights/x-insights` — fetch and store X metrics (mocked)
- Integration: `GET /api/insights/combined-insights` — aggregates across platforms, filters by platform
- Integration: `POST /api/ai/refine-post` — caption refinement with tone and performance context (mocked OpenAI)
- Integration: `POST /api/ai/refine-post` — hashtag optimization mode
- Integration: `POST /api/ai/refine-post` — media suggestion mode
- Integration: `GET/POST /api/insights/ab-tests` — create A/B pair, retrieve with enriched insight data
- Integration: `GET /api/insights/lint-caption` — returns score and grade for caption
- Integration: `GET /api/insights/best-time` — returns optimal posting hour based on historical data
- Unit: `performance-analyzer.ts` — cross-platform stats aggregation, platform comparison
- e2e: navigate to Combined Insights → view cross-platform table → filter by platform → create A/B test → compare results

#### 21f: Phase 5 Tests — AI Content Generation

**Feature 9: Advanced AI Content Generation**
- Integration: `GET /api/user/settings` — returns brand voice fields
- Integration: `POST /api/user/settings` — saves brand voice (tone, audience, personality, key phrases, avoid phrases, examples)
- Integration: `POST /api/ai/generate-caption` — generates caption conforming to brand voice (mocked OpenAI and Gemini)
- Integration: `POST /api/ai/generate-images` — generates images with style preset and aspect ratio (mocked DALL-E 3 and Gemini)
- Unit: brand voice prompt injection logic in `openai-client.ts` and `gemini-client.ts`
- Unit: style preset → DALL-E 3 parameter mapping
- Unit: aspect ratio → image dimension mapping
- e2e: set brand voice in settings → generate caption → verify tone matches → generate image with style → verify parameters sent

**Features 10–14** (tests to be written when features are implemented):
- Feature 10: copy-to-draft endpoint creates draft with originalPostId linkage, accepts captionOverride
- Feature 11: Facebook OAuth flow, Bluesky session creation, token storage
- Feature 12: platform override storage/retrieval, Facebook and Bluesky publishing (mocked)
- Feature 13: draft-advisor structured response parsing, apply-action mechanics
- Feature 14: improve-post multi-version generation, save-all-as-drafts integration

#### 21g: Cross-Cutting Tests

**Authentication & Authorization**
- All API endpoints reject unauthenticated requests (401)
- All API endpoints enforce user isolation (user A cannot access user B's data)
- Token encryption is applied consistently across all platforms

**Scheduler Resilience**
- Scheduler handles mixed success/failure across multiple posts
- Scheduler skips posts with expired platform tokens and logs appropriately
- Scheduler handles concurrent execution gracefully (idempotency)

**Error Handling**
- API endpoints return proper HTTP status codes (400 for validation, 401 for auth, 404 for not found, 500 for server errors)
- AI endpoints handle malformed AI responses gracefully (fallback to plain text)
- External API failures (Instagram, LinkedIn, X) are caught and surfaced to the user

---

## Database Models

### Core Models (pre-existing)
- `User` — Supabase Auth users
- `SocialMediaAccount` — connected Instagram/Bluesky/X accounts
- `ContentPost` — posts with scheduling, carousel support, igMediaId tracking
- `UserSettings` — API keys, usage limits
- `Log` — API request/response logging
- `UrlMapping` — short URL mappings for media

### Phase 1 Models
- `PostInsight` — per-post metrics (impressions, reach, likes, comments, shares, saves, engagement)
- `AccountInsight` — per-account metrics (followers, following, media count, profile views, website clicks)

### Phase 2 Models
- `ContentIdea` — saved content ideas from discovery (source URL, caption, image, tags, status)
- `TrackedHashtag` — hashtags being tracked (hashtag, post count)
- `TrackedCompetitor` — competitor accounts being tracked (username, follower count, media count, bio)

### Phase 3 Models
- `Contact` — outreach contacts (igUsername, niche, location, followerCount, engagementRate, status)
- `OutreachMessage` — messages to contacts (messageBody, templateName, status, timestamps)
- `OutreachCriteria` — saved search criteria (searchTerms, locations, niches, follower range)

### Phase 4 Models (Planned)
- `PostInsight` — extend: add `platform String`, `clicks Int` (general clicks), `linkClicks Int?` (link-specific clicks), `profileVisits Int?`, `bookmarks Int?`, `platformPostId String?`
- `AccountInsight` — extend: add `platform String`, `followerGrowth Int?`
- `SocialMediaAccount` — extend: add `linkedinUserId String?`, `linkedinOrganizationId String?`, `xUserId String?`
- `ContentPost` — extend: add `targetPlatforms String[]`, `linkedinPostId String?`, `xPostId String?` (per-platform post IDs alongside existing `igMediaId`)
- `ABTest` — A/B test pair (postAId, postBId, notes, comparedAt)

### Phase 5 Models (Planned)
- `ContentPost` — extend: add `originalPostId String?` (self-referential FK for copy-to-draft lineage chain), `platformOverrides Json?` (per-platform caption/metadata overrides)
- `SocialMediaAccount` — extend: add `FACEBOOK` + `BLUESKY` to AccountType enum, `facebookPageId String?`, `facebookPageName String?`, `blueskyHandle String?`, `blueskyDid String?`

---

## API Endpoints

### Content Posts
- `POST/GET /api/content-posts` — create/list posts
- `PUT/DELETE /api/content-posts/[id]` — update/delete post
- `POST /api/social-media-accounts/[id]/post` — publish to Instagram (single, carousel, video)

### Insights
- `GET/POST /api/insights/post-insights` — stored/fresh post insights
- `GET/POST /api/insights/account-insights` — stored/fresh account insights
- `POST /api/insights/fetch-all` — batch fetch (cron)

### Discovery
- `GET /api/instagram/search` — search hashtags or accounts via Instagram API
- `GET/POST/DELETE /api/discovery/tracked-hashtags` — manage tracked hashtags
- `GET/POST/DELETE /api/discovery/tracked-competitors` — manage tracked competitors
- `POST /api/discovery/refresh-competitor` — refresh competitor data
- `GET/POST /api/content-ideas` — list/create content ideas
- `PUT/DELETE /api/content-ideas/[id]` — update/delete content idea

### AI
- `POST /api/ai/generate-caption` — generate caption
- `POST /api/ai/generate-images` — generate images
- `POST /api/ai/recommendations` — AI recommendations (general, caption_review, hashtag_suggestions)

### Outreach
- `GET/POST /api/outreach/contacts` — list/create contacts
- `GET/PUT/DELETE /api/outreach/contacts/[id]` — individual contact CRUD
- `GET/POST /api/outreach/messages` — list/create messages
- `POST /api/outreach/generate-message` — AI message generation
- `GET /api/outreach/stats` — funnel metrics
- `GET/POST /api/outreach/criteria` — search criteria CRUD

### Scheduler
- `POST /api/scheduler/run` — daily cron (publish scheduled posts, fetch insights)

### Phase 4 Endpoints
**Auth** ✅ Complete
- `GET /api/auth/linkedin/connect` — initiate LinkedIn OAuth
- `GET /api/auth/linkedin/callback` — LinkedIn token exchange + store
- `GET /api/auth/x/connect` — initiate X OAuth 2.0 PKCE
- `GET /api/auth/x/callback` — X token exchange + store
- `POST /api/auth/x/refresh` — rotate X access token

**Publishing** ✅ Complete (LinkedIn + X)
- `POST /api/social-media-accounts/[id]/post` — extended to route to LinkedIn and X publishers

**Insights (extended)** ✅ Complete
- `GET/POST /api/insights/linkedin-insights` — stored/fresh LinkedIn metrics
- `GET/POST /api/insights/x-insights` — stored/fresh X metrics

**AI Refinement** ✅ Complete
- `POST /api/ai/refine-post` — AI caption/tag/timing refinement with performance context

**A/B Testing** ✅ Complete
- `GET/POST /api/insights/ab-tests` — manage A/B test pairs
- `GET /api/insights/ab-tests/[id]` — comparison results for a pair

**Multi-Account Publishing** ✅ Complete
- `POST /api/content-posts/[id]/publish-all` — publish a single ContentPost to multiple platform accounts in one request; accepts `{ accountIds: string[] }`; returns per-account results with HTTP 207 (Multi-Status) when only some accounts succeed; stores platform post IDs (`igMediaId`, `linkedinPostId`, `xPostId`) on the ContentPost record

### Phase 5 Endpoints (Planned)
**Copy to Draft**
- `POST /api/content-posts/[id]/copy-to-draft` — duplicate a post as a new DRAFT, optionally with a caption override; records `originalPostId` for lineage tracking

**Auth — Facebook & Bluesky**
- `GET /api/auth/facebook/connect` — initiate Facebook Login OAuth
- `GET /api/auth/facebook/callback` — exchange token, fetch managed Pages, store
- `POST /api/auth/bluesky/connect` — create ATP session with handle + App Password, store tokens

**Publishing — Facebook & Bluesky**
- `POST /api/social-media-accounts/[id]/post` — extended with Facebook Graph API and Bluesky ATP publisher branches

**AI**
- `POST /api/ai/draft-advisor` — structured AI recommendations for a draft post (score, per-recommendation cards, revised caption)
- `POST /api/ai/improve-post` — generate N improved versions of a published post using its real performance metrics as context; returns structured version array ready to save as drafts

---

## Known Issues

- **Pre-existing build errors**: `/public` page fails prerendering due to missing `supabaseUrl`, and `inspire.ts` has an invalid import. These are not from the Phase 1–3 work.
- **Manual migrations**: Database migrations are created as SQL files manually since `prisma migrate dev` cannot connect to the database from the development environment. Run migrations manually or via `prisma migrate deploy` in production.
