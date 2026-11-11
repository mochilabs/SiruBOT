/** 애플리케이션 계층이 주입받는 최소 로거 계약 — Sapphire 로거나 테스트용 가짜 모두 이 모양이면 돼요. */
export interface AppLogger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}
