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

export function formatUptime(secondsValue: number): string {
	const seconds = Math.floor(secondsValue);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}일 ${hours}시간`;
	if (hours > 0) return `${hours}시간 ${minutes}분`;
	return `${minutes}분`;
}

export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remaining = seconds % 60;
	return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}
