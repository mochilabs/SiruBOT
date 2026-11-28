export function formatTotalDuration(ms: number): string {
	if (!ms) return "0분";
	const totalMinutes = Math.floor(ms / 60000);
	if (totalMinutes < 60) return `${totalMinutes}분`;
	const hours = Math.floor(totalMinutes / 60);
	const mins = totalMinutes % 60;
	return `${hours}시간 ${mins}분`;
}
