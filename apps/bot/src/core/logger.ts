import { ILogger, LogLevel } from '@sapphire/framework';
import { SiruLogger, createLogger, LogMeta } from '@sirubot/utils';

export class SapphireInterfaceLogger implements ILogger {
	public siruLogger: SiruLogger;

	constructor(name: string = 'Sapphire') {
		this.siruLogger = createLogger(name);
	}

	public getSubLogger(settings: { name: string }): SapphireInterfaceLogger {
		return new SapphireInterfaceLogger(settings.name);
	}

	public has(level: LogLevel): boolean {
		return level !== LogLevel.None;
	}

	public trace(...values: readonly unknown[]): void {
		this.write(LogLevel.Trace, ...values);
	}

	public debug(...values: readonly unknown[]): void {
		this.write(LogLevel.Debug, ...values);
	}

	public info(...values: readonly unknown[]): void {
		this.write(LogLevel.Info, ...values);
	}

	public warn(...values: readonly unknown[]): void {
		this.write(LogLevel.Warn, ...values);
	}

	public error(...values: readonly unknown[]): void {
		this.write(LogLevel.Error, ...values);
	}

	public fatal(...values: readonly unknown[]): void {
		this.write(LogLevel.Fatal, ...values);
	}

	public write(level: LogLevel, ...values: readonly unknown[]): void {
		if (level === LogLevel.None) return;

		const [first, second, ...rest] = values;
		let methodName: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

		switch (level) {
			case LogLevel.Trace: methodName = 'trace'; break;
			case LogLevel.Debug: methodName = 'debug'; break;
			case LogLevel.Info: methodName = 'info'; break;
			case LogLevel.Warn: methodName = 'warn'; break;
			case LogLevel.Error: methodName = 'error'; break;
			case LogLevel.Fatal: methodName = 'fatal'; break;
			default: methodName = 'info';
		}

		// Handle error cases specifically
		if (methodName === 'error' || methodName === 'fatal') {
			if (typeof first === 'string' && second instanceof Error) {
				this.siruLogger[methodName](first, second);
				return;
			}
			if (first instanceof Error) {
				this.siruLogger[methodName]('sapphire.internal.error', first);
				return;
			}
		}

		// Handle standard structured logging: logger.info('domain.action', { meta: 'data' })
		if (typeof first === 'string' && typeof second === 'object' && second !== null && !(second instanceof Error) && rest.length === 0) {
			this.siruLogger[methodName](first, second as LogMeta);
			return;
		}

		// Handle single string message: logger.info('something')
		if (typeof first === 'string' && second === undefined && rest.length === 0) {
			if (first.includes('.')) {
				this.siruLogger[methodName](first, {});
			} else {
				this.siruLogger[methodName]('sapphire.internal', { message: first });
			}
			return;
		}

		// Handle legacy/unknown Sapphire formats
		this.siruLogger[methodName]('sapphire.internal', { 
			message: typeof first === 'string' ? first : 'Unknown log format', 
			raw_values: values 
		});
	}
}
