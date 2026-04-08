import { Logger, ILogObj, ISettingsParam } from 'tslog';

const LOG_LEVEL_MAP: Record<string, number> = {
	silly: 0,
	trace: 1,
	debug: 2,
	info: 3,
	warn: 4,
	error: 5,
	fatal: 6
};

function resolveMinLevel(): number {
	if (typeof process === 'undefined' || !process.env) return 3; // Default to info if process.env is not available
	const raw = process.env.LOGLEVEL;
	if (!raw) return 3; // info
	const asNumber = Number(raw);
	if (!Number.isNaN(asNumber)) return asNumber;
	return LOG_LEVEL_MAP[raw.toLowerCase()] ?? 3;
}

export function getLoggerSettings(name: string, settings?: Partial<ISettingsParam<ILogObj>>): ISettingsParam<ILogObj> {
	return {
		name,
		minLevel: resolveMinLevel(),
		type: 'pretty',
		hideLogPositionForProduction: typeof process !== 'undefined' && process.env?.NODE_ENV === 'production',
		...settings
	};
}

export function createLogger(name: string, settings?: Partial<ISettingsParam<ILogObj>>): Logger<ILogObj> {
	return new Logger<ILogObj>(getLoggerSettings(name, settings));
}
