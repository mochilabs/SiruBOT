import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import simpleImportSort from "eslint-plugin-simple-import-sort";

const eslintConfig = defineConfig([
	// eslint-config-next@16은 ESLint 9 flat config만 지원 (eslintrc 스타일 제거됨)
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
			// 루트 배럴(@sirubot/utils)은 node 전용 모듈(version·logger·embed·appEmoji 등)을 노출해요 —
			// 번들 사이드이펙트를 막으려면 클라이언트든 서버 라우트든 서브패스(@sirubot/utils/time 등)로만 임포트해요.
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
			// eslint-config-next@16에 동봉된 react-hooks v6는 React Compiler 세대 규칙을
			// 기본 에러로 띄운다. 기존 코드 패턴(setState in effect·렌더 중 ref 접근)과
			// 충돌하므로 일단 오프 — 컴파일러 마이그레이션 시 별도 정리.
			"react-hooks/set-state-in-effect": "off",
			"react-hooks/refs": "off",
			"react-hooks/purity": "off",
			"react-hooks/use-memo": "off",
			"react-hooks/incompatible-library": "off",
		},
	},
	// eslint-config-next 기본 ignores 명시 유지
	globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;