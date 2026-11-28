export function parseClock(value: string, fallback: { hour: number; minute: number }): { hour: number; minute: number } {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	const hour = match ? Number(match[1]) : fallback.hour;
	const minute = match ? Number(match[2]) : fallback.minute;
	return {
		hour: Math.min(23, Math.max(0, hour)),
		minute: Math.min(59, Math.max(0, minute))
	};
}
