import { Logger, type ILogObj, type ISettingsParam } from 'tslog';

const DEFAULT_MIN_LEVEL = 3;
const LOG_LEVEL_MAP: Record<string, number> = {
	silly: 0,
	trace: 1,
	debug: 2,
	info: 3,
	warn: 4,
	error: 5,
	fatal: 6
};

export function resolveMinLevel(): number {
	const raw = typeof process === 'undefined' ? undefined : process.env?.LOGLEVEL;
	if (!raw) return DEFAULT_MIN_LEVEL;
	const asNumber = Number(raw);
	if (!Number.isNaN(asNumber)) return asNumber;
	return LOG_LEVEL_MAP[raw.toLowerCase()] ?? DEFAULT_MIN_LEVEL;
}

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
