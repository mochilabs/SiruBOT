import { ILogger, LogLevel } from '@sapphire/framework';
import { Logger, ILogObj, ISettingsParam } from 'tslog';

/**
 * Log level mapping from string to numeric values
 * Maps environment log levels to tslog numeric levels
 */
const LOG_LEVEL_MAP: Record<string, number> = {
	silly: 0,
	trace: 1,
	debug: 2,
	info: 3,
	warn: 4,
	error: 5,
	fatal: 6
} as const;

/**
 * Sapphire LogLevel to tslog level mapping
 * Sapphire uses multiples of 10, tslog uses 0-6
 */
const SAPPHIRE_TO_TSLOG_LEVEL_MAP: Record<LogLevel, number> = {
	[LogLevel.Trace]: 1,
	[LogLevel.Debug]: 2,
	[LogLevel.Info]: 3,
	[LogLevel.Warn]: 4,
	[LogLevel.Error]: 5,
	[LogLevel.Fatal]: 6,
	[LogLevel.None]: 6
} as const;

/**
 * Custom logger implementation that bridges Sapphire's ILogger interface
 * with tslog's Logger functionality
 */
export class SapphireInterfaceLogger extends Logger<ILogObj> implements ILogger {
	constructor(settings?: ISettingsParam<ILogObj>) {
		super(settings);
	}

	has(level: LogLevel): boolean {
		const tslogLevel = SapphireInterfaceLogger.transformSapphireLevel(level);
		return tslogLevel >= this.settings.minLevel;
	}

	write(level: LogLevel, ...values: readonly unknown[]): void {
		const tslogLevel = SapphireInterfaceLogger.transformSapphireLevel(level);
		const levelName = LogLevel[level] || 'UNKNOWN';

		this.log(tslogLevel, `[${levelName}]`, ...values);
	}

	public static transformSapphireLevel(level: LogLevel): number {
		return SAPPHIRE_TO_TSLOG_LEVEL_MAP[level] ?? LOG_LEVEL_MAP.info;
	}
}
