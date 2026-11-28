export interface AppLogger {
	info(msg: string, ...values: unknown[]): void;
	warn(msg: string, ...values: unknown[]): void;
	error(msg: string, ...values: unknown[]): void;
	debug(msg: string, ...values: unknown[]): void;
}
