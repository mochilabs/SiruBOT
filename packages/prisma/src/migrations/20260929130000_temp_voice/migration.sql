-- AlterTable: 임시 음성채널(JTC)
ALTER TABLE "Guild" ADD COLUMN "jtcEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guild" ADD COLUMN "jtcCategoryId" TEXT;
ALTER TABLE "Guild" ADD COLUMN "jtcMarkerChannelId" TEXT;
ALTER TABLE "Guild" ADD COLUMN "jtcTemplate" TEXT NOT NULL DEFAULT '{user}의 방';
ALTER TABLE "Guild" ADD COLUMN "jtcUserLimit" INTEGER NOT NULL DEFAULT 0;
