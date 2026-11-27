import { createConfig } from "../../scripts/tsup.config.js";

export default createConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.spec.ts"],
  dts: false,
  splitting: false,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
