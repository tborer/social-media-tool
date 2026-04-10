-- Add instagramAccountType to SocialMediaAccount so we can validate that
-- connected Instagram accounts are BUSINESS or MEDIA_CREATOR (the only types
-- that support the Graph API /insights edge). PERSONAL accounts will never
-- return view/reach/engagement data regardless of the scopes granted.
ALTER TABLE "SocialMediaAccount" ADD COLUMN "instagramAccountType" TEXT;
