-- 채팅 유틸 기능(이모지 확대·메시지 인용·임베드 복구)을 길드 전체 on/off에서
-- 채널 단위 on/off(모드 all|channels|off + 허용 채널 목록)로 확장해요.
-- AI 채팅(aiMode/aiChannelIds)·채팅 TTS(ttsMode/ttsChannelIds)와 같은 계약이에요.
ALTER TABLE "Guild" DROP COLUMN "emojiEnlargeEnabled";
ALTER TABLE "Guild" ADD COLUMN "emojiEnlargeMode" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "Guild" ADD COLUMN "emojiEnlargeChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Guild" DROP COLUMN "quoteEnabled";
ALTER TABLE "Guild" ADD COLUMN "quoteMode" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "Guild" ADD COLUMN "quoteChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Guild" DROP COLUMN "embedFixEnabled";
ALTER TABLE "Guild" ADD COLUMN "embedFixMode" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "Guild" ADD COLUMN "embedFixChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];