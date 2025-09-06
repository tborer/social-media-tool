# InstaCreate — AI-Powered Social Media Content Manager

InstaCreate is a full-stack Next.js application for creating, organizing, and publishing social media content. It integrates AI caption/image generation, draft management, scheduling metadata, and posting to social accounts (starting with Instagram). It also includes robust logging and troubleshooting to help diagnose issues quickly.

This README is designed to help new contributors get up to speed fast: it explains the architecture, important files, how things work, and how to run the project locally.

## Tech Stack

- Next.js (Pages Router) + TypeScript
- Tailwind CSS + shadcn/ui components
- Prisma ORM with PostgreSQL (Supabase)
- Supabase (Auth, Database, Storage)
- OpenAI & Google Gemini for AI features
- Vercel-ready (vercel.json included)

## Quick Start

1) Prerequisites
- Node 18+
- pnpm or npm
- A Supabase project (for DB + auth + storage)
- Optional: OpenAI and/or Gemini API keys

2) Clone and install
```bash
# using pnpm (recommended if installed)
pnpm install

# or using npm
npm install
```

3) Configure environment variables
Create a .env.local file and provide the values (see Environment Variables below).

4) Run local dev server
```bash
pnpm dev
# or
npm run dev
```
Open http://localhost:3000

5) Database
```bash
# Generate Prisma Client
pnpm prisma generate
# Apply schema to your database
pnpm prisma migrate deploy
```

## Environment Variables

Add these to .env.local. The app reads values from process.env.

Required for Supabase and DB:
- NEXT_PUBLIC_SUPABASE_URL — Supabase project URL (Project Settings > API)
- NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anon public key (Project Settings > API)
- DATABASE_URL — PostgreSQL connection string (Project Settings > Database > Connection string)
- DIRECT_URL — Direct connection string for Prisma migrations (Project Settings > Database > Connection string, set "Direct" option)

