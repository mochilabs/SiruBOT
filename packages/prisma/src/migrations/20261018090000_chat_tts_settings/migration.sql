-- 채팅 TTS: off(기본) | channels(특정 채널만) | all. 채팅 메시지를 음성으로 읽어요.
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "ttsMode" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "ttsChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
