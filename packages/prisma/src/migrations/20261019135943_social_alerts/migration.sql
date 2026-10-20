-- AlterTable
ALTER TABLE "TtsUserSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SocialSubscription" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourcePlatformId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "targetChannelId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "webhookToken" TEXT NOT NULL,
    "messageTemplate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialEventLog" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialSubscription_platform_sourcePlatformId_idx" ON "SocialSubscription"("platform", "sourcePlatformId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialSubscription_guildId_platform_sourcePlatformId_target_key" ON "SocialSubscription"("guildId", "platform", "sourcePlatformId", "targetChannelId");

-- CreateIndex
CREATE INDEX "SocialEventLog_deliveredAt_idx" ON "SocialEventLog"("deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialEventLog_platform_contentId_key" ON "SocialEventLog"("platform", "contentId");
