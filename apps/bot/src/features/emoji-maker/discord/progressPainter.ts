/** Discord 편집 rate limit 회피를 위해 일반 프레임은 간격 내 스킵하고 force 프레임만 직렬화해요. */
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
