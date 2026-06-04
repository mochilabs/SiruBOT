"use client";

import { useEffect,useId, useRef, useState } from "react";
import { m } from "framer-motion";

/* ─────────────────────────── types ─────────────────────────── */

type NavigationVariant = "underline" | "pill" | "segment";

interface NavigationItem {
	key: string;
	label: string;
	icon?: React.ReactNode;
	badge?: string | number;
}

interface NavigationProps {
	items: NavigationItem[];
	activeKey: string;
	onSelect: (key: string) => void;
	variant?: NavigationVariant;
	className?: string;
}

/* ─────────────────────────── component ─────────────────────────── */

export function Navigation({
	items,
	activeKey,
	onSelect,
	variant = "underline",
	className = "",
}: NavigationProps) {
	const baseLayoutId = useId();
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const [indicator, setIndicator] = useState<{ left: number; width: number; top: number; height: number } | null>(null);

	useEffect(() => {
		const activeIndex = items.findIndex((item) => item.key === activeKey);
		const el = activeIndex >= 0 ? buttonRefs.current[activeIndex] : null;
		if (!el) {
			setIndicator(null);
			return;
		}

		const update = () => {
			setIndicator({
				left: el.offsetLeft,
				width: el.offsetWidth,
				top: el.offsetTop,
				height: el.offsetHeight,
			});
		};

		update();

		const observer = new ResizeObserver(() => {
			update();
		});
		observer.observe(el);

		const parent = el.parentElement;
		if (parent) {
			observer.observe(parent);
		}

		return () => {
			observer.disconnect();
		};
	}, [activeKey, items]);

	return (
		<nav
			role="tablist"
			className={`
				relative inline-flex items-center gap-1
				${variant === "segment" ? "glass-panel p-1.5" : "border-b border-border/40"}
				${className}
			`}
		>
			{/* Shared sliding indicator (animates standard properties for domAnimation support) */}
			{indicator && variant === "underline" && (
				<m.div
					className="absolute bottom-0 h-[2px] bg-primary rounded-full"
					animate={{ left: indicator.left, width: indicator.width }}
					transition={{ type: "spring", stiffness: 400, damping: 30 }}
				/>
			)}

			{indicator && variant === "pill" && (
				<m.div
					className="absolute bg-primary/10 border border-primary/20 rounded-2xl -z-10"
					animate={{
						left: indicator.left,
						width: indicator.width,
						top: indicator.top,
						height: indicator.height,
					}}
					transition={{ type: "spring", stiffness: 400, damping: 30 }}
				/>
			)}

			{indicator && variant === "segment" && (
				<m.div
					className="absolute glass-overlay rounded-xl -z-10 shadow-sm"
					animate={{
						left: indicator.left,
						width: indicator.width,
						top: indicator.top,
						height: indicator.height,
					}}
					transition={{ type: "spring", stiffness: 400, damping: 30 }}
				/>
			)}

			{items.map((item, idx) => {
				const isActive = item.key === activeKey;

				return (
					<button
						key={item.key}
						ref={(el) => { buttonRefs.current[idx] = el; }}
						type="button"
						role="tab"
						aria-selected={isActive}
						onClick={() => onSelect(item.key)}
						className={`
							relative inline-flex items-center gap-2 text-sm font-bold transition-colors duration-200 cursor-pointer select-none
							${variant === "underline" ? "px-4 py-3" : ""}
							${variant === "pill" ? "px-4 py-2 rounded-2xl" : ""}
							${variant === "segment" ? "px-4 py-2 rounded-xl" : ""}
							${isActive
								? "text-primary"
								: "text-muted-foreground hover:text-foreground"
							}
						`}
					>
						{item.icon && (
							<span className="h-4 w-4 flex items-center justify-center">
								{item.icon}
							</span>
						)}
						<span className="relative z-10">{item.label}</span>

						{item.badge !== undefined && (
							<span className="relative z-10 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/10 text-xs font-black text-primary">
								{item.badge}
							</span>
						)}
					</button>
				);
			})}
		</nav>
	);
}
