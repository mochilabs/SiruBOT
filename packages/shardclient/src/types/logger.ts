export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface ILogger {
  has(level: LogLevel): boolean;
  trace(...values: readonly unknown[]): void;
  debug(...values: readonly unknown[]): void;
  info(...values: readonly unknown[]): void;
  warn(...values: readonly unknown[]): void;
  error(...values: readonly unknown[]): void;
  fatal(...values: readonly unknown[]): void;
  write(level: LogLevel, ...values: readonly unknown[]): void;
}
