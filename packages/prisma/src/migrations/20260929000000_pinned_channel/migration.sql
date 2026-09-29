-- AlterTable
ALTER TABLE "Guild" ADD COLUMN "pinnedChannelId" TEXT;
ALTER TABLE "Guild" ADD COLUMN "pinnedChannelMode" TEXT NOT NULL DEFAULT 'play';
