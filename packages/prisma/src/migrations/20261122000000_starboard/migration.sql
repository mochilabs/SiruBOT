-- 스타보드: 서버별 설정과 스타보드에 올라간 원문 기록. 새 테이블만 만들어 기존 행에 영향이 없어요.

-- CreateTable
CREATE TABLE IF NOT EXISTS "StarboardSettings" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "emoji" TEXT NOT NULL DEFAULT '⭐',
    "threshold" INTEGER NOT NULL DEFAULT 3,
    "excludeSelf" BOOLEAN NOT NULL DEFAULT true,
    "excludeNsfw" BOOLEAN NOT NULL DEFAULT true,
    "ignoredChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarboardSettings_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StarboardEntry" (
    "sourceMessageId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "sourceChannelId" TEXT NOT NULL,
    "starboardChannelId" TEXT NOT NULL,
    "starboardMessageId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarboardEntry_pkey" PRIMARY KEY ("sourceMessageId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StarboardEntry_guildId_idx" ON "StarboardEntry"("guildId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "StarboardSettings" ADD CONSTRAINT "StarboardSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "StarboardEntry" ADD CONSTRAINT "StarboardEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
