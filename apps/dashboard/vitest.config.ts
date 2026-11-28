import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^@\//, replacement: path.join(rootDir, "src") + "/" },
			{ find: /^@sirubot\/utils$/, replacement: path.join(rootDir, "../../packages/utils/src/index.ts") },
			{ find: /^@sirubot\/utils\/(.*)$/, replacement: path.join(rootDir, "../../packages/utils/src/$1.ts") },
			{ find: /^@sirubot\/cards$/, replacement: path.join(rootDir, "../../packages/cards/src/index.ts") },
		],
	},
	test: {
		environment: "node",
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		testTimeout: 10_000,
		// turbo 병렬 테스트 시 시스템 리소스 고갈 방지
		maxWorkers: 2,
	},
});
