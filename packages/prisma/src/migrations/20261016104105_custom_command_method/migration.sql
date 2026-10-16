-- AlterTable
ALTER TABLE "CustomCommand" ADD COLUMN     "applicationCommandId" TEXT,
ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'prefix';
