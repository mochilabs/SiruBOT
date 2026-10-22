import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // 테스트에서 워크스페이스 패키지를 소스로 직접 참조 (dist 빌드 불필요).
      // 서브경로(@sirubot/utils/redisEnvelope)가 인덱스 경로로 덮이지 않게 정확히 매칭해요.
      // 서브경로는 확장자 없이 import하므로 .ts를 붙여 매핑해요 (미부착 시 "Cannot find package").
      { find: /^@sirubot\/utils$/, replacement: path.join(rootDir, "packages/utils/src/index.ts") },
      { find: /^@sirubot\/utils\/(.*)$/, replacement: path.join(rootDir, "packages/utils/src/$1.ts") },
      { find: /^@sirubot\/app-kit$/, replacement: path.join(rootDir, "packages/app-kit/src/index.ts") },
      // dashboard tsconfig paths(@/*) — 워크스페이스 스크립트가 이 루트 config를 공유하므로 함께 등록.
      { find: /^@\//, replacement: path.join(rootDir, "apps/dashboard/src") + "/" },
    ],
  },
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    testTimeout: 10_000,
  },
});
