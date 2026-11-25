import { createConfig } from '../../scripts/tsup.config.js';

export default createConfig({
	// dist/*.test.js가 vitest에 한 번 더 잡히지 않게 테스트는 빌드에서 빼요.
	entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts'],
	dts: false,
	splitting: false,
	// CJS로 번들된 workspace 패키지가 ESM 안에서 동적 require를 쓸 때 node_modules를 찾게 해요.
	banner: {
		js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
	}
});
