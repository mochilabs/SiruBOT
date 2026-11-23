"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, LayoutGrid, ListMusic, User } from "lucide-react";

import { cn } from "@/lib/utils";

import { getNavHref, navLinks } from "./links";

const tabIcons: Record<string, ComponentType<{ size?: number; className?: string; strokeWidth?: number }>> = {
	"/shards": Activity,
	"/track": BarChart3,
	"/profile": User,
	"/playlists": ListMusic,
	"/servers": LayoutGrid
};

/**
 * 모바일 하단 탭바 — 화면 아래에 붙어 있는(docked) 전폭 바예요. 위쪽 모서리를 둥글리고 위로 퍼지는 그림자(shadow-up)를 줘서
 * 콘텐츠 위에 얹힌 시트처럼 보이게 하고, 칸 5개를 같은 폭으로 나눠 엄지가 어디서든 닿게 해요 (md 이상은 데스크톱 메뉴가 대신해요).
 * 현재 탭은 아이콘 뒤 알약 배경과 굵은 글자로 표시하고, 칸 전체가 눌리는 영역이에요.
 * 높이는 --tabbar-h(+ safe-area)와 맞물려 루트 레이아웃·저장 바·맨 위로 버튼의 여백을 정해요.
 */
export function MobileTabBar({ status }: { status: "authenticated" | "unauthenticated" | "loading" }) {
	const pathname = usePathname();

	return (
		<nav
			aria-label="주요 메뉴"
			className="fixed inset-x-0 bottom-0 z-(--z-float) rounded-t-card border-t border-border-subtle bg-surface-1 pb-[env(safe-area-inset-bottom)] shadow-up md:hidden"
		>
			<ul className="mx-auto flex h-[var(--tabbar-h)] max-w-md items-stretch">
				{navLinks.map((link) => {
					const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
					const Icon = tabIcons[link.href] ?? LayoutGrid;
					return (
						<li key={link.label} className="min-w-0 flex-1">
							<Link
								href={getNavHref(link, status)}
								aria-current={active ? "page" : undefined}
								className={cn(
									"group flex h-full min-h-11 flex-col items-center justify-center gap-1 px-1 text-2xs font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
									active ? "text-primary-text" : "text-muted-foreground hover:text-foreground"
								)}
							>
								<span
									aria-hidden
									className={cn(
										"flex h-8 w-14 items-center justify-center rounded-full transition-[background-color,transform] duration-fast group-active:scale-95",
										active ? "bg-primary-control/15" : "bg-transparent"
									)}
								>
									<Icon size={20} strokeWidth={active ? 2.4 : 2} />
								</span>
								<span className="max-w-full truncate">{link.label}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