AI (optional, but required if you want AI features):
- OPENAI_API_KEY — OpenAI API key (https://platform.openai.com/)
- GEMINI_API_KEY — Google AI Studio (Gemini) API key (https://aistudio.google.com/)

Instagram (optional, for official integrations):
- INSTAGRAM_APP_ID
- INSTAGRAM_APP_SECRET

Other:
- NEXT_PUBLIC_CO_DEV_ENV — Used for environment-specific toggles/logging

Notes:
- Obtain Supabase URLs/keys from your Supabase dashboard.
- DATABASE_URL and DIRECT_URL should both point to your Supabase Postgres database.
- Do not commit .env.local to version control.

## Project Structure

High-level directories:
- prisma/schema.prisma — Database schema for Prisma
- src/pages — Next.js Pages (UI and API routes)
- src/components — React components (feature and UI)
- src/contexts — React Context (Auth, etc.)
- src/lib — Library utilities (Prisma client, AI clients, logger)
- src/styles — Global styles (globals.css)
- src/util — Shared utilities and Supabase client helpers
- public — Static assets
- vercel.json — Vercel config

### Pages (UI)

- / — Landing page (src/pages/index.tsx)
- /login, /signup, /forgot-password, /reset-password, /magic-link-login — Auth flows
- /dashboard — Main app UI (protected)
- /settings — User settings (e.g., AI provider keys, usage limits)
- /troubleshooting, /error — Support and error handling views
- /auth/callback — OAuth or magic link callback handler

Dashboard tabs (src/pages/dashboard.tsx):
- Social Media Accounts: Connect and manage accounts (Instagram, Bluesky, X)
- Content Creation: Create posts, use AI for captions/images, upload images, and save drafts
- Instagram Insights: Search Instagram content, view results, and generate inspired content
- WordPress Blog: Placeholder for planned blog integration
- Logging: View request logs and details via the LogsViewer component

### API Routes (Next.js API)

AI
- POST /api/ai/generate-caption — Generate captions based on prompts/context
- POST /api/ai/generate-content — Generate integrated content (caption + suggested images)
- POST /api/ai/generate-images — Generate image suggestions (backed by AI provider)

Content Posts
- GET /api/content-posts — List posts for the current user
- POST /api/content-posts — Create a new post (draft or ready to publish)
  - Validates caption, optional imageUrl, contentType
  - Enforces length/safety constraints (e.g., long URLs rejected)
- GET/PUT/DELETE /api/content-posts/[id] — Fetch, update, or delete a specific post

Social Media Accounts (generic)
- GET /api/social-media-accounts — List user accounts
- POST /api/social-media-accounts — Add account (username, accessToken, accountType)
- PUT/DELETE /api/social-media-accounts/[id] — Update or remove account
- POST /api/social-media-accounts/[id]/images — Upload media for the account (if applicable)
- POST /api/social-media-accounts/[id]/post — Post a ContentPost to this account

Instagram-specific (optional; used by Insights)
- GET /api/instagram/search?query=... — Search Instagram content
- POST /api/instagram/inspire — Generate inspired content based on a selected post
- GET/PUT/DELETE /api/instagram-accounts/[id] — Instagram account management (legacy/specific)
- POST /api/instagram-accounts/[id]/images — Upload images (legacy path)
- POST /api/instagram-accounts/[id]/post — Publish to Instagram (legacy path)

Upload
- POST /api/upload — Upload images to Supabase Storage
  - Allowed types: image/jpeg, image/png, image/webp, image/gif, image/avif
  - Size limits: 0 < size ≤ 10 MB
  - Typical error codes:
    - 400 Bad Request: empty file, bad input
    - 405 Method Not Allowed: non-POST
    - 413 Payload Too Large: files over 10 MB
    - 415 Unsupported Media Type: type not allowed
    - 500 Internal Server Error: upstream/storage issues
  - Always cleans up temp files and returns a public URL on success

Logs
- GET /api/logs — Summary logs for the current user
- GET /api/logs/detailed — Detailed logs with filters
- GET /api/debug/auth — Debug your auth context/server environment
- GET/PUT /api/user/settings — Load or update user settings and AI quotas

### Database Model (Prisma)

Defined in prisma/schema.prisma. Key models (public schema only):

- User
  - id (UUID), email, createdAt
  - Relations: socialMediaAccounts, contentPosts, userSettings, logs, urlMappings

- SocialMediaAccount
  - id, username, accessToken, accountType (INSTAGRAM | BLUESKY | X)
  - userId (FK), createdAt, updatedAt
  - Unique per (userId, username, accountType)

- ContentPost
  - id, caption, imageUrl?, contentType (IMAGE | VIDEO | BLOG_POST)
  - status (DRAFT | SCHEDULED | PUBLISHED | FAILED)
  - scheduledFor?, createdAt, updatedAt
  - userId (FK), socialMediaAccountId?

- UserSettings
  - Per-user AI keys and usage quotas (openaiApiKey, geminiApiKey, limits, usage counts)

- Log
  - Request/response traces for debugging features; typed by LogType (CONTENT_POST, AI_GENERATION)

- UrlMapping
  - Legacy model used previously for short-URL fallback; kept for historical reasons but no longer active

Migrations and client:
```bash
pnpm prisma generate
pnpm prisma migrate deploy
```

### Authentication

Client-side:
- useAuth hook: import from '@/contexts/AuthContext'
- Protect pages/components with the ProtectedRoute component

Server-side (APIs):
- Supabase client: import { createClient } from '@/util/supabase/api'
- Do not use @supabase/auth-helpers-nextjs

Auth pages:
- login.tsx, signup.tsx, magic-link-login.tsx, forgot-password.tsx, reset-password.tsx
- AuthContext coordinates the session and exposes user + signOut

### Components

Feature components
- AIContentGenerator — Prompts AI providers to produce captions/images; integrates with Content Creation flow and Instagram Insights
- LogsViewer & DetailedLogsViewer — View logs and drill into individual request details
- ProtectedRoute — Guards private pages using useAuth
- Header, Logo, GoogleButton — Supporting UI pieces

UI components (shadcn/ui)
- Located in src/components/ui/*
- Import from "@/components/ui/{component}" (do not import from @radix-ui/* directly)
- Includes buttons, cards, dialogs, forms, inputs, tabs, toasts, etc.

Styling
- Tailwind + globals.css for theme tokens and light/dark modes
- Use the theme classes (e.g., text-primary, bg-background, text-muted-foreground) for consistent styling
- Avoid hard-coded colors in components; prefer theme variables

### Content Creation Flow

1) Create New Post (Dashboard > Content Creation)
- Set content type (Image, Video, Blog Post)
- Write caption
- Provide an image by URL or Upload
- Optionally schedule (date + time) and select a social account
- Save to Drafts or Create Post

2) AI Generate
- Opens AIContentGenerator to propose captions & images
- On accept, the generator fills the new post form

3) Image Uploads
- Client converts data URLs to Files as needed and posts to /api/upload
- API validates type/size, stores in Supabase Storage, returns a public URL
- The returned URL is stored with the draft/post

4) Drafts
- Posts with status=DRAFT are listed under Drafts
- You can Edit (re-open in the Create dialog), Post Now, Schedule (UI placeholder), or Delete

5) Posting to Social
- Use “Post Now” on a draft, select an account, publish via /api/social-media-accounts/[id]/post
- Status transitions to PUBLISHED on success, FAILED on errors

### Instagram Insights

- Search Instagram content via /api/instagram/search
- Explore results (likes, comments, hashtags)
- Use a selected post as inspiration (POST /api/instagram/inspire) to create similar content
- Generated content is piped into the Create Post dialog

### Logging and Troubleshooting

- Logs are captured for content, AI, and posting flows
- Visit Dashboard > Logging to inspect requests/responses
- API routes use src/lib/logger.ts
- For auth issues, /api/debug/auth provides diagnostic info

### Coding Conventions and Gotchas

- UI imports: import from "@/components/ui/*" (shadcn) — do not import from @radix-ui/*
- Prisma client: import prisma from "@/lib/prisma"
- Supabase server client: import { createClient } from "@/util/supabase/api"
- Auth (client): import { useAuth } from "@/contexts/AuthContext"
- Only use public schema in Prisma (DB user has no access to other schemas)
- When adding new non-null fields to User in Prisma, verify AuthContext.tsx createUser initializes them
- Keep image URLs under 2000 chars; large base64 URLs must be uploaded via /api/upload first
- /api/upload accepts only images (jpeg, png, webp, gif, avif) up to 10MB

### Scripts

Common scripts (run with pnpm or npm):
- dev — start local dev server
- build — build for production
- start — run production server
- lint — lint the codebase
- prisma:generate — generate Prisma client
- prisma:migrate — run migrations

Check package.json for the complete list.

### Deployment

- Vercel recommended (vercel.json included)
- Set environment variables on the hosting platform
- Ensure DATABASE_URL and DIRECT_URL are production database strings
- Execute migrations on deploy or via CI step (prisma migrate deploy)

### Roadmap

- WordPress publishing (placeholder UI exists)
- Scheduling + background queue for social posting
- Richer analytics & insights
- Multi-provider social posting refinements
- Team/workspace support

### License

This repository is provided as a Codev template-derived application. Review your organization’s licensing and compliance needs before commercial use.

### Contributors Guide

- Create a feature branch and open a PR
- Keep components small and cohesive
- Prefer theme tokens to hard-coded styles
- Add logs where helpful and redact sensitive info
- Update this README if you introduce new modules or flows

If you have questions, open an issue or leave notes in the PR for review.