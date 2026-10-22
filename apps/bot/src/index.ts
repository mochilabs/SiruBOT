import { setup } from './core/setup.ts';
import { main } from './core/bootstrap.ts';
import { validateEnv } from './core/env.ts';

// 환경 변수 fail-closed 검증 — 필수 키 누락/형식 오류면 로그를 남기고 즉시 종료해요.
// (parseEnvOrExit 체계와 동일한 방향. bootstrap main() 안에서 throw하면 unhandledRejection로만 남아
//  프로세스가 살 수 있으므로, 진입점에서 동기로 검증하고 exit(1)으로 확정해요.)
try {
	validateEnv();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}

void setup();
void main();
