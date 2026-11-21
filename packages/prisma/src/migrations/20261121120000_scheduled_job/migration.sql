-- 서버별 예약 작업 큐. 새 enum·테이블만 만들어 기존 행에 영향이 없어요.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ScheduledJobStatus" AS ENUM ('pending', 'running', 'done', 'failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScheduledJob" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "ScheduledJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledJob_status_runAt_idx" ON "ScheduledJob"("status", "runAt");
CREATE INDEX IF NOT EXISTS "ScheduledJob_guildId_idx" ON "ScheduledJob"("guildId");
