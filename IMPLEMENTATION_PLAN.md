# Social Media Tool (InstaCreate) - Implementation Plan

**Last Updated**: April 2, 2026
**Status**: Phases 1–3 Implemented, Testing In Progress

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

## Phase 4: Future Enhancements (Planned)

### Feature 6: Advanced AI Content Generation
- Google Nano Banana integration for AI video generation (pending API details)
- Enhanced image generation options (style presets, aspect ratios)
- Brand voice customization for caption generation
- Image-to-video conversion

### Feature 7: Multi-Platform Support
- Bluesky posting integration
- X (Twitter) posting integration
- Platform-specific validation (character limits, media limits)
- Cross-platform scheduling and analytics

### Feature 8: Production Polish
- End-to-end testing
- Performance optimization (query optimization, caching)
- Enhanced error notifications
- Security audit
- Analytics dashboards with charts and trends

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

---

## Known Issues

- **Pre-existing build errors**: `/public` page fails prerendering due to missing `supabaseUrl`, and `inspire.ts` has an invalid import. These are not from the Phase 1–3 work.
- **Manual migrations**: Database migrations are created as SQL files manually since `prisma migrate dev` cannot connect to the database from the development environment. Run migrations manually or via `prisma migrate deploy` in production.
