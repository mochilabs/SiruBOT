/** Prisma contains(ILIKE) 와일드카드 이스케이프 — %, _, \를 리터럴로 취급해요 */
export function escapeLikeWildcard(value: string): string {
	return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
