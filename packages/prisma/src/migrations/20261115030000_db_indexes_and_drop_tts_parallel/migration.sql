-- 레거시 Guild.ttsParallelEnabled 컬럼 제거 및 조회·Cascade 성능을 위한 인덱스/유니크 제약 추가

-- DropIndex
DROP INDEX IF EXISTS "PlaylistTrack_playlistId_idx";

-- AlterTable
ALTER TABLE "Guild" DROP COLUMN IF EXISTS "ttsParallelEnabled";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GuildTrackHistory_userId_createdAt_idx" ON "GuildTrackHistory"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "GuildTrackHistory_trackId_idx" ON "GuildTrackHistory"("trackId");
CREATE INDEX IF NOT EXISTS "PlaylistTrack_trackId_idx" ON "PlaylistTrack"("trackId");
CREATE INDEX IF NOT EXISTS "SocialSubscription_platform_status_idx" ON "SocialSubscription"("platform", "status");
CREATE INDEX IF NOT EXISTS "SocialSubscription_status_idx" ON "SocialSubscription"("status");
CREATE INDEX IF NOT EXISTS "SocialEventLog_deliveredAt_idx" ON "SocialEventLog"("deliveredAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_guildId_ticketNumber_key" ON "Ticket"("guildId", "ticketNumber");
