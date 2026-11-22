-- 기브어웨이: 새 enum·테이블 2개만 만들어 기존 행에 영향이 없어요. 여러 번 실행해도 안전하게 IF NOT EXISTS와 예외 처리를 써요.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "GiveawayStatus" AS ENUM ('running', 'ended', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Giveaway" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "prize" TEXT NOT NULL,
    "winnerCount" INTEGER NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "requirements" JSONB NOT NULL DEFAULT '{"version":1,"conditions":[]}',
    "status" "GiveawayStatus" NOT NULL DEFAULT 'running',
    "winnerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entryCount" INTEGER,
    "eligibleCount" INTEGER,
    "endedAt" TIMESTAMP(3),
    "announcedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GiveawayEntry" (
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayEntry_pkey" PRIMARY KEY ("giveawayId","userId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Giveaway_guildId_status_idx" ON "Giveaway"("guildId", "status");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "GiveawayEntry" ADD CONSTRAINT "GiveawayEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
