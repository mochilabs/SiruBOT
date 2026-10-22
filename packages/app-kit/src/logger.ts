import { Logger, type ILogObj, type ISettingsParam } from 'tslog';

// packages/utils/src/logger.ts의 getLoggerSettings와 같은 설정이에요 — 앱별 로그 포맷·LOGLEVEL 해석이 갈라지지 않게 맞춰요.
const LOG_LEVEL_MAP: Record<string, number> = {
	silly: 0,
	trace: 1,
	debug: 2,
	info: 3,
	warn: 4,
	error: 5,
	fatal: 6
};

/** LOGLEVEL 환경변수 해석 — 숫자면 그대로, 아니면 tslog 레벨 이름(기본 info). 테스트에서 계약을 고정해요. */
export function resolveMinLevel(): number {
	if (typeof process === 'undefined' || !process.env) return 3; // process.env가 없으면 info로
	const raw = process.env.LOGLEVEL;
	if (!raw) return 3; // info
	const asNumber = Number(raw);
	if (!Number.isNaN(asNumber)) return asNumber;
	return LOG_LEVEL_MAP[raw.toLowerCase()] ?? 3;
}

/**
 * 앱 이름으로 루트 로거를 만들고 서브로거 팩토리를 돌려줘요.
 * `export const getLogger = getAppLogger('DataApi')`처럼 쓰면 기존 apps별 getLogger(name)과 같은 사용법이에요.
 */
export function getAppLogger(appName: string, settings?: Partial<ISettingsParam<ILogObj>>): (name: string) => Logger<ILogObj> {
	const root = new Logger<ILogObj>({
		name: appName,
		minLevel: resolveMinLevel(),
		type: 'pretty',
		hideLogPositionForProduction: typeof process !== 'undefined' && process.env?.NODE_ENV === 'production',
		...settings
	});
	return (name: string) => root.getSubLogger({ name });
}
