-- 음성 채널 퇴장 알림 (길드 단위, 기본 off)
ALTER TABLE "Guild"
ADD COLUMN "ttsLeaveAnnounce" BOOLEAN NOT NULL DEFAULT false;

-- 사용자별 TTS 감정 (기본 neutral)
ALTER TABLE "TtsUserSetting"
ADD COLUMN "emotion" TEXT NOT NULL DEFAULT 'neutral';
