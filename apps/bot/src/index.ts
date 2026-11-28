import { setup } from './core/setup.ts';
import { main } from './core/bootstrap.ts';
import { getConfig } from './lib/config.ts';

// 진입점에서 동기로 검증해 필수 키 누락 시 즉시 exit(1) 해요.
try {
	getConfig();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}

void setup();
void main();
