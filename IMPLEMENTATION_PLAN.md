# Social Media Tool (InstaCreate) - Implementation Plan

**Last Updated**: April 8, 2026
**Status**: Phases 1–4 Implemented (Features 6–8 Complete), Phase 5 Feature 9 Complete

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

## Phase 4: Multi-Platform Expansion & Combined Insights 🚧 IN PROGRESS

The goal of Phase 4 is to extend posting to LinkedIn and X, then consolidate performance data from all connected platforms into a unified insights experience that actively helps users understand what is working, what is not, and how to improve it. Every feature should serve the north-star goal of **increasing engagement through data-driven refinement**.

---

### Feature 6: LinkedIn & X Account Connection ✅ COMPLETED

**What to build:**

**Database / schema changes**
- Add `LINKEDIN` to the `AccountType` enum (X already exists; Bluesky is deferred)
- Add `linkedinUserId`, `linkedinOrganizationId` (optional — for company page posting) columns to `SocialMediaAccount`
- Add `xUserId` column to `SocialMediaAccount` for the Twitter/X numeric user ID
- Add `platformPostId` to `ContentPost` (nullable String) — generic field alongside existing `igMediaId` to store the native post ID returned by each platform after publishing

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
- After publishing, store `platformPostId` per platform (may require a `PostPublication` join table if publishing to multiple platforms in one go)

**Scheduler updates**
- `scheduler/run.ts` — extend to publish scheduled posts to LinkedIn and X in addition to Instagram
- Respect per-platform token validity before attempting publish; skip + log if token expired

**Key files to create / modify:**
- `src/pages/api/social-media-accounts/[id]/post.ts` — LinkedIn + X publish branches
- `src/lib/linkedin-client.ts` — `publishPost(account, postData)` implementation
- `src/lib/x-client.ts` — `publishTweet(account, postData)`, `uploadMedia(account, buffer)`, `publishThread(account, tweets)` implementation
- `src/pages/dashboard.tsx` — multi-platform post creation UI
- `src/pages/api/scheduler/run.ts` — multi-platform scheduler
- `prisma/schema.prisma` — `targetPlatforms` field, `PostPublication` model (optional)

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

Extend account management to support Facebook Pages and Bluesky (AT Protocol) so they can be used for publishing in Feature 11.

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

## Phase 6: Future Enhancements (Planned)

### Feature 15: Production Polish
- End-to-end testing suite
- Performance optimization (query optimization, pagination, caching layer)
- Enhanced error notifications (email/push alerts for failed scheduled posts)
- Security audit
- Trend charts and sparklines throughout the insights UI

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
- `PostInsight` — extend: add `platform String`, `clicks Int?`, `profileVisits Int?`, `linkClicks Int?`, `platformPostId String?`
- `AccountInsight` — extend: add `platform String`, `followerGrowth Int?`
- `SocialMediaAccount` — extend: add `linkedinUserId String?`, `linkedinOrganizationId String?`, `xUserId String?`, `platformPostId String?`
- `ContentPost` — extend: add `targetPlatforms String[]`, `platformPostId String?`
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

**AI Refinement** (Planned)
- `POST /api/ai/refine-post` — AI caption/tag/timing refinement with performance context

**A/B Testing** (Planned)
- `GET/POST /api/insights/ab-tests` — manage A/B test pairs
- `GET /api/insights/ab-tests/[id]` — comparison results for a pair

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
