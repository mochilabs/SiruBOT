import { createConfig } from '../../scripts/tsup.config.js';

export default createConfig({
	entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts', '!src/**/*.testing.ts'],
	dts: false,
	splitting: true,
	// CJS workspace 패키지(@sirubot/prisma 등)의 동적 require가 ESM에서 node_modules를 찾도록 보장
	banner: {
		js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
	}
});
