# Deployment Guide - Scheduling Automation

This guide covers deploying the scheduling automation system for the social media tool.

## Prerequisites

- Vercel account (for cron jobs)
- PostgreSQL database (Supabase or similar)
- Node.js 18+ and pnpm

## 1. Database Migration

Before deploying, ensure the database schema is updated with retry tracking fields:

```bash
# Apply the migration
npx prisma migrate deploy

# Or if using Prisma Studio
npx prisma db push
```

The migration adds the following fields to `ContentPost`:
- `retryCount` (Int): Number of retry attempts
- `lastRetryAt` (DateTime): Timestamp of last retry
- `errorMessage` (String): Error message from last failed attempt

## 2. Environment Variables

Set the following environment variables in your Vercel dashboard or deployment environment:

### Required for Scheduling
```env
CRON_SECRET=your_random_secret_key_here
```

Generate a secure random key:
```bash
openssl rand -hex 32
```

### Database
```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
```

### Supabase
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### AI Services (Optional)
```env
GEMINI_API_KEY=xxx
OPENAI_API_KEY=xxx
```

## 3. Vercel Deployment

### Configure Cron Jobs

The `vercel.json` file is already configured with a cron job that runs every minute:

```json
{
  "crons": [{
    "path": "/api/scheduler/run",
    "schedule": "* * * * *"
  }]
}
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Set Environment Variables

In the Vercel dashboard:
1. Go to Project Settings → Environment Variables
2. Add `CRON_SECRET` with the generated secret
3. Add all other required environment variables
4. Redeploy if needed

## 4. Verify Deployment

### Test the Scheduler Endpoint

```bash
curl -X POST https://your-domain.com/api/scheduler/run \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "success": true,
  "message": "Scheduled posts processed",
  "results": {
    "processed": 0,
    "published": 0,
    "failed": 0,
    "skipped": 0,
    "errors": []
  }
}
```

### Check Vercel Cron Logs

1. Go to Vercel Dashboard → Your Project
2. Navigate to the "Logs" tab
3. Filter by "Cron" to see scheduler executions
4. Verify the scheduler runs every minute

### Create a Test Scheduled Post

1. Log into the dashboard
2. Create a new post with a scheduled time 2-3 minutes in the future
3. Navigate to the "Scheduled" tab to see the countdown
4. Wait for the scheduled time and verify the post publishes automatically

## 5. Monitoring

### Check Scheduler Logs

The scheduler logs all activities using the built-in logger:

- Lock acquisition/release
- Posts found for processing
- Publishing attempts and results
- Errors and retry attempts

### Database Monitoring

Monitor the `ContentPost` table:

```sql
-- Check scheduled posts
SELECT * FROM "ContentPost"
WHERE status = 'SCHEDULED'
ORDER BY "scheduledFor" ASC;

-- Check failed posts with retries
SELECT * FROM "ContentPost"
WHERE status = 'SCHEDULED'
  AND "retryCount" > 0
ORDER BY "lastRetryAt" DESC;

-- Check posts that exceeded retry limits
SELECT * FROM "ContentPost"
WHERE status = 'FAILED'
  AND "retryCount" >= 3
ORDER BY "updatedAt" DESC;
```

## 6. Rate Limiting

The scheduler enforces Instagram's API rate limits:

- **25 posts per day per account** (24-hour rolling window)
- Posts exceeding the limit are automatically skipped and retried later

## 7. Retry Logic

Failed posts are automatically retried with exponential backoff:

- **Attempt 1**: Immediate
- **Attempt 2**: 5 minutes later
- **Attempt 3**: 15 minutes later
- **Attempt 4**: 45 minutes later

After 3 retry attempts, posts are marked as FAILED.

## 8. Troubleshooting

### Scheduler Not Running

1. Check Vercel cron is enabled (Hobby plan or higher)
2. Verify `CRON_SECRET` is set correctly
3. Check Vercel cron logs for errors

### Posts Not Publishing

1. Check post status in database (should be `SCHEDULED`)
2. Verify `scheduledFor` timestamp is in the past
3. Check scheduler logs for errors
4. Verify Instagram access token is valid
5. Check rate limits haven't been exceeded

### Rate Limit Issues

If hitting rate limits frequently:

1. Space out scheduled posts more
2. Add more time between posts (at least 1 hour recommended)
3. Monitor the rate limit warnings in logs

## 9. Scaling Considerations

### Multiple Server Instances

The current implementation uses in-memory job locking, which works for single-instance deployments. For multiple instances:

1. Implement Redis-based locking
2. Use database-based locking with row-level locks
3. Use a distributed lock service (Consul, etcd)

### High Volume

For high-volume scheduling:

1. Consider batching posts
2. Implement a queue system (Bull, BullMQ)
3. Use dedicated worker processes
4. Monitor and optimize database queries

## 10. Next Steps

After successful deployment, consider implementing:

1. **Email notifications** for failed posts
2. **Webhook support** for real-time updates
3. **Analytics dashboard** for scheduling metrics
4. **OAuth flow** for Instagram (Phase 1.2 in implementation plan)
5. **Video posting** support (Phase 1.3 in implementation plan)

## Support

For issues or questions:
- Check the implementation plan: `IMPLEMENTATION_PLAN.md`
- Review the codebase documentation
- Check Vercel and database logs
