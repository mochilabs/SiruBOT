import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: [
			// dashboard tsconfig paths(@/*)를 테스트 러너에도 맞춰요
			{ find: /^@\//, replacement: path.join(rootDir, "src") + "/" },
			// 루트 vitest.config.ts와 동일 — 워크스페이스 패키지는 소스로 참조 (stale dist 무관).
			// 서브경로는 확장자 없이 import하므로 .ts를 붙여 매핑해요.
			{ find: /^@sirubot\/utils$/, replacement: path.join(rootDir, "../../packages/utils/src/index.ts") },
			{ find: /^@sirubot\/utils\/(.*)$/, replacement: path.join(rootDir, "../../packages/utils/src/$1.ts") },
		],
	},
	test: {
		// DOM이 필요한 파일은 `// @vitest-environment happy-dom` 주석으로 개별 전환해요
		environment: "node",
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		testTimeout: 10_000,
	},
});
