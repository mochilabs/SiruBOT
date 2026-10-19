-- 임베드 복구 사이트 기본값을 전부 꺼짐으로 바꿔요
ALTER TABLE "Guild" ALTER COLUMN "embedFixSites" SET DEFAULT ARRAY[]::TEXT[];

-- 기존 기본값(=x, instagram, booth) 그대로인 행은 새 기본값으로 초기화해요
UPDATE "Guild" SET "embedFixSites" = ARRAY[]::TEXT[] WHERE "embedFixSites" = ARRAY['x','instagram','booth']::TEXT[];