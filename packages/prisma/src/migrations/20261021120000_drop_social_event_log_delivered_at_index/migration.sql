-- SocialEventLog의 미사용 인덱스 제거 — deliveredAt로 필터·정렬하는 쿼리가 없어
-- 쓰기 비용·저장량만 발생하는 인덱스였어요 (감사: docs/codebase-audit.md P2 packages).
-- 컬럼 자체는 운영 조회용으로 유지해요.
DROP INDEX "SocialEventLog_deliveredAt_idx";
