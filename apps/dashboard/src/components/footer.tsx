"use client";

import Image from "next/image";
import Link from "next/link";

const footerLink = "text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground";

interface FooterLink {
	label: string;
	href: string;
	internal: boolean;
}

const featureLinks: FooterLink[] = [
	{ label: '주요 기능', href: '/#features', internal: true },
	{ label: '음악 차트', href: '/track', internal: true },
	{ label: '플레이리스트', href: '/playlists', internal: true },
];

const serviceLinks: FooterLink[] = [
	{ label: '서버 상태', href: '/shards', internal: true },
	{ label: '내 프로필', href: '/profile', internal: true },
	{ label: '서버 관리', href: '/servers', internal: true },
	{ label: '봇 초대하기', href: '/invite', internal: true },
];

const supportLinks: FooterLink[] = [
	{ label: 'GitHub', href: 'https://github.com/mochiLabs/SiruBOT', internal: false },
	...(process.env.NEXT_PUBLIC_SUPPORT_SERVER ? [{ label: '공식 디스코드', href: process.env.NEXT_PUBLIC_SUPPORT_SERVER, internal: false }] : []),
];

const linkGroups = [
	{ title: '기능', links: featureLinks },
	{ title: '서비스', links: serviceLinks },
	{ title: '지원', links: supportLinks },
];

export function Footer() {
	return (
		<footer className="border-t border-border-subtle bg-surface-1">
			<div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
				<div className="grid gap-10 md:grid-cols-5 md:gap-8">
					{/* 브랜드 */}
					<div className="space-y-3 md:col-span-2">
						<Link href="/" className="flex items-center gap-2">
							<span className="relative block h-8 w-8 overflow-hidden rounded-full">
								<Image src="/images/profile.png" alt="시루봇" fill className="object-cover" sizes="32px" />
							</span>
							<span className="text-lg font-black tracking-tighter text-foreground">시루봇</span>
						</Link>
						<p className="max-w-xs text-sm font-medium leading-relaxed text-muted-foreground">
							음악·AI 채팅·서버 관리를 한 곳에서.
							<br />
							초대하고 바로 시작하세요.
						</p>
					</div>

					{/* 링크 그룹 */}
					<div className="grid grid-cols-3 gap-4 sm:gap-6 md:col-span-3">
						{linkGroups.map((group) => (
							<nav key={group.title} aria-label={group.title} className="space-y-3 md:space-y-4">
								<h3 className="text-2xs font-black text-muted-foreground md:text-xs">{group.title}</h3>
								<ul className="space-y-2 md:space-y-3">
									{group.links.map((link) =>
										link.internal ? (
											<li key={link.label}>
												<Link href={link.href} className={footerLink}>
													{link.label}
												</Link>
											</li>
										) : link.href ? (
											<li key={link.label}>
												<a href={link.href} target="_blank" rel="noopener noreferrer" className={footerLink}>
													{link.label}
												</a>
											</li>
										) : null,
									)}
								</ul>
							</nav>
						))}
					</div>
				</div>

				<div className="mt-12 flex flex-col gap-2 border-t border-border-subtle pt-6 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs font-medium text-muted-foreground">© 2026 mochiLabs. 시루봇은 Discord와 무관한 커뮤니티 프로젝트예요.</p>
					{/* 실측 불가한 "28K+" 통계 제거(R-17) — 수치 대신 제공 범위를 안내 */}
					<p className="text-xs font-medium text-muted-foreground">음악·AI 채팅·서버 관리를 한 곳에서 제공해요</p>
				</div>
			</div>
		</footer>
	);
}