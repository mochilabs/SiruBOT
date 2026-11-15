-- 곡 정규화(Recording)와 기간 차트(RecordingDailyPlay). 기존 행은 apps/data-api/scripts/backfillRecordings.ts로 채워요.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Recording" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "isrc" TEXT,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "thumbnail" TEXT,
    "source" TEXT NOT NULL,
    "totalPlays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecordingDailyPlay" (
    "recordingId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "guildId" TEXT NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecordingDailyPlay_pkey" PRIMARY KEY ("recordingId","day","guildId")
);

-- AlterTable
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "isrc" TEXT;
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "isrcSource" TEXT;
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "isrcCheckedAt" TIMESTAMP(3);
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "recordingId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Recording_isrc_key" ON "Recording"("isrc");
CREATE INDEX IF NOT EXISTS "Recording_key_idx" ON "Recording"("key");
CREATE INDEX IF NOT EXISTS "Recording_totalPlays_idx" ON "Recording"("totalPlays" DESC);
CREATE INDEX IF NOT EXISTS "RecordingDailyPlay_day_idx" ON "RecordingDailyPlay"("day");
CREATE INDEX IF NOT EXISTS "Track_recordingId_idx" ON "Track"("recordingId");
CREATE INDEX IF NOT EXISTS "Track_isrcCheckedAt_idx" ON "Track"("isrcCheckedAt");
CREATE INDEX IF NOT EXISTS "GuildTrackHistory_createdAt_idx" ON "GuildTrackHistory"("createdAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Track" ADD CONSTRAINT "Track_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "RecordingDailyPlay" ADD CONSTRAINT "RecordingDailyPlay_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
