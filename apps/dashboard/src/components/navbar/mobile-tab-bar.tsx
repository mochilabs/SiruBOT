"use client";

import type { ComponentType } from "react";
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
 * 대신해요). 현재 탭은 layoutId pill이 스프링으로 옆으로 미끄러져 표시되고,
 * Providers의 MotionConfig reducedMotion="user"가 자동으로 존중해요. safe-area와
 * 하단 고정 요소(SaveBar·맨 위로)는 각각 env()와 별도 offset으로 겹침을 피해요.
 */
export function MobileTabBar({ status }: { status: "authenticated" | "unauthenticated" | "loading" }) {
	const pathname = usePathname();

	return (
		<nav
			aria-label="모바일 탭 바로가기"
			className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pt-2 pb-[env(safe-area-inset-bottom)] md:hidden"
		>
			<div className="pointer-events-auto flex w-full max-w-[26rem] rounded-full border border-border-subtle bg-background/60 p-1.5 shadow-lg backdrop-blur-xl">
				{navLinks.map((link) => {
					const Icon = tabIcons[link.href] ?? Activity;
					const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
					return (
						<Link
							key={link.href}
							href={getNavHref(link, status)}
							aria-current={active ? "page" : undefined}
							className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-2xs font-medium transition-colors duration-fast ${
								active ? "text-primary-text" : "text-muted-foreground"
							}`}
						>
							{active && (
								<m.span
									layoutId="mobile-tab-pill"
									transition={{ type: "spring", stiffness: 500, damping: 38 }}
									className="absolute inset-0 rounded-full bg-primary-control/15"
								/>
							)}
							<Icon size={20} aria-hidden className="relative" />
							<span className="relative max-w-full truncate">{link.label}</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}
