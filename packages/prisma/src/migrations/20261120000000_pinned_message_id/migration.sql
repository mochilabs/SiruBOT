-- 고정 채널 상시 패널 메시지 ID
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "pinnedMessageId" TEXT;
