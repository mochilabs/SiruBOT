import { createConfig } from '../../scripts/tsup.config.js';

export default createConfig({
	dts: false,
	splitting: false,
	// CJS로 번들링되는 workspace 패키지(예: @sirubot/prisma)가 ESM 안에서
	// 동적 require("...")를 호출할 때 node_modules를 정상 참조하도록 보장
	banner: {
		js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
	}
});
