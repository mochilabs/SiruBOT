export function parseTimeToMs(input: string): number | null {
	const trimmed = String(input).trim();

	if (trimmed.includes(':')) {
		const parts = trimmed.split(':').map(Number);
		if (parts.some(Number.isNaN)) return null;

		if (parts.length === 2) return (parts[0]! * 60 + parts[1]!) * 1000;
		if (parts.length === 3) return (parts[0]! * 3600 + parts[1]! * 60 + parts[2]!) * 1000;
		return null;
	}

	const seconds = Number(trimmed);
	if (Number.isNaN(seconds)) return null;
	return seconds * 1000;
}
