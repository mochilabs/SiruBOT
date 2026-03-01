export interface ILogger {
	info(...values: readonly unknown[]): void;
	warn(...values: readonly unknown[]): void;
	error(...values: readonly unknown[]): void;
	debug?(...values: readonly unknown[]): void;
}
