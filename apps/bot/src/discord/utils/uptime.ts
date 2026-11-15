/** 업타임 "N일 N시간 N분" 표기: /봇 정보와 Lavalink 노드 상태가 같은 형식을 쓰게 해요 */
export function formatDayHourMinute(secondsValue: number): string {
	const seconds = Math.floor(secondsValue);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${days}일 ${hours}시간 ${minutes}분`;
}
