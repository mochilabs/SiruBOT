/**
 * 종료 시 정리가 필요한 상태의 소유자가 지키는 수명주기 계약이에요.
 * - durable-pending(디바운스 저장·버퍼 쓰기·대기 중인 리포트)은 stop()에서 지금 바로 쓰고 비워요.
 * - 타이머·인터벌은 stop()에서 해제해요.
 * stop()은 쓰기 대상(Redis/DB)이 닫히기 전에 불려요 (core/shutdown.ts). 한 번 stop된 소유자는 새 일을 받지 않아야 해요.
 */
export interface Stoppable {
	name: string;
	stop(): Promise<void>;
}

/** 모든 stop()을 한꺼번에 기다리는 종료 단계의 상한(ms) — 멈춘 flush 하나가 프로세스 종료를 붙잡지 않게 해요 */
export const STOPPABLES_TIMEOUT_MS = 5_000;

type LifecycleLogger = { warn: (msg: string) => unknown; error: (msg: string) => unknown };

/**
 * 등록된 stop()을 모두 병렬로 실행해요. 하나가 던져도 로그만 남기고 나머지는 계속돼요.
 * 전체 단계는 timeoutMs로 묶여서, 시간이 지나면 기다리지 않고 다음 종료 단계로 넘어가요.
 */
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
