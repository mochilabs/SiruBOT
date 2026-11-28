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

export function MobileTabBar({ status }: { status: "authenticated" | "unauthenticated" | "loading" }) {
	const pathname = usePathname();

	return (
		<nav
			aria-label="주요 메뉴"
			className="fixed inset-x-0 bottom-0 z-(--z-float) rounded-t-card border-t border-border-subtle bg-surface-1 pb-[env(safe-area-inset-bottom)] md:hidden"
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
									"group flex h-full min-h-11 touch-manipulation flex-col items-center justify-center gap-1 px-1 text-2xs font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
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
