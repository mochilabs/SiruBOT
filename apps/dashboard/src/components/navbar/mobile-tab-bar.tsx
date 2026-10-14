"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
 * 모바일 하단 탭바 — 엄지 도달 범위에 메인 메뉴를 상시 노출해요 (md 이상에서 숨겨지고
 * 데스크톱 네비가 대신해요). iOS safe-area와 하단 고정 요소(SaveBar·맨 위로) 겹침도
 * 각각 pb-[env(safe-area-inset-bottom)]과 별도 offset으로 피해요.
 */
export function MobileTabBar({ status }: { status: "authenticated" | "unauthenticated" | "loading" }) {
	const pathname = usePathname();

	return (
		<nav
			aria-label="모바일 탭 바로가기"
			className="fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
		>
			<div className="grid grid-cols-5">
				{navLinks.map((link) => {
					const Icon = tabIcons[link.href] ?? Activity;
					const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
					return (
						<Link
							key={link.href}
							href={getNavHref(link, status)}
							aria-current={active ? "page" : undefined}
							className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-2xs font-medium transition-colors duration-fast ${
								active ? "text-primary-text" : "text-muted-foreground"
							}`}
						>
							<Icon size={20} aria-hidden />
							<span>{link.label}</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}
