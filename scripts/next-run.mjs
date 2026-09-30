#!/usr/bin/env node
/**
 * Next.js 실행 래퍼 (dev/build 공용).
 *
 * android는 Next.js가 공식 SWC 네이티브 바이너리를 배포하지 않아 `next dev` / `next build`가
 * "Failed to load SWC binary for android/arm64"로 즉시 실패한다.
 * 이 스크립트는 android에서만 다음을 적용한다.
 *   1. `NEXT_TEST_WASM_DIR` 로 wasm SWC 바이너리를 주입한다.
 *   2. turbopack 은 네이티브 바이너리 전용이라 webpack 으로 대체한다.
 *
 * 그 외 플랫폼에서는 인자를 그대로 next 에 전달하므로 CI/Docker 빌드는 동작이 같다.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const nextBin = require.resolve('next/dist/bin/next');
const args = process.argv.slice(2);

let env = process.env;
let command = args;

if (process.platform === 'android') {
	let hasNative = false;
	try {
		require.resolve(`@next/swc-android-${process.arch}`);
		hasNative = true;
	} catch {}

	let wasmDir = null;
	try {
		wasmDir = path.dirname(require.resolve('@next/swc-wasm-nodejs/package.json'));
	} catch {}

	if (!hasNative && wasmDir) {
		env = { ...env, NEXT_TEST_WASM_DIR: wasmDir };
		command = args.map((arg) => (arg === '--turbopack' || arg === '--turbo' ? '--webpack' : arg));
		console.warn('[next-run] android: wasm SWC 를 사용합니다 (turbopack → webpack).');
	}
}

const result = spawnSync(process.execPath, [nextBin, ...command], { stdio: 'inherit', env });
process.exit(result.status ?? 1);
