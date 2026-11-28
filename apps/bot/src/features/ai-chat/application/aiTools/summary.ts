const MAX_VALUE_LENGTH = 60;

export function inlineValue(value: unknown): string {
	const text = (typeof value === 'string' ? value : JSON.stringify(value)) ?? '';
	const clean = text.replace(/[`\r\n]+/g, ' ').trim();
	const clipped = clean.length > MAX_VALUE_LENGTH ? `${clean.slice(0, MAX_VALUE_LENGTH)}…` : clean;
	return `\`${clipped}\``;
}

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
