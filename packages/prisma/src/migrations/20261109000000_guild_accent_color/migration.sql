-- 서버 강조색 (#RRGGBB, null이면 봇 기본색)
ALTER TABLE "Guild"
ADD COLUMN "accentColor" TEXT;
