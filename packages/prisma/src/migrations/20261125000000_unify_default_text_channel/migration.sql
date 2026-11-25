-- 고정 채널을 기본 텍스트 채널로 통합한다.
-- 고정 채널이 있던 서버는 그 채널을 기본 채널로 옮기고 입력 재생을 켠다 (기존 동작 유지).
ALTER TABLE "Guild" ADD COLUMN "textChannelInputPlay" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Guild" SET "textChannelInputPlay" = true, "textChannelId" = "pinnedChannelId" WHERE "pinnedChannelId" IS NOT NULL;

ALTER TABLE "Guild" RENAME COLUMN "pinnedMessageId" TO "textMessageId";
ALTER TABLE "Guild" RENAME COLUMN "pinnedChannelMode" TO "textChannelMode";
ALTER TABLE "Guild" RENAME COLUMN "pinnedChannelDeleteInput" TO "textChannelDeleteInput";
ALTER TABLE "Guild" DROP COLUMN "pinnedChannelId";
