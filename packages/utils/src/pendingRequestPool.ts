export interface PendingRequestPoolLogger {
	warn(message: string): void;
}

export interface PendingRequestPoolOptions<TPayload> {
	capacity: number;
	logger?: PendingRequestPoolLogger;
	timeoutResult: (id: string) => TPayload;
	onTimeout?: (id: string) => void;
}

interface PendingEntry<TPayload> {
	resolve: (payload: TPayload) => void;
	timer: ReturnType<typeof setTimeout>;
}

export class PendingRequestPool<TPayload> {
	private readonly entries = new Map<string, PendingEntry<TPayload>>();

	public constructor(private readonly options: PendingRequestPoolOptions<TPayload>) {}

	public get size(): number {
		return this.entries.size;
	}

	public register(id: string, timeoutMs: number): Promise<TPayload> {
		if (this.entries.size >= this.options.capacity) {
			this.options.logger?.warn(`Pending request pool limit reached (${this.options.capacity}), failing request ${id} immediately`);
			const payload = this.options.timeoutResult(id);
			this.options.onTimeout?.(id);
			return Promise.resolve(payload);
		}
		if (this.entries.has(id)) {
			this.options.logger?.warn(`Duplicate pending request id ${id}, failing the new registration immediately`);
			const payload = this.options.timeoutResult(id);
			this.options.onTimeout?.(id);
			return Promise.resolve(payload);
		}
		let resolve!: (payload: TPayload) => void;
		const promise = new Promise<TPayload>((res) => {
			resolve = res;
		});
		this.entries.set(id, {
			resolve,
			timer: setTimeout(() => {
				this.entries.delete(id);
				const payload = this.options.timeoutResult(id);
				this.options.onTimeout?.(id);
				resolve(payload);
			}, timeoutMs)
		});
		return promise;
	}

	public resolve(id: string, payload: TPayload): boolean {
		const entry = this.entries.get(id);
		if (!entry) return false;
		clearTimeout(entry.timer);
		this.entries.delete(id);
		entry.resolve(payload);
		return true;
	}

	public fail(id: string, payload: TPayload): boolean {
		return this.resolve(id, payload);
	}

	// Does not call onTimeout; callers clear metadata maps directly.
	public failAll(createPayload: (id: string) => TPayload): number {
		const entries = [...this.entries];
		this.entries.clear();
		for (const [id, entry] of entries) {
			clearTimeout(entry.timer);
			entry.resolve(createPayload(id));
		}
		return entries.length;
	}
}
