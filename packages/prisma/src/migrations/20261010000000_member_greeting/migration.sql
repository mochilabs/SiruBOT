-- 멤버 인사: 입장/퇴장 메시지 + 커스텀 카드 이미지 설정. 구조는 packages/utils/src/memberGreeting.ts 타입과 동기화.
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "welcome" JSONB;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "goodbye" JSONB;