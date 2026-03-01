import { Logger, ILogObj } from 'tslog';

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
	const raw = process.env.LOGLEVEL;
	if (!raw) return 3; // info
	const asNumber = Number(raw);
	if (!Number.isNaN(asNumber)) return asNumber;
	return LOG_LEVEL_MAP[raw.toLowerCase()] ?? 3;
}

export let logger: Logger<ILogObj> | null = null;

export function getLogger(name: string) {
	if (!logger) {
		logger = new Logger<ILogObj>({
			name: 'ShardManager',
			minLevel: resolveMinLevel(),
			type: 'pretty',
			hideLogPositionForProduction: process.env.NODE_ENV === 'production'
		});
	}

	return logger.getSubLogger({ name });
}
