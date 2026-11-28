export interface NavLink {
	label: string;
	href: string;
	requireAuth?: boolean;
}

export const navLinks: NavLink[] = [
	{ label: "상태", href: "/shards" },
	{ label: "차트", href: "/track" },
	{ label: "프로필", href: "/profile", requireAuth: true },
	{ label: "플레이리스트", href: "/playlists", requireAuth: true },
	{ label: "대시보드", href: "/servers", requireAuth: true },
];

export function getNavHref(link: NavLink, status: "authenticated" | "unauthenticated" | "loading"): string {
	if (link.requireAuth && status !== "authenticated") {
		return `/api/auth/signin?callbackUrl=${encodeURIComponent(link.href)}`;
	}
	return link.href;
}
