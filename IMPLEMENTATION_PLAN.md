# Social Media Tool - Implementation Plan

**Date**: November 12, 2025
**Status**: Planning Phase
**Branch**: `claude/fix-draft-save-errors-011CUspX8xgtpWbPfH5r5ApG`

---

## Table of Contents
1. [Current State Analysis](#current-state-analysis)
2. [Critical Gaps](#critical-gaps)
3. [Implementation Phases](#implementation-phases)
4. [Priority Roadmap](#priority-roadmap)
5. [Technical Details](#technical-details)

---

## Current State Analysis

### ✅ What's Already Working

#### Instagram Integration
- **Content Creation**: Full UI for creating posts with captions and images
- **Image Posting**: Functional Instagram Graph API v22.0 integration
  - Two-step process: create media container → publish
  - Single image posts supported
  - Status tracking: DRAFT → PUBLISHED/FAILED
- **Account Management**: Add/edit/delete Instagram accounts
- **Error Handling**: Comprehensive logging and error tracking

#### Content Management
- **Draft System**: Save, edit, and manage draft posts
- **Image Upload**: Supabase Storage integration with public URLs
- **Post Status Tracking**: DRAFT, SCHEDULED, PUBLISHED, FAILED

#### AI Content Generation
- **Caption Generation**:
  - Google Gemini (`gemini-1.5-pro`)
  - OpenAI GPT-4
  - Instagram-optimized with hashtags
- **Image Generation**:
  - Gemini (`gemini-2.0-flash-exp-image-generation`)
  - OpenAI DALL-E 3
  - Support for 1-25 images per request (Gemini)
  - Support for 1-10 images per request (OpenAI)
- **Content Analysis**: AI-powered message generation before captions
- **Image-based Generation**: Generate content based on existing images
- **Usage Tracking**: Monthly quotas and limits per user
- **Provider Flexibility**: Users can choose between Gemini and OpenAI

#### User Management
- **Authentication**: Supabase Auth
- **API Key Management**: User-specific AI API keys
- **Settings**: Configurable usage limits and preferences

---

### ⚠️ Partial Implementation / Needs Work

#### Scheduling System
- **Status**: Database and UI ready, but NO automation
- **What Works**:
  - Database schema supports `scheduledFor` field
  - UI has date/time picker with recent UX improvements
  - Posts can be created with SCHEDULED status
- **What's Missing**:
  - No background scheduler daemon
  - No cron job to check for due posts
  - Posts never auto-publish
  - No job locking or idempotency

#### Authentication
- **Current**: Manual access token paste
- **Issues**:
  - Poor UX
  - Security risk (tokens stored in plaintext)
  - No token refresh mechanism
  - No automatic expiration handling

#### Video Support
- **Database**: Schema includes VIDEO content type
- **UI**: Basic support in forms
- **Missing**:
  - No video posting logic
  - No video generation
  - No video upload handling

---

### ❌ Critical Gaps

1. **Scheduling Automation** (CRITICAL)
   - No background worker to publish scheduled posts
   - Scheduled posts sit in database forever
   - No retry logic for failed posts
   - No rate limiting per account

2. **Video Generation** (HIGH)
   - No AI video generation capability
   - Awaiting Google Nano Banana integration details

3. **Instagram OAuth** (HIGH)
   - No proper OAuth flow
   - Manual token management
   - No token encryption
   - Security vulnerability

4. **Video Posting** (MEDIUM)
   - Can't publish videos to Instagram
   - Missing Instagram Video API integration

5. **Multi-Image Posts** (MEDIUM)
   - No carousel/album support
   - Limited to single images

6. **Platform Support** (LOW)
   - Bluesky: Stub implementation only
   - X (Twitter): Stub implementation only

---

## Critical Gaps

### 1. Scheduling Automation (BLOCKING)
**Impact**: Scheduled posts never publish automatically
**Current State**: Posts with `scheduledFor` timestamps remain SCHEDULED forever
**Required Components**:
- Background job runner
- Cron service (Vercel Cron recommended)
- Job locking mechanism
- Retry logic with exponential backoff
- Rate limiting per social media account
- Error notifications

### 2. Video Generation
**Impact**: Can't create video content with AI
**Planned Solution**: Google Nano Banana integration (details pending)

### 3. Security Issues
**Impact**: Access tokens stored in plaintext
**Required**:
- Token encryption at rest
- OAuth 2.0 flow
- Token refresh mechanism
- Secure token storage

---

## Implementation Phases

### Phase 1: Core Functionality (2-3 weeks) - CRITICAL PRIORITY

#### 1.1 Scheduling Automation (1 week) - HIGHEST PRIORITY
**Objective**: Make scheduled posts actually publish automatically

**Tasks**:
- [ ] Create `/api/scheduler/run` endpoint
  - Query posts where `status = 'SCHEDULED'` AND `scheduledFor <= now()`
  - Implement job locking to prevent duplicate execution
  - Call existing post endpoint for each due post
- [ ] Configure Vercel Cron job
  - Create `vercel.json` with cron configuration
  - Run every 1 minute: `0 * * * *`
- [ ] Implement retry logic
  - Exponential backoff for failed posts
  - Max retry attempts (e.g., 3 attempts)
  - Update status to FAILED after max retries
- [ ] Add rate limiting
  - Respect Instagram API limits (25 posts/day per account)
  - Queue posts if limits reached
- [ ] Update UI
  - Add "Scheduled" tab in dashboard
  - Show scheduled posts with countdown
  - Allow editing/canceling scheduled posts
- [ ] Add error notifications
  - Email/toast notifications for failed scheduled posts
  - Detailed error messages in logs

**Files to Create**:
- `src/pages/api/scheduler/run.ts` - Main scheduler endpoint
- `vercel.json` - Cron configuration
- `src/lib/job-lock.ts` - Job locking utility

**Files to Modify**:
- `src/pages/dashboard.tsx` - Add Scheduled tab
- `prisma/schema.prisma` - Add retry tracking fields (optional)

**Testing**:
- Create scheduled post for 1 minute in future
- Verify cron triggers scheduler
- Verify post publishes automatically
- Test retry logic with intentional failures
- Test rate limiting with multiple posts

**Estimated Time**: 1 week

---

#### 1.2 Instagram OAuth Flow (1 week) - HIGH PRIORITY
**Objective**: Replace manual token paste with secure OAuth

**Tasks**:
- [ ] Implement OAuth 2.0 flow
  - Register Instagram App (if not already done)
  - Get App ID and App Secret
  - Configure redirect URI
- [ ] Create OAuth endpoints
  - `/api/auth/instagram/connect` - Initiate OAuth
  - `/api/auth/instagram/callback` - Handle OAuth callback
  - Exchange code for access token
  - Store refresh token
- [ ] Implement token encryption
  - Create encryption utility using AES-256
  - Encrypt tokens before storing in database
  - Decrypt tokens when needed for API calls
- [ ] Add token refresh mechanism
  - Check token expiration before API calls
  - Automatically refresh expired tokens
  - Update stored tokens
- [ ] Update database schema
  - Add `refreshToken` field
  - Add `tokenExpiresAt` field
  - Add `encryptedToken` field (rename from `accessToken`)
- [ ] Update UI
  - Add "Connect with Instagram" button
  - Show connection status
  - Allow reconnection if token expires
  - Remove manual token input

**Files to Create**:
- `src/pages/api/auth/instagram/connect.ts`
- `src/pages/api/auth/instagram/callback.ts`
- `src/lib/encryption.ts`
- `src/lib/instagram-oauth.ts`

**Files to Modify**:
- `prisma/schema.prisma` - Add token fields
- `src/pages/dashboard.tsx` - OAuth button
- `src/pages/api/social-media-accounts/[id]/post.ts` - Token decryption

**Environment Variables**:
```env
INSTAGRAM_APP_ID=your_app_id
INSTAGRAM_APP_SECRET=your_app_secret
INSTAGRAM_REDIRECT_URI=https://your-domain.com/api/auth/instagram/callback
ENCRYPTION_KEY=your_32_byte_key
```

**Testing**:
- Test OAuth flow end-to-end
- Verify token encryption/decryption
- Test token refresh
- Test posting with OAuth token

**Estimated Time**: 1 week

---

#### 1.3 Video Posting to Instagram (3-4 days) - MEDIUM-HIGH PRIORITY
**Objective**: Support video content posting to Instagram

**Tasks**:
- [x] Research Instagram Video API requirements
  - Format: MP4, MOV
  - Max size: 100MB
  - Duration: 3-60 seconds (Reels), up to 60 minutes (feed)
  - Aspect ratios: 9:16, 1:1, 4:5
- [x] Implement video upload
  - Add video file validation
  - Upload to Supabase Storage
  - Generate public URL
- [x] Add Instagram Video API integration
  - Use Instagram Graph API video endpoints
  - Handle video processing wait time with polling
  - Support for Reels vs Feed videos
- [x] Update database schema
  - Add videoType field (FEED/REELS)
  - Create VideoType enum
- [x] Update posting logic
  - Detect video content type
  - Use appropriate media_type (VIDEO/REELS)
  - Poll status_code until FINISHED
  - Handle ERROR status gracefully

**Features Implemented**:
- Video validation utility (duration, size, format, aspect ratio)
- Video preview component with playback controls
- Instagram Video API integration with:
  - Container creation with video_url
  - Automatic detection of FEED vs REELS based on videoType
  - Status polling (IN_PROGRESS → FINISHED)
  - 1-minute timeout with 2-second intervals
  - Error handling for failed processing
- Support for both Feed videos (up to 60 min) and Reels (3-90s)
- Database schema updated with videoType field

**Files Created/Modified**:
- `src/lib/video-validator.ts` - Video validation utility (existing)
- `src/components/VideoPreview.tsx` - Video player component (existing)
- `src/pages/api/social-media-accounts/[id]/post.ts` - Added video posting logic
- `src/pages/api/upload.ts` - Video upload support (existing)
- `prisma/schema.prisma` - Added videoType field and VideoType enum

**API Integration**:
- Instagram Graph API: `POST /{ig-user-id}/media` with `media_type=VIDEO` or `media_type=REELS`
- Instagram Graph API: `GET /{container-id}?fields=status_code` for status polling
- Instagram Graph API: `POST /{ig-user-id}/media_publish` after processing complete

**Testing Notes**:
- User will need to test with actual Instagram API:
  - Upload and post short video (Reels: 3-90s, 9:16)
  - Upload and post feed video (up to 60 min, various ratios)
  - Test different formats (MP4, MOV)
  - Verify video appears on Instagram
  - Test processing timeout handling

**Estimated Time**: 3-4 days (COMPLETED)

---

#### 1.4 Calendar View for Content Organization (2-3 days) - HIGH PRIORITY
**Objective**: Visual calendar interface for organizing and managing scheduled posts

**Tasks**:
- [x] Create CalendarView component
  - Monthly calendar display with react-day-picker
  - Visual indicators for dates with posts
  - Click on date to view all posts for that day
  - Status-based color coding (draft/scheduled/published/failed)
- [x] Integrate with dashboard
  - Add "Calendar View" tab in dashboard
  - Pass posts data to CalendarView component
  - Wire up edit, delete, and view actions
- [x] Add upcoming posts preview
  - Show next 7 days of scheduled posts
  - Sort by scheduled time
  - Quick navigation to specific dates
- [x] Implement day details dialog
  - Show all posts for selected date
  - Display post previews (image/video thumbnails)
  - Quick access to edit/delete/view actions
  - Show scheduling time and account info
- [x] Add visual status legend
  - Color-coded badges for each status
  - Clear visual hierarchy
- [x] Update API to include account info
  - Include socialMediaAccount relation
  - Return accountType for display

**Features Implemented**:
- Monthly calendar view with date selection
- Visual indicators (dots) on dates with scheduled posts
- Status legend with color-coded badges
- Upcoming posts preview (next 7 days)
- Day details dialog showing all posts for a date
- Post previews with thumbnails
- Quick actions: view, edit, delete
- Integration with existing dashboard functionality
- Support for all content types (IMAGE, VIDEO, BLOG_POST)
- Display video type (FEED/REELS) when applicable
- Show associated social media account

**Files Created**:
- `src/components/CalendarView.tsx` - Calendar view component

**Files Modified**:
- `src/pages/dashboard.tsx` - Added Calendar View tab
- `src/pages/api/content-posts/index.ts` - Include accountType in response
- `prisma/schema.prisma` - Added videoType field to ContentPost model

**Benefits**:
- Easy visualization of content schedule
- Quick identification of content gaps
- Efficient management of multiple scheduled posts
- Better planning and organization
- Visual feedback on post status
- Improved user experience

**Estimated Time**: 2-3 days (COMPLETED)

---

### Phase 2: AI Video & Image Generation with Google Nano Banana (2-3 weeks)

#### 2.1 Google Nano Banana Integration (2-3 weeks) - MEDIUM PRIORITY
**Objective**: Unified AI provider for image and video generation

**Tasks** (pending connection details):
- [ ] Review Google Nano Banana API documentation
  - Authentication method
  - Image generation endpoints
  - Video generation endpoints
  - Rate limits and pricing
- [ ] Set up authentication
  - API key management
  - Request signing (if required)
- [ ] Create client library
  - `src/lib/nano-banana-client.ts`
  - Image generation methods
  - Video generation methods
  - Error handling
- [ ] Implement image generation endpoint
  - Create `/api/ai/nano-banana/generate-images`
  - Support for multiple images
  - Style/aesthetic options
  - Aspect ratio selection
- [ ] Implement video generation endpoint
  - Create `/api/ai/nano-banana/generate-videos`
  - Handle async generation (likely long-running)
  - Polling or webhook mechanism
  - Video duration options
- [ ] Update AIContentGenerator component
  - Add "Google Nano Banana" as provider option
  - Video generation UI
  - Video preview
- [ ] Handle generated media storage
  - Upload images to Supabase Storage
  - Upload videos to Supabase Storage
  - Replace data URLs with persistent URLs
- [ ] Add usage tracking
  - Track image generation count
  - Track video generation count
  - Implement monthly limits
  - Add to UserSettings model

**Files to Create**:
- `src/lib/nano-banana-client.ts`
- `src/pages/api/ai/nano-banana/generate-images.ts`
- `src/pages/api/ai/nano-banana/generate-videos.ts`

**Files to Modify**:
- `src/components/AIContentGenerator.tsx`
- `prisma/schema.prisma` - Add usage tracking
- `src/pages/dashboard.tsx` - Video content type support

**Environment Variables** (TBD):
```env
NANO_BANANA_API_KEY=your_api_key
NANO_BANANA_BASE_URL=https://api.nano-banana.google.com
```

**Considerations**:
- Video generation likely async (several minutes)
- May need webhook endpoint or polling mechanism
- Storage costs for generated videos (larger files)
- Usage quotas (video generation expensive)

**Testing**:
- Generate test images
- Generate test videos
- Verify media uploads to storage
- Test usage tracking
- Test integration with post creation

**Estimated Time**: 2-3 weeks (depends on API complexity)

---

### Phase 3: Enhanced Features (2-3 weeks) - OPTIONAL

#### 3.1 Multi-Image Carousel Posts (1 week)
**Objective**: Support Instagram carousel posts (2-10 images)

**Tasks**:
- [ ] Update UI for multiple image selection
  - Drag-and-drop reordering
  - Add/remove images
  - Preview carousel
- [ ] Implement Instagram Carousel API
  - Create multiple media containers
  - Publish as carousel
  - Handle individual image failures
- [ ] Update database schema
  - Support array of image URLs
  - Or create separate `ContentPostImage` model
- [ ] Update post preview
  - Show carousel indicator
  - Allow swiping through images

**Files to Modify**:
- `src/pages/api/social-media-accounts/[id]/post.ts`
- `src/pages/dashboard.tsx`
- `prisma/schema.prisma`

**Instagram API**:
- Create containers for each image
- Use `media_type=CAROUSEL`
- Pass `children` array of media IDs

**Estimated Time**: 1 week

---

#### 3.2 Enhanced AI Content Generation (1-2 weeks)
**Objective**: More control and options for AI generation

**Tasks**:
- [ ] Add generation options
  - Style/aesthetic presets (e.g., "Professional", "Artistic", "Photorealistic")
  - Aspect ratio selection (1:1, 4:5, 9:16)
  - Quality/resolution options
  - Color palette preferences
- [ ] Implement image-to-video generation
  - Convert static images to short videos
  - Add motion effects
  - Add transitions
- [ ] Add video editing capabilities
  - Trim video duration
  - Crop/resize video
  - Add text overlays
  - Add music/audio
- [ ] Enhance caption generation
  - Brand voice customization
  - Tone selection (professional, casual, funny)
  - Call-to-action suggestions
- [ ] Add hashtag research
  - Trending hashtags
  - Niche-specific hashtags
  - Hashtag performance predictions
- [ ] Implement content scheduling suggestions
  - Best times to post
  - Optimal posting frequency
  - Audience activity patterns

**Files to Create**:
- `src/lib/hashtag-research.ts`
- `src/lib/video-editor.ts`
- `src/components/GenerationOptions.tsx`

**Files to Modify**:
- `src/components/AIContentGenerator.tsx`
- `src/pages/api/ai/*` endpoints

**Estimated Time**: 1-2 weeks

---

#### 3.3 Bluesky and X (Twitter) Integration (1 week)
**Objective**: Support multi-platform posting

**Tasks**:
- [ ] Implement Bluesky posting
  - Bluesky API integration
  - OAuth flow
  - Image posting
  - Link previews
- [ ] Implement X (Twitter) posting
  - X API v2 integration
  - OAuth 2.0 flow
  - Image posting (up to 4 images)
  - Video posting
- [ ] Update UI
  - Show platform icons
  - Multi-platform selection
  - Platform-specific preview
- [ ] Add platform-specific validation
  - Character limits (Bluesky: 300, X: 280)
  - Image limits
  - Video limits

**Files to Modify**:
- `src/pages/api/social-media-accounts/[id]/post.ts`
- `src/lib/bluesky-client.ts`
- `src/lib/twitter-client.ts`
- `src/pages/dashboard.tsx`

**Estimated Time**: 1 week

---

### Phase 4: Polish & Production Readiness (1 week)

#### 4.1 Testing and Bug Fixes
**Tasks**:
- [ ] End-to-end testing
  - Test all posting flows
  - Test all AI generation flows
  - Test scheduling automation
  - Test error scenarios
- [ ] Performance optimization
  - Database query optimization
  - Image optimization
  - API response caching
- [ ] Error handling improvements
  - Better error messages
  - Graceful degradation
  - Retry mechanisms
- [ ] Security audit
  - Token encryption verification
  - API authentication review
  - Input validation
  - SQL injection prevention

**Estimated Time**: 3-4 days

---

#### 4.2 Analytics and Insights
**Tasks**:
- [ ] Track post performance
  - Likes, comments, shares
  - Reach and impressions
  - Engagement rate
- [ ] Show engagement metrics in dashboard
  - Post performance charts
  - Best performing content
  - Audience growth
- [ ] Generate content recommendations
  - Suggest optimal posting times
  - Recommend content types
  - Hashtag suggestions based on performance

**Files to Create**:
- `src/pages/api/analytics/posts.ts`
- `src/components/Analytics.tsx`
- `src/lib/instagram-insights.ts`

**Estimated Time**: 3-4 days

---

## Priority Roadmap

```
Week 1-2:   ✅ CRITICAL - Scheduling Automation (COMPLETED)
            └─ /api/scheduler/run + Vercel Cron
            └─ Job locking, retry logic, rate limiting
            └─ Scheduled posts tab in dashboard

Week 2-3:   ✅ HIGH - Instagram OAuth + Token Encryption (COMPLETED)
            └─ OAuth 2.0 flow
            └─ Token encryption at rest
            └─ Automatic token refresh

Week 3-4:   ✅ MEDIUM-HIGH - Video Posting to Instagram (COMPLETED)
            └─ Instagram Video API integration
            └─ Video upload to Supabase
            └─ Video preview in UI
            └─ Support for Reels and Feed videos

Week 4:     ✅ HIGH - Calendar View for Content Organization (COMPLETED)
            └─ Visual calendar interface
            └─ Upcoming posts preview
            └─ Day details dialog
            └─ Status-based color coding

Week 5-6:   🔍 RESEARCH - Google Nano Banana Integration
            └─ Review API documentation
            └─ Set up authentication
            └─ Test image/video generation

Week 6-8:   🤖 MEDIUM - AI Video/Image Generation
            └─ Implement Nano Banana client
            └─ Image generation endpoint
            └─ Video generation endpoint
            └─ Handle async generation

Week 8-10:  🎨 OPTIONAL - Enhanced Features
            └─ Multi-image carousels
            └─ Advanced AI options
            └─ Bluesky & X integration

Week 10-11: ✨ POLISH - Production Readiness
            └─ Testing & bug fixes
            └─ Performance optimization
            └─ Analytics & insights
```

---

## Technical Details

### Current Architecture

#### Tech Stack
- **Frontend**: Next.js 14, React 18, TypeScript
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Storage**: Supabase Storage
- **Authentication**: Supabase Auth
- **AI Services**:
  - Google Gemini (text + experimental image generation)
  - OpenAI (GPT-4 + DALL-E 3)
  - Google Nano Banana (planned)

#### Key Files
```
src/
├── pages/
│   ├── api/
│   │   ├── ai/
│   │   │   ├── generate-caption.ts
│   │   │   ├── generate-images.ts
│   │   │   └── generate-content.ts
│   │   ├── content-posts/
│   │   │   ├── index.ts (create/list posts)
│   │   │   └── [id].ts (update/delete posts)
│   │   ├── social-media-accounts/
│   │   │   ├── index.ts (list accounts)
│   │   │   └── [id]/post.ts (publish to Instagram)
│   │   ├── instagram/
│   │   │   ├── search.ts
│   │   │   └── inspire.ts
│   │   ├── upload.ts (image upload)
│   │   └── logs/ (logging endpoints)
│   └── dashboard.tsx (main UI)
├── components/
│   ├── AIContentGenerator.tsx
│   └── LogsViewer.tsx
├── lib/
│   ├── gemini-client.ts
│   ├── openai-client.ts
│   └── supabase.ts
└── contexts/
    └── AuthContext.tsx

prisma/
└── schema.prisma
```

#### Database Schema (Key Models)
```prisma
model User {
  id                String              @id @default(uuid()) @db.Uuid
  email             String              @unique
  createdAt         DateTime            @default(now())
  posts             ContentPost[]
  accounts          SocialMediaAccount[]
  settings          UserSettings?
  logs              Log[]
}

model SocialMediaAccount {
  id           String       @id @default(uuid())
  username     String
  accessToken  String       // TODO: Encrypt
  accountType  AccountType  @default(INSTAGRAM)
  userId       String       @db.Uuid
  user         User         @relation(fields: [userId], references: [id])
  posts        ContentPost[]
}

model ContentPost {
  id                   String              @id @default(uuid())
  caption              String
  imageUrl             String?
  contentType          ContentType         @default(IMAGE)
  status               PostStatus          @default(DRAFT)
  scheduledFor         DateTime?           // Scheduled publish time
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt
  userId               String              @db.Uuid
  user                 User                @relation(fields: [userId], references: [id])
  socialMediaAccountId String?
  socialMediaAccount   SocialMediaAccount? @relation(fields: [socialMediaAccountId], references: [id])
}

model UserSettings {
  id                  String   @id @default(uuid())
  openaiApiKey        String?
  geminiApiKey        String?
  openaiMonthlyLimit  Int      @default(100)
  geminiMonthlyLimit  Int      @default(100)
  openaiUsageCount    Int      @default(0)
  geminiUsageCount    Int      @default(0)
  usageResetDate      DateTime @default(now())
  userId              String   @unique @db.Uuid
  user                User     @relation(fields: [userId], references: [id])
}

enum PostStatus {
  DRAFT
  SCHEDULED
  PUBLISHED
  FAILED
}

enum ContentType {
  IMAGE
  VIDEO
  BLOG_POST
}

enum AccountType {
  INSTAGRAM
  BLUESKY
  X
}
```

---

### API Endpoints

#### Content Posts
- `POST /api/content-posts` - Create post (draft or scheduled)
- `GET /api/content-posts` - List user's posts
- `PUT /api/content-posts/[id]` - Update post
- `DELETE /api/content-posts/[id]` - Delete post

#### Social Media Accounts
- `POST /api/social-media-accounts` - Add account
- `GET /api/social-media-accounts` - List accounts
- `PUT /api/social-media-accounts/[id]` - Update account
- `DELETE /api/social-media-accounts/[id]` - Delete account
- `POST /api/social-media-accounts/[id]/post` - Publish post to account

#### AI Generation
- `POST /api/ai/generate-caption` - Generate caption from prompt
- `POST /api/ai/generate-images` - Generate images from prompt
- `POST /api/ai/generate-content` - Generate caption + image
- `POST /api/instagram/inspire` - Generate content from inspiration

#### Media Upload
- `POST /api/upload` - Upload image/video to Supabase Storage

#### Scheduler (TO BE CREATED)
- `POST /api/scheduler/run` - Run scheduled post checker (cron)

---

### Environment Variables Required

```env
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Instagram (OAuth - to be added)
INSTAGRAM_APP_ID=xxx
INSTAGRAM_APP_SECRET=xxx
INSTAGRAM_REDIRECT_URI=https://your-domain.com/api/auth/instagram/callback

# AI Services
GEMINI_API_KEY=xxx
OPENAI_API_KEY=xxx

# Google Nano Banana (to be added)
NANO_BANANA_API_KEY=xxx
NANO_BANANA_BASE_URL=xxx

# Encryption (to be added)
ENCRYPTION_KEY=your_32_byte_encryption_key

# App
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

### Deployment Considerations

#### Vercel Configuration
Create `vercel.json` in project root:
```json
{
  "crons": [{
    "path": "/api/scheduler/run",
    "schedule": "* * * * *"
  }]
}
```

#### Environment Variables
Set all required environment variables in Vercel dashboard

#### Database Migrations
Run Prisma migrations on deployment:
```bash
npx prisma migrate deploy
```

---

## Next Steps

### Immediate Actions
1. **Decision**: Which phase to start implementing?
2. **Scheduling**: Highest priority, blocks scheduled posts
3. **Google Nano Banana**: Awaiting connection details from user
4. **Branch Strategy**: Create feature branches for each phase

### Questions for User
1. Do you want to start with Phase 1.1 (Scheduling Automation)?
2. When will Google Nano Banana connection details be available?
3. Any specific Instagram features to prioritize (Reels vs Feed posts)?
4. Target timeline for production deployment?

---

## Resources

### Documentation Links
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api/)
- [Instagram Publishing](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Prisma](https://www.prisma.io/docs/)

### Instagram API Limits
- 25 posts per day per account
- Rate limit: 200 API calls per hour
- Image: Max 8MB, 1:1 to 4:5 aspect ratio
- Video: Max 100MB, 3-60s (Reels), up to 60min (Feed)

---

**Last Updated**: November 12, 2025
**Contributors**: Development Team
**Status**: Planning Complete - Ready for Implementation
