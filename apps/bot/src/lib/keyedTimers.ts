import type { Stoppable } from './lifecycle.ts';

/**
 * 키(길드 등)마다 하나씩 걸리는 타이머의 소유자예요. 같은 키로 다시 걸면 이전 타이머는 취소돼요.
 * stop()이 남은 타이머를 모두 해제하고 이후 set은 무시해서, 종료가 시작된 뒤에는 콜백이 발화하지 않아요.
 */
export class KeyedTimers implements Stoppable {
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	private stopped = false;

	public constructor(public readonly name: string) {}

	/** 콜백이 발화하는 순간 키는 이미 비워진 상태예요 */
	public set(key: string, callback: () => void | Promise<void>, delayMs: number): void {
		if (this.stopped) return;
		this.clear(key);
		const timer = setTimeout(() => {
			this.timers.delete(key);
			void callback();
		}, delayMs);
		this.timers.set(key, timer);
	}

	public has(key: string): boolean {
		return this.timers.has(key);
	}

	public clear(key: string): void {
		const timer = this.timers.get(key);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(key);
		}
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
	}
}
