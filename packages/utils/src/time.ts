export function formatTime(seconds: number): string {
	if (isNaN(seconds) || seconds < 0) return '00:00';

	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	if (hours > 0) {
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatTimeToKorean(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	const parts: string[] = [];

	if (hours > 0) {
		parts.push(`${hours}시간`);
	}
	if (minutes > 0 || hours > 0) {
		parts.push(`${minutes}분`);
	}
	if (secs > 0 || (hours === 0 && minutes === 0)) {
		parts.push(`${secs}초`);
	}

	return parts.join(' ');
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 프로세스 업타임 — "N일 N시간" / "N시간 N분" / "N분" (대시보드 프로세스·노드 카드에서 승격) */
export function formatUptime(secondsValue: number): string {
	const seconds = Math.floor(secondsValue);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}일 ${hours}시간`;
	if (hours > 0) return `${hours}시간 ${minutes}분`;
	return `${minutes}분`;
}

/** 재생 시간 m:ss 표기 (밀리초 입력) — 분은 0 패딩하지 않고 시간 자리가 없어요 (formatTime과 출력이 다름에 주의) */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remaining = seconds % 60;
	return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}
