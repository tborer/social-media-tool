-- AddColumn brand voice fields to UserSettings
ALTER TABLE "UserSettings" ADD COLUMN "brandVoiceTone" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "brandVoiceAudience" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "brandVoicePersonality" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "brandVoiceKeyPhrases" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "UserSettings" ADD COLUMN "brandVoiceAvoidPhrases" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "UserSettings" ADD COLUMN "brandVoiceExamples" TEXT;
