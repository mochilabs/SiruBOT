-- 고정 채널 입력 메시지 자동 삭제 토글 (봇 처리 후 사용자 메시지 삭제 — Manage Messages 권한 필요)
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "pinnedChannelDeleteInput" BOOLEAN NOT NULL DEFAULT false;