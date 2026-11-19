/**
 * 진행 화면 편집을 적당히 솎아내는 도우미예요. 디스코드 메시지 편집은 초당 몇 번으로 제한돼서,
 * 단계별 미리보기(GPU면 0.1초마다)를 전부 보내지 않고 최소 간격마다 최신 것만 보내요.
 *
 * - `paint(build)`: 편집 중이거나 간격이 덜 찼으면 이번 프레임은 버려요.
 * - `paint(build, { force: true })`: 단계가 바뀐 프레임 — 버리지 않고 앞 편집이 끝나면 이어서 보내요.
 * - `settle()`: 진행 중인 편집을 기다려요. 최종 화면을 보내기 전에 불러서 늦은 프레임이 덮어쓰지 않게 해요.
 * 편집 실패는 onError로만 알리고 생성 흐름을 멈추지 않아요.
 */
export interface ProgressPainter {
	paint(build: () => Promise<unknown>, options?: { force?: boolean }): void;
	settle(): Promise<void>;
}

export function createProgressPainter(options: { minIntervalMs: number; now?: () => number; onError?: (error: unknown) => void }): ProgressPainter {
	const now = options.now ?? Date.now;
	let lastStartedAt = -Infinity;
	let busy = false;
	let chain: Promise<void> = Promise.resolve();

	const run = (build: () => Promise<unknown>) => {
		busy = true;
		lastStartedAt = now();
		return build()
			.then(() => undefined)
			.catch((error) => options.onError?.(error))
			.finally(() => {
				busy = false;
			});
	};

	return {
		paint(build, { force = false } = {}) {
			if (force) {
				chain = chain.then(() => run(build));
				return;
			}
			if (busy || now() - lastStartedAt < options.minIntervalMs) return;
			chain = chain.then(() => run(build));
		},
		settle: () => chain
	};
}
