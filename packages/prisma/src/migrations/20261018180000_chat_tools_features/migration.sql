-- 채팅 유틸리티 기능: 이모지 확대·메시지 인용·임베드 복구·카운팅 채널 (Guild 설정)
ALTER TABLE "Guild" ADD COLUMN "emojiEnlargeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guild" ADD COLUMN "quoteEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guild" ADD COLUMN "embedFixEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guild" ADD COLUMN "embedFixSites" TEXT[] NOT NULL DEFAULT ARRAY['x','instagram','booth']::TEXT[];
ALTER TABLE "Guild" ADD COLUMN "embedFixSuppressOriginal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guild" ADD COLUMN "countingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guild" ADD COLUMN "countingChannelId" TEXT;