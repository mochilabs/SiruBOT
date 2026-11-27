export function truncateText(text: string | null | undefined, maxLength: number): string {
	const value = text ?? '';
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
