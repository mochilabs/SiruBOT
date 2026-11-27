export interface CommandNameDiff {
	missing: string[];
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

export function formatCommandDiff(diff: CommandNameDiff): string {
	const parts: string[] = [];
	if (diff.missing.length > 0) parts.push(`등록 안 됨: ${diff.missing.map((n) => `/${n}`).join(', ')}`);
	if (diff.extra.length > 0) parts.push(`소스에 없음: ${diff.extra.map((n) => `/${n}`).join(', ')}`);
	return parts.join(' · ');
}
