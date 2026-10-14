"use client";

/**
 * 히어로 전용 셰이더 배경 — 4번(미니멀 단일 바이닐) 플래터.
 * 사유(브랜드 아이덴티티): 랜딩 히어로 뒤에 M3 턴테이블 부조 배경을 깔아 브랜드 모티프를 살려요.
 *
 * 배치 사유: 고정 배경이 아니라 HeroSection(overflow-hidden) 안 absolute inset-0로 자리 잡아
 * 섹션과 함께 스크롤돼요 — 히어로에서만 등장하고, 스크롤하면 배경이 그대로 올라가 내려가요.
 * 히어로 섹션의 첫 자식으로 렌더해야 DOM 순서 그리기 규칙에 따라 이후 형제
 * (콘텐츠 그리드·스크롤 힌트)보다 뒤로 깔려요 — 별도 z-index 없음.
 *
 * 테마: 셰이더 팔레트는 다크·라이트 두 세트를 제공하고, 테마 전환 시 dispose→create로 재마운트돼요.
 * 양쪽 bgBase가 body --background와 동일해서 재마운트가 시각적으로 튀지 않아요.
 * (다크 #1f1618 / 라이트 #fff9f9 — 팔레트는 globals.css의 --background와 쌍으로 유지할 것)
 *
 * 접근성/폴백: 캔버스는 aria-hidden·pointer-events-none이고, reduced-motion에서는 정지 프레임 1장만,
 * WebGL 미지원 환경에서는 캔버스 없이 통과해요.
 */

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useReducedMotion } from "framer-motion";

import { createVinylShaderBackground, VINYL_PALETTES } from "@/lib/landing/vinyl-shader";

export function VinylBackground() {
	const containerRef = useRef<HTMLDivElement>(null);
	const { resolvedTheme } = useTheme();
	const reducesMotion = useReducedMotion();

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return undefined;

		const handle = createVinylShaderBackground(container, {
			platterStyle: "minimal",
			palette: resolvedTheme === "light" ? VINYL_PALETTES.light : VINYL_PALETTES.dark,
			reducedMotion: Boolean(reducesMotion),
		});
		if (!handle) return undefined;
		return () => handle.dispose();
	}, [resolvedTheme, reducesMotion]);

	return <div ref={containerRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />;
}