export class SerialRateLimiter {
	private tail: Promise<void> = Promise.resolve();
	private last = Number.NEGATIVE_INFINITY;

	public constructor(
		private readonly minIntervalMs: number,
		private readonly now: () => number = Date.now,
		private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
	) {}

	public schedule<T>(task: () => Promise<T>): Promise<T> {
		const run = this.tail.then(async () => {
			const wait = this.last + this.minIntervalMs - this.now();
			if (wait > 0) await this.sleep(wait);
			this.last = this.now();
			return task();
		});
		this.tail = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}
}
