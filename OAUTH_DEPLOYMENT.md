# Instagram OAuth & Token Encryption - Deployment Guide

This guide covers deploying Phase 1.2: Instagram OAuth Flow and Token Encryption.

## Overview

Phase 1.2 adds:
- Secure OAuth 2.0 authentication for Instagram
- AES-256-GCM token encryption at rest
- Automatic token refresh (60-day tokens refreshed within 7 days of expiry)
- Backward compatibility with manually-entered tokens

## Prerequisites

- Completed Phase 1.1 (Scheduling Automation)
- Instagram/Facebook App configured in Meta for Developers
- Access to Vercel/deployment environment variables

## 1. Configure Instagram App

### Create/Configure Instagram App

1. Go to [Meta for Developers](https://developers.facebook.com/apps/)
2. Create a new app or select existing app
3. Add **Instagram Basic Display** product
4. Configure OAuth settings:
   - **Valid OAuth Redirect URIs**: `https://your-domain.com/api/auth/instagram/callback`
   - **Deauthorize Callback URL**: (optional) `https://your-domain.com/api/auth/instagram/deauthorize`
   - **Data Deletion Request URL**: (optional) `https://your-domain.com/api/auth/instagram/data-deletion`

5. Note your credentials:
   - **Instagram App ID**: Found in App Dashboard
   - **Instagram App Secret**: Found in App Dashboard (keep secure!)
   - **Client Token**: (optional, not needed for this implementation)

### Required Permissions

The app requests these Instagram permissions:
- `user_profile`: Access to user's profile information
- `user_media`: Access to user's media (required for posting)

## 2. Generate Encryption Key

Generate a secure 32-byte encryption key:

```bash
# Using OpenSSL (recommended)
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using Python
python3 -c "import os; print(os.urandom(32).hex())"
```

**IMPORTANT**: Store this key securely. If you lose it, all encrypted tokens will become inaccessible.

## 3. Database Migration

Apply the OAuth schema migration:

```bash
# Development
npx prisma migrate dev

# Production
npx prisma migrate deploy
```

The migration adds:
- `isEncrypted` (Boolean): Indicates if token is encrypted
- `tokenExpiresAt` (DateTime): Token expiration timestamp

## 4. Environment Variables

Set these environment variables in your deployment environment:

### Required for OAuth
```env
INSTAGRAM_APP_ID=your_app_id_here
INSTAGRAM_APP_SECRET=your_app_secret_here
INSTAGRAM_REDIRECT_URI=https://your-domain.com/api/auth/instagram/callback
```

### Highly Recommended for Security
```env
ENCRYPTION_KEY=your_32_byte_hex_key_here
```

### App URL (if not already set)
```env
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## 5. Deploy Application

```bash
# Deploy to Vercel
vercel --prod

# Or push to your connected Git repository
git push origin main
```

## 6. Test OAuth Flow

### Manual Testing

1. Log into your application
2. Navigate to the dashboard
3. Click "Add Account"
4. Select "Instagram" from the dropdown
5. Click "Connect with Instagram"
6. Authorize the application on Instagram
7. Verify redirect back to dashboard
8. Check that account appears in account list

### Verify Token Encryption

Connect to your database and verify:

```sql
SELECT
  username,
  "isEncrypted",
  "tokenExpiresAt",
  LENGTH("accessToken") as token_length
FROM "SocialMediaAccount"
WHERE "accountType" = 'INSTAGRAM';
```

Expected results:
- `isEncrypted`: `true` (if ENCRYPTION_KEY is set)
- `tokenExpiresAt`: ~60 days in the future
- `token_length`: Longer than typical access token (due to encryption)

### Test Posting

1. Create a test post
2. Schedule or publish immediately
3. Verify post appears on Instagram
4. Check logs for any decryption errors

## 7. Token Refresh Mechanism

### How It Works

- Long-lived tokens expire after 60 days
- System automatically refreshes tokens within 7 days of expiry
- Refresh happens transparently during posting
- No user intervention required

### Monitor Token Status

The system logs token refresh events. Check logs for:
- "Instagram token needs refresh"
- "Instagram token refreshed successfully"
- "Failed to refresh Instagram token"

## 8. Backward Compatibility

### Manual Token Entry Still Supported

Users can still manually enter tokens:
1. Click "Add Account"
2. Scroll to "Or add manually" section
3. Enter username and access token
4. Click "Add Manually"

Manual tokens are stored with `isEncrypted = false` (or encrypted if ENCRYPTION_KEY is set)

### Migration Path

Existing manually-entered tokens work without migration:
- Old tokens remain functional
- System detects `isEncrypted = false` and uses token as-is
- Users can reconnect via OAuth to upgrade to encrypted tokens

## 9. Security Best Practices

### Token Storage

✅ **DO:**
- Use ENCRYPTION_KEY in production
- Rotate ENCRYPTION_KEY periodically (requires token re-entry)
- Use environment variables for secrets
- Enable HTTPS in production

❌ **DON'T:**
- Store encryption key in code
- Commit encryption key to Git
- Share encryption key publicly
- Use same key across environments

### Access Control

- Tokens are user-specific (verified via userId)
- Automatic token refresh requires valid session
- Failed OAuth attempts are logged
- Rate limiting on OAuth endpoints (built into Instagram)

## 10. Troubleshooting

### OAuth Callback Fails

**Error**: "Invalid state parameter"
- Cause: CSRF protection triggered
- Solution: Clear cookies and try again

**Error**: "Instagram authorization failed"
- Check Instagram App status (must be Live, not Development)
- Verify redirect URI matches exactly
- Ensure user approved all permissions

### Encryption Errors

**Error**: "Token is encrypted but encryption is not configured"
- Cause: `ENCRYPTION_KEY` not set
- Solution: Set `ENCRYPTION_KEY` environment variable

**Error**: "Decryption failed"
- Cause: Token encrypted with different key
- Solution: Re-authenticate user via OAuth

### Token Refresh Fails

**Error**: "Token refresh failed"
- Cause: Token already expired
- Solution: User must reconnect via OAuth

**Error**: "Failed to refresh Instagram token"
- Check Instagram App status
- Verify INSTAGRAM_APP_SECRET is correct
- Check network connectivity to Instagram API

### Posting Fails with Encrypted Tokens

1. Check logs for decryption errors
2. Verify ENCRYPTION_KEY matches key used during OAuth
3. Test token decryption:
   ```typescript
   import { getAccessToken } from '@/lib/instagram-token-manager';
   const token = await getAccessToken(accountId, userId);
   ```

## 11. Monitoring

### Key Metrics to Monitor

1. **OAuth Success Rate**
   - Log entries: "Instagram OAuth flow completed successfully"
   - Target: >95%

2. **Token Refresh Rate**
   - Log entries: "Instagram token refreshed successfully"
   - Expected: ~1-2 per account per 60 days

3. **Encryption Status**
   ```sql
   SELECT
     COUNT(*) as total,
     COUNT(*) FILTER (WHERE "isEncrypted" = true) as encrypted,
     COUNT(*) FILTER (WHERE "tokenExpiresAt" IS NOT NULL) as with_expiry
   FROM "SocialMediaAccount"
   WHERE "accountType" = 'INSTAGRAM';
   ```

4. **Token Expiration**
   ```sql
   SELECT
     username,
     "tokenExpiresAt",
     AGE("tokenExpiresAt", NOW()) as time_until_expiry
   FROM "SocialMediaAccount"
   WHERE "accountType" = 'INSTAGRAM'
     AND "tokenExpiresAt" IS NOT NULL
   ORDER BY "tokenExpiresAt" ASC;
   ```

## 12. Rollback Plan

If issues arise, you can rollback:

### Option 1: Disable OAuth (Keep Manual Entry)

1. Remove OAuth button from UI (comment out in dashboard.tsx)
2. Keep encryption (optional)
3. Users revert to manual token entry

### Option 2: Disable Encryption

1. Remove or comment out `ENCRYPTION_KEY`
2. New tokens stored as plaintext
3. Existing encrypted tokens remain encrypted (users must reconnect)

### Option 3: Full Rollback

1. Revert to previous Git commit
2. Apply database migration rollback:
   ```bash
   # Create rollback migration
   npx prisma migrate dev --name rollback_oauth_fields --create-only
   ```

   Edit the migration to:
   ```sql
   ALTER TABLE "SocialMediaAccount" DROP COLUMN "isEncrypted";
   ALTER TABLE "SocialMediaAccount" DROP COLUMN "tokenExpiresAt";
   ```

## 13. Next Steps

After successful OAuth deployment:

1. **Monitor token refresh logs** for first 30 days
2. **Phase 1.3**: Video Posting (next in roadmap)
3. **Enhanced monitoring**: Set up alerts for OAuth failures
4. **User communication**: Announce OAuth feature to users

## Support

For issues:
- Check logs: Vercel dashboard → Logs tab
- Database queries: Above monitoring queries
- Review error messages in browser console
- Check IMPLEMENTATION_PLAN.md for context

## API Endpoints

New endpoints added:
- `GET /api/auth/instagram/connect` - Initiates OAuth flow
- `GET /api/auth/instagram/callback` - Handles OAuth callback

Modified endpoints:
- `/api/social-media-accounts/[id]/post` - Now uses encrypted tokens
- `/api/scheduler/run` - Now uses encrypted tokens

## Testing Checklist

- [ ] OAuth flow completes successfully
- [ ] Token is encrypted in database
- [ ] Token expiry is set (~60 days)
- [ ] Manual posting works with OAuth token
- [ ] Scheduled posting works with OAuth token
- [ ] Token refresh works (simulate by setting tokenExpiresAt to 6 days from now)
- [ ] Existing manual tokens still work
- [ ] Error handling works (try invalid credentials)
- [ ] UI shows OAuth button for Instagram
- [ ] Manual entry still available as fallback
