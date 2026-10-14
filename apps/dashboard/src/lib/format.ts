/** 대시보드 공용 포맷 헬퍼 — 컴포넌트·페이지에서 로컬로 복제하지 말고 여기서 가져다 써요. */

/** 프로세스 업타입 — "N일 N시간" / "N시간 N분" / "N분" (shards 프로세스 카드) */
export function formatUptime(secondsValue: number): string {
	const seconds = Math.floor(secondsValue);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}일 ${hours}시간`;
	if (hours > 0) return `${hours}시간 ${minutes}분`;
	return `${minutes}분`;
}

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

/** 재생 시간 m:ss 표기 (밀리초 입력) */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remaining = seconds % 60;
	return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

/** 메모리 MB 표기 */
export function formatMemory(bytes: number): string {
	return `${Math.round(bytes / 1024 / 1024)}MB`;
}