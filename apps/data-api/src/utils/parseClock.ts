/**
 * 'HH:MM' 시각 파싱 — 스케줄 시각(env의 *AT 키)을 {hour, minute}로 만들어요.
 * 형식이 어긋나면 fallback으로 돌아가고, 시/분은 0~23 / 0~59로 클램프해요.
 * (memoryTidy.parseAt·ohaasaScheduler.parseTime의 공용 버전)
 */
export function parseClock(value: string, fallback: { hour: number; minute: number }): { hour: number; minute: number } {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	const hour = match ? Number(match[1]) : fallback.hour;
	const minute = match ? Number(match[2]) : fallback.minute;
	return {
		hour: Math.min(23, Math.max(0, hour)),
		minute: Math.min(59, Math.max(0, minute))
	};
}
