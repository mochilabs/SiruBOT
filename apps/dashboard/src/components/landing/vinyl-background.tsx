"use client";

/**
 * 랜딩 전용 셰이더 배경 — 4번(미니멀 단일 바이닐) 플래터.
 * 사유(브랜드 아이덴티티): 랜딩 뒤에 M3 턴테이블 부조 배경을 깔아 브랜드 모티프를 살려요.
 *
 * 스태킹 사유: Footer가 z-index 없는 relative 불투명 요소라 랜딩 콘텐츠 래퍼(z-10 스태킹 컨텍스트)
 * 안에 두면 캔버스가 푸터까지 덮어요. 그래서 BackgroundShapes와 같은 body 직속 -z-10 계층으로
 * 포털을 삽입해요 — 불투명한 섹션·푸터는 캔버스를 가리고, 비어 있는 여백에서 배경이 보여요.
 *
 * 테마: 셰이더 팔레트는 다크·라이트 두 세트를 제공하고, 테마 전환 시 팔레트가 맞바뀌는 동안
 * dispose→create로 재마운트돼요. 양쪽 bgBase가 body --background와 동일해서 재마운트가 시각적으로 튀지 않아요.
 * (다크 #1f1618 / 라이트 #fff9f9 — 팔레트는 globals.css의 --background와 쌍으로 유지할 것)
 *
 * 접근성/폴백: 캔버스는 aria-hidden·pointer-events-none이고, reduced-motion에서는 정지 프레임 1장만,
 * WebGL 미지원 환경에서는 캔버스 없이 통과해요.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { useReducedMotion } from "framer-motion";

import { createVinylShaderBackground, VINYL_PALETTES } from "@/lib/landing/vinyl-shader";

export function VinylBackground() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [mounted, setMounted] = useState(false);
	const { resolvedTheme } = useTheme();
	const reducesMotion = useReducedMotion();

	// createPortal은 렌더 시점에 document가 필요하므로 마운트 이후에만 삽입해요 (HTML 파서·SSR 안전)
	useEffect(() => setMounted(true), []);

	useEffect(() => {
		if (!mounted) return undefined;
		const container = containerRef.current;
		if (!container) return undefined;

		const handle = createVinylShaderBackground(container, {
			platterStyle: "minimal",
			palette: resolvedTheme === "light" ? VINYL_PALETTES.light : VINYL_PALETTES.dark,
			reducedMotion: Boolean(reducesMotion),
		});
		if (!handle) return undefined;
		return () => handle.dispose();
	}, [mounted, resolvedTheme, reducesMotion]);

	if (!mounted) return null;

	return createPortal(
		<div ref={containerRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />,
		document.body,
	);
}