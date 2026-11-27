"use client";

import { useEffect, useState } from "react";
import { m } from "framer-motion";

export interface SidebarIndicator {
	top: number;
	left: number;
	width: number;
	height: number;
}

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
