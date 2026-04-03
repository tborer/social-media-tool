-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('PROSPECT', 'CONTACTED', 'RESPONDED', 'CONVERTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OutreachMessageStatus" AS ENUM ('DRAFT', 'SENT', 'REPLIED', 'NO_REPLY');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "igUsername" TEXT NOT NULL,
    "igUserId" TEXT,
    "displayName" TEXT,
    "niche" TEXT,
    "location" TEXT,
    "followerCount" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "bio" TEXT,
    "notes" TEXT,
    "status" "ContactStatus" NOT NULL DEFAULT 'PROSPECT',
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "contactId" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL,
    "templateName" TEXT,
    "status" "OutreachMessageStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "responseReceivedAt" TIMESTAMP(3),
    "responseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachCriteria" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "searchTerms" TEXT[],
    "locations" TEXT[],
    "niches" TEXT[],
    "followerMin" INTEGER,
    "followerMax" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");
CREATE INDEX "Contact_userId_status_idx" ON "Contact"("userId", "status");
CREATE UNIQUE INDEX "Contact_userId_igUsername_key" ON "Contact"("userId", "igUsername");

-- CreateIndex
CREATE INDEX "OutreachMessage_userId_idx" ON "OutreachMessage"("userId");
CREATE INDEX "OutreachMessage_contactId_idx" ON "OutreachMessage"("contactId");

-- CreateIndex
CREATE INDEX "OutreachCriteria_userId_idx" ON "OutreachCriteria"("userId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCriteria" ADD CONSTRAINT "OutreachCriteria_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
