-- 생일 축하: 새 테이블 3개만 만들어 기존 행에 영향이 없어요. 여러 번 실행해도 안전하게 IF NOT EXISTS와 예외 처리를 써요.

-- CreateTable
CREATE TABLE IF NOT EXISTS "BirthdaySettings" (
    "guildId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "sendTime" TEXT NOT NULL DEFAULT '09:00',
    "roleId" TEXT,
    "activeFrom" TEXT,
    "lastCelebratedOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BirthdaySettings_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BirthdayOptIn" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirthdayOptIn_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BirthdayRoleGrant" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedOn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirthdayRoleGrant_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BirthdayOptIn_userId_idx" ON "BirthdayOptIn"("userId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "BirthdaySettings" ADD CONSTRAINT "BirthdaySettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "BirthdayOptIn" ADD CONSTRAINT "BirthdayOptIn_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "BirthdayOptIn" ADD CONSTRAINT "BirthdayOptIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "BirthdayRoleGrant" ADD CONSTRAINT "BirthdayRoleGrant_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
