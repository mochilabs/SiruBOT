/*
  Warnings:

  - You are about to drop the `UserFavorite` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserFavorite" DROP CONSTRAINT "UserFavorite_trackId_fkey";

-- DropForeignKey
ALTER TABLE "UserFavorite" DROP CONSTRAINT "UserFavorite_userId_fkey";

-- AlterTable
ALTER TABLE "ChannelChatHistory" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthDay" INTEGER,
ADD COLUMN     "birthMonth" INTEGER;

-- DropTable
DROP TABLE "UserFavorite";
