-- 채팅 TTS 사용자 설정: 길드별 사용자 opt-in과 음성 프리셋(voice/speed/pitch)
CREATE TABLE IF NOT EXISTS "TtsUserSetting" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "voice" TEXT,
    "speed" DOUBLE PRECISION,
    "pitch" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtsUserSetting_pkey" PRIMARY KEY ("guildId", "userId")
);
