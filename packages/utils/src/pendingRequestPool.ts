// Owns capacity, timeout reclaim and register/complete only; schema validation, guildId/kind checks and payload assembly stay with each hub.
// Per-request metadata keyed by id should be set before register and cleaned in onTimeout: every timeout-payload path
// (timeout, capacity overflow, duplicate id) calls it, so cleaning there cannot leak.

export interface PendingRequestPoolLogger {
	warn(message: string): void;
}

export interface PendingRequestPoolOptions<TPayload> {
	/** Stops requests that never get a reply from piling up in the pending map. */
	capacity: number;
	logger?: PendingRequestPoolLogger;
	/** Also used for capacity-overflow and duplicate-id failures: "no bot reply" and "timeout" map to the same failure. */
	timeoutResult: (id: string) => TPayload;
	/** timeout 페이로드로 완료될 때마다 호출돼요 — id에 묶어둔 보조 메타데이터를 정리하는 용도예요. 모든 완료 경로에서 timeoutResult를 먼저 계산한 뒤 불려요(호출자가 페이로드에서 메타데이터를 읽을 수 있게) */
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

	/**
	 * Never rejects; always resolves with a completion payload.
	 * - Not completed within timeoutMs: reclaimed with the timeoutResult payload.
	 * - Pool full: fails immediately with timeoutResult; new requests don't evict pending ones.
	 * - Duplicate id: only the new registration fails; the existing wait stays.
	 * - onTimeout runs synchronously on the immediate-failure paths too.
	 */
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

	/** Returns false and does nothing if the request is no longer pending. */
	public resolve(id: string, payload: TPayload): boolean {
		const entry = this.entries.get(id);
		if (!entry) return false;
		clearTimeout(entry.timer);
		this.entries.delete(id);
		entry.resolve(payload);
		return true;
	}

	/** For requests that can never be answered (e.g. publish failed). False if not pending. */
	public fail(id: string, payload: TPayload): boolean {
		return this.resolve(id, payload);
	}

	/** 남은 대기 요청 전부를 즉시 완료해요 (서비스 종료 경로). 완료한 요청 수를 돌려주고 onTimeout은 부르지 않아요 — 호출자가 메타데이터 맵을 통째로 정리하면 돼요. */
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
