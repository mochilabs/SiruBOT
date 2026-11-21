/**
 * 확인 창에 보여줄 도구 호출 요약을 만드는 공용 조각이에요.
 * 인자는 모델(=외부 내용의 영향을 받을 수 있는 쪽)이 정한 값이라 마크다운·멘션이 섞이지 않게 정리해서 보여줘요.
 */

const MAX_VALUE_LENGTH = 60;

/** 인자 값 하나를 인라인 코드로 감싸요 — 백틱·줄바꿈을 없애고 길면 잘라요 */
export function inlineValue(value: unknown): string {
	const text = (typeof value === 'string' ? value : JSON.stringify(value)) ?? '';
	const clean = text.replace(/[`\r\n]+/g, ' ').trim();
	const clipped = clean.length > MAX_VALUE_LENGTH ? `${clean.slice(0, MAX_VALUE_LENGTH)}…` : clean;
	return `\`${clipped}\``;
}

/** 설정 값 하나를 사람이 읽는 말로 바꿔요 — 해제(null/"none")·켜기/끄기·채널 토글을 풀어 써요 */
export function describeSettingValue(value: unknown): string {
	if (value === null || (typeof value === 'string' && value.trim().toLowerCase() === 'none')) return '해제';
	if (typeof value === 'boolean') return value ? '켜기' : '끄기';
	if (value && typeof value === 'object' && 'channel' in value) {
		const { channel, enabled } = value as { channel: unknown; enabled?: unknown };
		return `${inlineValue(channel)} ${enabled ? '켜기' : '끄기'}`;
	}
	return inlineValue(value);
}

/** `- 라벨 → 값` 줄들로 바꿔요. 지정되지 않은(undefined) 항목은 빼요 */
export function describeSettingLines(args: Record<string, unknown>, labels: Record<string, string>): string {
	return Object.entries(args)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `- ${labels[key] ?? inlineValue(key)} → ${describeSettingValue(value)}`)
		.join('\n');
}
