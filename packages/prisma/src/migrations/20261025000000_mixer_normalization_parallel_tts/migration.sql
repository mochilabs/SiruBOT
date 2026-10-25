-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "normalizationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guild" ADD COLUMN     "ttsParallelEnabled" BOOLEAN NOT NULL DEFAULT false;
