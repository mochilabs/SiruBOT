export interface NavLink {
	label: string;
	href: string;
	requireAuth?: boolean;
}

/** 데스크톱 네비·모바일 하단 탭바가 공유하는 메인 링크예요. */
export const navLinks: NavLink[] = [
	{ label: "상태", href: "/shards" },
	{ label: "차트", href: "/track" },
	{ label: "프로필", href: "/profile", requireAuth: true },
	{ label: "플레이리스트", href: "/playlists", requireAuth: true },
	{ label: "대시보드", href: "/servers", requireAuth: true },
];

/** 로그인하지 않은 사용자가 보호된 링크를 누르면 로그인 후 다시 이동하도록 경로를 바꿔요. */
export function getNavHref(link: NavLink, status: "authenticated" | "unauthenticated" | "loading"): string {
	if (link.requireAuth && status !== "authenticated") {
		return `/api/auth/signin?callbackUrl=${encodeURIComponent(link.href)}`;
	}
	return link.href;
}
