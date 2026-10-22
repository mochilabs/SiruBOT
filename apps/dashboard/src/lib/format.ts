/**
 * 대시보드 전용 포맷 헬퍼 — 컴포넌트·페이지에서 로컬로 복제하지 말고 여기서 가져다 써요.
 * 범용 시간 포맷(업타임·재생 시간)은 `@sirubot/utils/time`이 단일 홈이에요 (components/track.tsx 참고).
 * 여기에는 대시보드 표현 전용(상대 시간·바이트)만 남겨요.
 */

/** epoch ms 기준 상대 시간 — "방금 전" / "N초 전" / "N분 전" / "N시간 전" (하트비트 표기) */
export function formatRelativeTime(timestamp: number): string {
	const diff = Math.floor((Date.now() - timestamp) / 1000);
	if (diff < 5) return "방금 전";
	if (diff < 60) return `${diff}초 전`;
	if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
	return `${Math.floor(diff / 3600)}시간 전`;
}

/** ISO 문자열 기준 상대 시간 — "방금" / "N분 전" / "N시간 전" / "N일 전", 7일 넘으면 날짜 (재생 기록) */
export function formatRelativeTimeFromISO(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return "방금";
	if (minutes < 60) return `${minutes}분 전`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}시간 전`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}일 전`;
	return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/** 메모리 MB 표기 */
export function formatMemory(bytes: number): string {
	return `${Math.round(bytes / 1024 / 1024)}MB`;
}