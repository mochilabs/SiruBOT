"use client";

import { useEffect, useState } from "react";
import { m } from "framer-motion";

/** 활성 항목의 레이아웃 오프셋 — spring 인디케이터가 이동할 목표예요 */
export interface SidebarIndicator {
	top: number;
	left: number;
	width: number;
	height: number;
}

/**
 * 사이드바 활성 인디케이터 — 활성 항목의 offset을 추적하고 ResizeObserver로
 * 항목·부모 컨테이너 크기 변화를 따라가요. 플레이리스트·서버 기능 사이드바가 공용으로 써서
 * 스프링 모션 파라미터(stiffness 400/damping 30)를 한곳에서 관리해요.
 * `getItemEl`은 안정 참조로 넘길 것(빈 useCallback).
 */
export function useSidebarIndicator<T>(
	items: readonly T[],
	activeIndex: number,
	getItemEl: (index: number) => HTMLElement | null,
): SidebarIndicator | null {
	const [indicator, setIndicator] = useState<SidebarIndicator | null>(null);

	useEffect(() => {
		const el = activeIndex >= 0 ? getItemEl(activeIndex) : null;

		if (!el) {
			setIndicator(null);
			return;
		}

		const update = () => {
			setIndicator({
				top: el.offsetTop,
				left: el.offsetLeft,
				width: el.offsetWidth,
				height: el.offsetHeight,
			});
		};

		update();

		const observer = new ResizeObserver(update);
		observer.observe(el);
		if (el.parentElement) observer.observe(el.parentElement);

		return () => observer.disconnect();
	}, [items, activeIndex, getItemEl]);

	return indicator;
}

/** 인디케이터 오버레이 — 포지션 스프링 모션까지 두 사이드바가 공유해요 (없으면 아무것도 안 그려요) */
export function SidebarIndicatorOverlay({ indicator }: { indicator: SidebarIndicator | null }) {
	if (!indicator) return null;
	return (
		<m.div
			className="absolute rounded-menu bg-primary-control/10 z-0"
			animate={{
				top: indicator.top,
				left: indicator.left,
				width: indicator.width,
				height: indicator.height,
			}}
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
		/>
	);
}
