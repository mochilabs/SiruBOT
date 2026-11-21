/**
 * 소스의 슬래시 명령과 디스코드에 등록된 명령 이름 비교 (P-04).
 * 부팅 감사 리스너(`discord/listeners/commandRegistrationAudit.ts`)와 `scripts/register-commands.ts --dry-run`이 같이 써요.
 * 설명·옵션 차이는 Sapphire가 부팅 때 따로 경고해요 (`RegisterBehavior.LogToConsole`).
 */
export interface CommandNameDiff {
	/** 소스에는 있는데 디스코드에 없는 명령 (사용자가 못 씀) */
	missing: string[];
	/** 디스코드에는 있는데 소스에 없는 명령 (눌러도 응답 없음) */
	extra: string[];
}

export function diffCommandNames(local: Iterable<string>, remote: Iterable<string>): CommandNameDiff {
	const localSet = new Set(local);
	const remoteSet = new Set(remote);
	return {
		missing: [...localSet].filter((name) => !remoteSet.has(name)).sort(),
		extra: [...remoteSet].filter((name) => !localSet.has(name)).sort()
	};
}

export function hasCommandDiff(diff: CommandNameDiff): boolean {
	return diff.missing.length > 0 || diff.extra.length > 0;
}

/** 로그·Sentry 한 줄 요약 */
export function formatCommandDiff(diff: CommandNameDiff): string {
	const parts: string[] = [];
	if (diff.missing.length > 0) parts.push(`등록 안 됨: ${diff.missing.map((n) => `/${n}`).join(', ')}`);
	if (diff.extra.length > 0) parts.push(`소스에 없음: ${diff.extra.map((n) => `/${n}`).join(', ')}`);
	return parts.join(' · ');
}
