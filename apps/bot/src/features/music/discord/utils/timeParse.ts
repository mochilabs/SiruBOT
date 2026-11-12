/**
 * 곡 위치 문자열(`"90"`, `"1:30"`, `"1:02:30"`) → 밀리초 변환의 단일 원본.
 * `/음악 시간이동` 커맨드와 AI 도구 `music_seek`가 각각 사본을 갖고 있어
 * 한쪽만 갱신되면 허용 입력이 어긋났어요. 형식이 잘못됐으면 null이에요.
 */
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
