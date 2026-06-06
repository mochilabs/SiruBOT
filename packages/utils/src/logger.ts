import pino from 'pino';

export type LogMeta = Record<string, unknown>;

export class SiruLogger {
	private pinoLogger: pino.Logger;

	constructor(name: string) {
		const level = process.env.LOG_LEVEL || 'info';

		const isDevelopment = process.env.NODE_ENV !== 'production' || process.stdout?.isTTY;

		this.pinoLogger = pino({
			name,
			level,
			transport: isDevelopment ? { target: 'pino-pretty', options: { colorize: true } } : undefined
		});
	}

	public info(message: string, meta?: LogMeta): void {
		this.pinoLogger.info(meta || {}, message);
	}

	public debug(message: string, meta?: LogMeta): void {
		this.pinoLogger.debug(meta || {}, message);
	}

	public warn(message: string, meta?: LogMeta): void {
		this.pinoLogger.warn(meta || {}, message);
	}

	public trace(message: string, meta?: LogMeta): void {
		this.pinoLogger.trace(meta || {}, message);
	}

	public fatal(message: string, errOrMeta?: unknown): void {
		let meta: LogMeta = {};
		if (errOrMeta instanceof Error) {
			meta = {
				error_name: errOrMeta.name,
				error_message: errOrMeta.message,
				error_stack: errOrMeta.stack
			};
		} else if (typeof errOrMeta === 'object' && errOrMeta !== null) {
			meta = errOrMeta as LogMeta;
		}

		this.pinoLogger.fatal(meta, message);
	}

	public error(message: string, errOrMeta?: unknown): void {
		let meta: LogMeta = {};
		if (errOrMeta instanceof Error) {
			meta = {
				error_name: errOrMeta.name,
				error_message: errOrMeta.message,
				error_stack: errOrMeta.stack
			};
		} else if (typeof errOrMeta === 'object' && errOrMeta !== null) {
			meta = errOrMeta as LogMeta;
		}

		this.pinoLogger.error(meta, message);
	}
}

export function createLogger(name: string): SiruLogger {
	return new SiruLogger(name);
}
