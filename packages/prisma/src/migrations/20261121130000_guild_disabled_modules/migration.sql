-- 서버별 모듈 켜기/끄기. 빈 배열이 기본(모두 켜짐)이라 기존 서버는 그대로예요.

-- AlterTable
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "disabledModules" TEXT[] DEFAULT ARRAY[]::TEXT[];
