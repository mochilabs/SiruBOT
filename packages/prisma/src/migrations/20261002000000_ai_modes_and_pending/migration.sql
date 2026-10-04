-- AI 채팅 설정: all(모든 채널) | channels(특정 채널만) | off(끄기)
-- deny-list(aiEnabled + aiDisabledChannelIds)에서 allow-list 모드로 교체
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "aiMode" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "aiChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "aiModel" TEXT;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "aiSystemPrompt" TEXT;

-- 이전 deny-list 필드가 선반영된 환경 정리 (신규 필드 기본값이 동작을 승계)
ALTER TABLE "Guild" DROP COLUMN IF EXISTS "aiEnabled";
ALTER TABLE "Guild" DROP COLUMN IF EXISTS "aiDisabledChannelIds";

-- 채널별 대화 기록의 서버 귀속 (대시보드 서버 단위 삭제용)
ALTER TABLE "ChannelChatHistory" ADD COLUMN IF NOT EXISTS "guildId" TEXT;
CREATE INDEX IF NOT EXISTS "ChannelChatHistory_guildId_idx" ON "ChannelChatHistory"("guildId");

-- 사용자 메모리 — 에이전트 memory 도구가 관리하는 장기/단기 기억
CREATE TABLE IF NOT EXISTS "UserMemory" (
    "userId" TEXT NOT NULL,
    "longTerm" JSONB,
    "shortTerm" JSONB,
    "tidiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("userId")
);

-- 플레이리스트 (스키마에는 있으나 마이그레이션에 없던 테이블 — 선반영된 환경은 건너뜀)
CREATE TABLE IF NOT EXISTS "Playlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Playlist_userId_idx" ON "Playlist"("userId");

CREATE TABLE IF NOT EXISTS "PlaylistTrack" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistTrack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlaylistTrack_playlistId_position_key" ON "PlaylistTrack"("playlistId", "position");
CREATE INDEX IF NOT EXISTS "PlaylistTrack_playlistId_idx" ON "PlaylistTrack"("playlistId");

-- 외래키는 "이미 존재하면 건너뜀" 처리 (Postgres은 ADD CONSTRAINT IF NOT EXISTS 미지원)
DO $$
BEGIN
    ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "PlaylistTrack" ADD CONSTRAINT "PlaylistTrack_playlistId_fkey"
        FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "PlaylistTrack" ADD CONSTRAINT "PlaylistTrack_trackId_fkey"
        FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
