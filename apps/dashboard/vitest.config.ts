import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			// dashboard tsconfig paths(@/*)를 테스트 러너에도 맞춰요
			"@": path.join(rootDir, "src"),
		},
	},
	test: {
		// DOM이 필요한 파일은 `// @vitest-environment happy-dom` 주석으로 개별 전환해요
		environment: "node",
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		testTimeout: 10_000,
	},
});