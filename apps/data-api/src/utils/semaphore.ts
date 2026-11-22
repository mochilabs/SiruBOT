/** 동시 실행 수를 제한하는 세마포어 — 대기열은 FIFO예요. CPU를 많이 쓰는 렌더(애니메이션 WebP)가 몰리는 걸 막는 데 써요. */
export function createSemaphore(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
	let active = 0;
	const waiting: Array<() => void> = [];

	const release = (): void => {
		const next = waiting.shift();
		if (next) next();
		else active -= 1;
	};

	return async <T>(task: () => Promise<T>): Promise<T> => {
		if (active >= limit) {
			// 자리가 나면 release가 active를 그대로 넘겨줘서 (active는 줄이지 않아요) 바로 이어서 실행해요
			await new Promise<void>((resolve) => waiting.push(resolve));
		} else {
			active += 1;
		}
		try {
			return await task();
		} finally {
			release();
		}
	};
}
