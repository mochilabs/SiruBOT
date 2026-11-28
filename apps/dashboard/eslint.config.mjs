import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import simpleImportSort from "eslint-plugin-simple-import-sort";

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTypescript,
	{
		plugins: {
			"simple-import-sort": simpleImportSort,
		},
		rules: {
			"simple-import-sort/imports": [
				"error",
				{
					groups: [
						["^\\u0000"],
						["^react", "^next", "^@?\\w"],
						["^@(/.*|$)"],
						["^\\.\\.(?!/?$)", "^\\.\\./?$"],
						["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
						["^.+\\.css$"],
					],
				},
			],
			"simple-import-sort/exports": "error",
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "@sirubot/utils",
							message:
								"루트 배럴은 node 전용 모듈을 노출해요 — @sirubot/utils/time 등 서브패스로 임포트하세요.",
						},
					],
				},
			],
			// react-hooks v6 Compiler 규칙이 기존 패턴(setState in effect·렌더 중 ref 접근)과 충돌해 비활성화
			"react-hooks/set-state-in-effect": "off",
			"react-hooks/refs": "off",
			"react-hooks/purity": "off",
			"react-hooks/use-memo": "off",
			"react-hooks/incompatible-library": "off",
		},
	},
	globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;