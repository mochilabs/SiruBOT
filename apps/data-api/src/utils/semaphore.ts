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
			// Hand off active slot directly on release without decrementing.
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
