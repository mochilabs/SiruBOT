export interface Stoppable {
	name: string;
	stop(): Promise<void>;
}

export const STOPPABLES_TIMEOUT_MS = 5_000;

type LifecycleLogger = { warn: (msg: string) => unknown; error: (msg: string) => unknown };

export const stopAll = async (
	entries: readonly Stoppable[] | undefined,
	logger: LifecycleLogger,
	timeoutMs: number = STOPPABLES_TIMEOUT_MS
): Promise<void> => {
	if (!entries || entries.length === 0) return;
	const stops = Promise.all(
		entries.map(async (entry) => {
			try {
				await entry.stop();
			} catch (error) {
				logger.error(`Failed to stop ${entry.name} during shutdown: ${error}`);
			}
		})
	);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<'timeout'>((resolve) => {
		timer = setTimeout(() => resolve('timeout'), timeoutMs);
	});
	const result = await Promise.race([stops.then(() => 'done' as const), timedOut]);
	clearTimeout(timer);
	if (result === 'timeout') logger.warn(`Stoppables did not finish within ${timeoutMs}ms; continuing shutdown`);
};
