-- 가사 한국어 번역 저장소: 새 테이블만 만들어 기존 행에 영향이 없어요.

-- CreateTable
CREATE TABLE IF NOT EXISTS "LyricsTranslation" (
    "sourceHash" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LyricsTranslation_pkey" PRIMARY KEY ("sourceHash")
);
