/**
 * Redis request/reply "pending map" 공용 풀 — data-api 허브(guildData/jtcSetup/playerWeb)와
 * notifier webhookHub에 복제돼 있던 requestId별 대기 요청 레지스트리의 공용 버전이에요.
 *
 * 풀은 용량 상한·타임아웃 회수·등록/완료 기계만 담당해요 — 응답 스키마 검증, guildId/kind 일치 검사,
 * 성공/실패 페이로드 조립 같은 도메인 판단은 호출자(각 허브)에 남아요.
 *
 * 호출자가 요청당 메타데이터(예: guildId)를 id에 묶어둬야 한다면 register 전에 심어두고
 * onTimeout에서 함께 정리하세요 — timeout 페이로드로 완료되는 모든 경로(대기 초과·용량 초과 즉시 실패·
 * 중복 id 재등록)에서 onTimeout이 불리므로 같은 자리에서 정리하면 맵 누수가 없어요.
 * timeoutResult를 먼저 계산하는 순서 계약은 options.onTimeout 문서 참조.
 */

export interface PendingRequestPoolLogger {
	/** 용량 초과·중복 id 등 회수 경고를 남길 로거 — 없으면 로그 없이 동작해요 */
	warn(message: string): void;
}

export interface PendingRequestPoolOptions<TPayload> {
	/** 동시 대기 요청 상한 — 응답을 못 받는 요청이 pending map에 쌓이는 누수를 방지해요 */
	capacity: number;
	logger?: PendingRequestPoolLogger;
	/**
	 * 타임아웃 실패 페이로드 팩토리 — 대기 시간 초과뿐 아니라 용량 초과·중복 id 즉시 실패에도 같은
	 * 페이로드로 완료해요 (봇 응답 없음과 타임아웃을 같은 실패로 매핑하는 기존 허브들의 규칙이에요).
	 */
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

	/** 현재 대기 중인 요청 수예요 */
	public get size(): number {
		return this.entries.size;
	}

	/**
	 * 요청을 등록하고 응답 대기 Promise를 반환해요 — 반환된 Promise는 절대 reject하지 않고 완료 페이로드로 resolve돼요.
	 *
	 * - timeoutMs 안에 resolve/fail로 완료되지 않으면 타이머가 회수해 timeoutResult 페이로드로 완료해요.
	 * - 용량이 가득 차면 등록하지 않고 즉시 timeoutResult 페이로드로 완료해요 — 새 요청이 pending을 밀어내지 않아요.
	 * - 같은 id가 이미 대기 중이면 새 등록만 즉시 실패하고 기존 대기는 그대로 유지해요.
	 * - 즉시 실패 경로(용량 초과·중복 id)에서도 onTimeout은 동기적으로 불려요.
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

	/** 대기 중 요청을 주어진 페이로드로 완료해요. 대기 중이 아니면(이미 완료·회수) false를 돌려주고 아무 일도 하지 않아요. */
	public resolve(id: string, payload: TPayload): boolean {
		const entry = this.entries.get(id);
		if (!entry) return false;
		clearTimeout(entry.timer);
		this.entries.delete(id);
		entry.resolve(payload);
		return true;
	}

	/** publish 실패 등 응답이 절대 오지 않게 된 요청을 즉시 실패 페이로드로 완료해요. 대기 중이 아니면 false예요. */
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
