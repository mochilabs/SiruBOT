export function escapeLikeWildcard(value: string): string {
	return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
