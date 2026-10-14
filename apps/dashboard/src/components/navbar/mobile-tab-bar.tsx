"use client";

import { type ComponentType,useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { m } from "framer-motion";
import { Activity, BarChart3, LayoutGrid, ListMusic, User } from "lucide-react";

import { getNavHref, navLinks } from "./links";

const tabIcons: Record<string, ComponentType<{ size?: number; className?: string }>> = {
	"/shards": Activity,
	"/track": BarChart3,
	"/profile": User,
	"/playlists": ListMusic,
	"/servers": LayoutGrid,
};

/**
 * 모바일 하단 탭바 — 콘텐츠 위에 떠 있는 알약 형태(backdrop blur + 반투명 표면)로
 * 엄지 도달 범위에 메인 메뉴를 상시 노출해요 (md 이상에서 숨겨지고 데스크톱 네비가
 * 대신해요). 현재 탭 pill은 활성 탭 위치를 측정해 transform x 스프링으로 미끄러요 —
 * framer의 layoutId는 LazyMotion domAnimation에 layout 기능이 없어 안 먹어요.
 * reduced-motion은 Providers의 MotionConfig(reducedMotion="user")가 존중해요.
 * safe-area와 하단 고정 요소(SaveBar·맨 위로)는 각각 env()와 별도 offset으로 피해요.
 */
export function MobileTabBar({ status }: { status: "authenticated" | "unauthenticated" | "loading" }) {
	const pathname = usePathname();
	const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
	const [pill, setPill] = useState<{ x: number; width: number } | null>(null);

	const activeIndex = navLinks.findIndex(
		(link) => pathname === link.href || pathname.startsWith(`${link.href}/`),
	);

	useEffect(() => {
		const update = () => {
			const item = activeIndex >= 0 ? itemRefs.current[activeIndex] : null;
			setPill(item ? { x: item.offsetLeft, width: item.offsetWidth } : null);
		};
		update();
		window.addEventListener("resize", update);
		return () => window.removeEventListener("resize", update);
	}, [activeIndex]);

	return (
		<nav
			aria-label="모바일 탭 바로가기"
			className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden"
		>
			<div className="pointer-events-auto relative flex w-full max-w-[26rem] rounded-full border border-border-subtle bg-background/60 p-1.5 shadow-lg backdrop-blur-xl">
				{pill && (
					<m.span
						aria-hidden
						className="absolute top-1.5 bottom-1.5 left-0 rounded-full bg-primary-control/15 will-change-transform"
						initial={false}
						animate={{ x: pill.x, width: pill.width }}
						transition={{ type: "spring", stiffness: 500, damping: 38 }}
					/>
				)}
				{navLinks.map((link, index) => {
					const Icon = tabIcons[link.href] ?? Activity;
					const active = index === activeIndex;
					return (
						<Link
							key={link.href}
							ref={(el) => {
								itemRefs.current[index] = el;
							}}
							href={getNavHref(link, status)}
							aria-current={active ? "page" : undefined}
							className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-2xs font-medium transition-colors duration-fast ${
								active ? "text-primary-text" : "text-muted-foreground"
							}`}
						>
							<Icon size={20} aria-hidden />
							<span className="max-w-full truncate">{link.label}</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}
