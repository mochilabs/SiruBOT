-- 예약 메시지: 서버별 활성 예약 상한과 같은 채널 최소 간격. 새 테이블만 만들어 기존 행에 영향이 없어요.

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScheduledMessageSettings" (
    "guildId" TEXT NOT NULL,
    "maxActive" INTEGER NOT NULL DEFAULT 25,
    "minIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledMessageSettings_pkey" PRIMARY KEY ("guildId")
);

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ScheduledMessageSettings" ADD CONSTRAINT "ScheduledMessageSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
