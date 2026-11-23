"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * 브라우저·OS UI 색(`theme-color`)을 현재 테마의 하단 탭바 면(--surface-1)에 맞춰요.
 * 서버가 내려주는 값은 다크 기본값 하나라서, 라이트로 바꾸면 탭바(흰색)와 OS 영역 색이 달라져요.
 */
export function ThemeColorSync() {
	const { resolvedTheme } = useTheme();

	useEffect(() => {
		const color = getComputedStyle(document.documentElement).getPropertyValue("--surface-1").trim();
		if (!color) return;
		const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
		if (metas.length === 0) {
			const meta = document.createElement("meta");
			meta.name = "theme-color";
			meta.content = color;
			document.head.appendChild(meta);
			return;
		}
		metas.forEach((meta) => {
			meta.content = color;
		});
	}, [resolvedTheme]);

	return null;
}
