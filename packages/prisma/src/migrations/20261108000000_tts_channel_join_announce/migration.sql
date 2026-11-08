-- siru_tts 2.0은 speed/pitch를 받지 않으므로 제거하고, 스테레오 위치(channel)를 추가한다.
ALTER TABLE "TtsUserSetting"
DROP COLUMN "speed",
DROP COLUMN "pitch",
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'both';

-- 음성 채널 입장 알림 (길드 단위, 기본 off)
ALTER TABLE "Guild"
ADD COLUMN "ttsJoinAnnounce" BOOLEAN NOT NULL DEFAULT false;
