/*
  Note:

  - 레거시 환경에서 생성됐던 `UserFavorite` 테이블을 정리해요. 이미 제거된 환경(48cd8da 이전 배포)에서는
    `IF EXISTS` 가드로 안전하게 스킵돼요. beta/운영에서 migration drift를 막기 위해 손질했어요.
*/

-- AlterTable
ALTER TABLE "ChannelChatHistory" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthDay" INTEGER,
ADD COLUMN     "birthMonth" INTEGER;

-- DropForeignKey (테이블이 있을 때만)
ALTER TABLE IF EXISTS "UserFavorite" DROP CONSTRAINT IF EXISTS "UserFavorite_trackId_fkey";
ALTER TABLE IF EXISTS "UserFavorite" DROP CONSTRAINT IF EXISTS "UserFavorite_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "UserFavorite";
