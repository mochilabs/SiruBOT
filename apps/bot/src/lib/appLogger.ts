/**
 * 애플리케이션 계층·서비스가 주입받는 최소 로거 계약 — Sapphire 로거나 테스트용 가짜 모두 이 모양이면 돼요.
 * 오류 객체처럼 메시지 뒤에 붙는 값(values)은 Sapphire 로거가 그대로 받아 출력해요.
 */
export interface AppLogger {
	info(msg: string, ...values: unknown[]): void;
	warn(msg: string, ...values: unknown[]): void;
	error(msg: string, ...values: unknown[]): void;
	debug(msg: string, ...values: unknown[]): void;
}
