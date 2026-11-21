-- 서버 생명주기(온보딩·지표)와 일별 기능 사용 집계. 새 테이블만 만들어 기존 행에 영향이 없어요.

-- CreateTable
CREATE TABLE IF NOT EXISTS "GuildLifecycle" (
    "guildId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "onboardedAt" TIMESTAMP(3),
    "firstUseAt" TIMESTAMP(3),
    "joinCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuildLifecycle_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE IF NOT EXISTS "FeatureDailyUse" (
    "guildId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "feature" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "users" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeatureDailyUse_pkey" PRIMARY KEY ("guildId","day","feature")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GuildLifecycle_joinedAt_idx" ON "GuildLifecycle"("joinedAt");
CREATE INDEX IF NOT EXISTS "FeatureDailyUse_day_idx" ON "FeatureDailyUse"("day");
