import type { Stoppable } from './lifecycle.ts';

export class KeyedTimers implements Stoppable {
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	private stopped = false;

	public constructor(public readonly name: string) {}

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
