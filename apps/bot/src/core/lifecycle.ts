export interface LifecycleLogger {
	error: (message: string) => unknown;
}

interface LifecycleComponent {
	name: string;
	stop?: () => Promise<void> | void;
}

/**
 * 컴포넌트 등록 순서의 역순으로 종료하는 작은 수명주기 관리자예요.
 * 한 컴포넌트의 stop이 실패해도 로그만 남기고 나머지 종료를 이어가요. shutdown은 멱등이에요.
 */
export class Lifecycle {
	private readonly components: LifecycleComponent[] = [];
	private shutdownPromise: Promise<void> | null = null;

	public register(name: string, stop?: () => Promise<void> | void): void {
		this.components.push({ name, stop });
	}

	public shutdown(logger: LifecycleLogger): Promise<void> {
		this.shutdownPromise ??= this.runStops(logger);
		return this.shutdownPromise;
	}

	private async runStops(logger: LifecycleLogger): Promise<void> {
		for (const component of [...this.components].reverse()) {
			if (!component.stop) continue;
			try {
				await component.stop();
			} catch (error) {
				logger.error(`Failed to stop ${component.name}: ${error}`);
			}
		}
	}
}
