/** 문자열을 max_length 이하로 줄이고 넘치는 부분은 …로 대체해요 (null·undefined는 빈 문자열). */
export function truncateText(text: string | null | undefined, maxLength: number): string {
	const value = text ?? '';
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
