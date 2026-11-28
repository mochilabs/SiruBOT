"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

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
