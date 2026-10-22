import { beforeEach, describe, expect, it, vi } from 'vitest';

// versionInfo는 git execSync를 모듈 로드 시점이 아니라 첫 getter 호출 시에만 수행해요 —
// 루트 배럴 import만으로 프로세스가 스폰되지 않는다는 계약을 고정해요.
const execSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execSync }));

function mockGit({ dirty = true, hash = 'abcdef1234', branch = 'main' } = {}): void {
	execSync.mockImplementation((command: string) => {
		if (command.includes('rev-parse --show-toplevel')) return Buffer.from('/repo\n');
		if (command.includes('status --porcelain')) return Buffer.from(dirty ? ' M file.ts\n' : '');
		if (command.includes('log -1')) return Buffer.from(hash);
		if (command.includes('abbrev-ref')) return Buffer.from(`${branch}\n`);
		return Buffer.from('');
	});
}

describe('versionInfo lazy git lookup', () => {
	beforeEach(() => {
		vi.resetModules();
		execSync.mockReset();
	});

	it('모듈 임포트와 git 비의존 getter는 git 프로세스를 스폰하지 않아요', async () => {
		execSync.mockImplementation(() => Buffer.from(''));
		const { versionInfo } = await import('./version.js');
		expect(execSync).not.toHaveBeenCalled();

		versionInfo.getVersion();
		versionInfo.getNodeVersion();
		expect(execSync).not.toHaveBeenCalled();
	});

	it('첫 git 정보 접근 시에만 git을 호출하고 이후에는 캐시해요', async () => {
		mockGit();
		const { versionInfo } = await import('./version.js');
		expect(versionInfo.getGitHash()).toBe('abcdef1');
		expect(versionInfo.getGitFullHash()).toBe('abcdef1234');
		expect(versionInfo.isGitDirty()).toBe(true);
		expect(versionInfo.getGitBranch()).toBe('main');
		expect(execSync.mock.calls.length).toBeGreaterThan(0);

		const callsAfterFirstAccess = execSync.mock.calls.length;
		versionInfo.getGitHash();
		versionInfo.getGitFullHash();
		versionInfo.isGitDirty();
		versionInfo.getGitBranch();
		expect(execSync.mock.calls.length).toBe(callsAfterFirstAccess);
	});

	it('GIT_HASH/GIT_BRANCH 환경변수가 있으면 git 호출 없이それを 써요', async () => {
		execSync.mockImplementation(() => {
			throw new Error('not a git repo');
		});
		process.env.GIT_HASH = 'envhash12345';
		process.env.GIT_BRANCH = 'env-branch';
		try {
			const { versionInfo } = await import('./version.js');
			expect(versionInfo.getGitFullHash()).toBe('envhash12345');
			expect(versionInfo.getGitHash()).toBe('envhash');
			expect(versionInfo.getGitBranch()).toBe('env-branch');
		} finally {
			delete process.env.GIT_HASH;
			delete process.env.GIT_BRANCH;
		}
	});

	it('git이 없어도 unknown으로 폴백하고 throw하지 않아요', async () => {
		execSync.mockImplementation(() => {
			throw new Error('not a git repo');
		});
		const { versionInfo } = await import('./version.js');
		expect(versionInfo.getGitFullHash()).toBe('unknown');
		expect(versionInfo.getGitBranch()).toBe('unknown');
		expect(versionInfo.isGitDirty()).toBe(false);
	});
});
