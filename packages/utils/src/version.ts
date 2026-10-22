import { execSync } from 'child_process';

function tryExec(command: string, cwd?: string): string | null {
	try {
		return execSync(command, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return null;
	}
}

function getRepoTopLevel(startCwd: string): string | null {
	const top = tryExec('git rev-parse --show-toplevel', startCwd);
	return top || null;
}

function isGitDirty(): boolean {
	const top = getRepoTopLevel(process.cwd());
	const dirty = top && tryExec('git status --porcelain', top);
	return typeof dirty === 'string' && dirty.length > 0;
}

function getGitHash(): string {
	if (process.env.GIT_HASH) return process.env.GIT_HASH;
	if (process.env.npm_package_gitHead) return process.env.npm_package_gitHead;

	const top = getRepoTopLevel(process.cwd());
	const hash = top && tryExec('git log -1 --pretty=format:"%H"', top);
	return hash || 'unknown';
}

function getGitBranch(): string {
	if (process.env.GIT_BRANCH) return process.env.GIT_BRANCH;

	const top = getRepoTopLevel(process.cwd());
	const branch = top && tryExec('git rev-parse --abbrev-ref HEAD', top);
	return branch || 'unknown';
}

class VersionInfo {
	private static instance: VersionInfo;
	// git 정보는 첫 사용 시점에 계산해요 — 모듈 import만으로 git 프로세스 4회를 스폰하지 않기 위함이에요.
	private gitDirty?: boolean;
	private gitHash?: string;
	private gitBranch?: string;

	private constructor() {}

	public static getInstance(): VersionInfo {
		if (!VersionInfo.instance) {
			VersionInfo.instance = new VersionInfo();
		}
		return VersionInfo.instance;
	}

	public getVersion(): string {
		return process.env.VERSION || 'unknown';
	}

	public getGitHash(): string {
		return this.resolveGitHash().slice(0, 7);
	}

	public getGitFullHash(): string {
		return this.resolveGitHash();
	}

	public isGitDirty(): boolean {
		this.gitDirty ??= isGitDirty();
		return this.gitDirty;
	}

	public getGitBranch(): string {
		this.gitBranch ??= getGitBranch();
		return this.gitBranch;
	}

	public getNodeVersion(): string {
		return process.version;
	}

	private resolveGitHash(): string {
		this.gitHash ??= getGitHash();
		return this.gitHash;
	}
}

export const versionInfo = VersionInfo.getInstance();
