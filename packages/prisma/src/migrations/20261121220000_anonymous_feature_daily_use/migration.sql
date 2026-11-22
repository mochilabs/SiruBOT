-- 서버별·고유 사용자 컬럼(guildId, users)을 없애고 익명 일별(day, feature) 합계로 통합해요.

CREATE TABLE "FeatureDailyUse_new" (
    "day" DATE NOT NULL,
    "feature" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeatureDailyUse_new_pkey" PRIMARY KEY ("day", "feature")
);

INSERT INTO "FeatureDailyUse_new" ("day", "feature", "count")
SELECT "day", "feature", COALESCE(SUM("count"), 0)::INTEGER
FROM "FeatureDailyUse"
GROUP BY "day", "feature";

DROP TABLE "FeatureDailyUse";
ALTER TABLE "FeatureDailyUse_new" RENAME TO "FeatureDailyUse";
ALTER TABLE "FeatureDailyUse" RENAME CONSTRAINT "FeatureDailyUse_new_pkey" TO "FeatureDailyUse_pkey";

CREATE INDEX "FeatureDailyUse_day_idx" ON "FeatureDailyUse"("day");
