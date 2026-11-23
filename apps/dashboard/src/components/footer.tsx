import Image from "next/image";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const footerLink = "inline-flex min-h-7 items-center max-sm:min-h-9 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground";

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
	{ label: '오픈소스 라이선스', href: '/licenses', internal: true },
	{ label: '기여자', href: '/contributors', internal: true },
];

const supportLinks: FooterLink[] = [
	{ label: 'GitHub', href: 'https://github.com/mochiLabs/SiruBOT', internal: false },
	...(process.env.NEXT_PUBLIC_SUPPORT_SERVER ? [{ label: '공식 디스코드', href: process.env.NEXT_PUBLIC_SUPPORT_SERVER, internal: false }] : []),
];

const legalLinks: FooterLink[] = [
	{ label: '이용약관', href: process.env.NEXT_PUBLIC_TOS_URL || '/terms', internal: !process.env.NEXT_PUBLIC_TOS_URL },
	{ label: '개인정보처리방침', href: process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL || '/privacy', internal: !process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL },
];

const linkGroups = [
	{ title: '기능', links: featureLinks },
	{ title: '서비스', links: serviceLinks },
	{ title: '지원', links: supportLinks },
];

/** 모바일 한 덩어리 링크 — 위의 초대 버튼과 겹치는 "봇 초대하기"는 빼요 */
const mobileLinks: FooterLink[] = linkGroups.flatMap((group) => group.links).filter((link) => link.href !== '/invite');

function FooterAnchor({ link }: { link: FooterLink }) {
	if (link.internal) {
		return (
			<Link href={link.href} className={footerLink}>
				{link.label}
			</Link>
		);
	}
	if (!link.href) return null;
	return (
		<a href={link.href} target="_blank" rel="noopener noreferrer" className={footerLink}>
			{link.label}
		</a>
	);
}

export function Footer() {
	// 모바일 하단 탭바가 덮는 높이만큼 푸터 면을 늘려요 — 탭바 둥근 모서리 뒤로 다른 배경색이 비치지 않게 해요
	return (
		<footer className="bg-surface-1 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] md:pb-0">
			<div className="mx-auto w-full max-w-7xl px-4 pt-7 pb-6 sm:px-6 sm:pt-14 sm:pb-8 lg:px-8">
				{/* 모바일 — 로고와 초대 버튼을 한 줄에, 링크는 그룹 제목 없이 한 덩어리로 흘려 높이를 줄여요 */}
				<div className="space-y-4 sm:hidden">
					<div className="flex items-center justify-between gap-3">
						<Link href="/" className="inline-flex items-center gap-2">
							<span className="relative block h-8 w-8 overflow-hidden rounded-full">
								<Image src="/images/siru-profile.png" alt="시루봇" fill className="object-cover" sizes="32px" />
							</span>
							<span className="text-xl font-extrabold tracking-tighter text-foreground">시루봇</span>
						</Link>
						<Link href="/invite" className={cn(buttonVariants({ variant: "cta", size: "sm" }), "font-bold")}>
							초대하기
						</Link>
					</div>
					<nav aria-label="바로가기">
						<ul className="flex flex-wrap gap-x-5">
							{mobileLinks.map((link) => (
								<li key={link.label}>
									<FooterAnchor link={link} />
								</li>
							))}
						</ul>
					</nav>
				</div>

				<div className="hidden gap-12 sm:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
					{/* 브랜드 + 초대 */}
					<div className="space-y-5">
						<Link href="/" className="inline-flex items-center gap-2.5">
							<span className="relative block h-10 w-10 overflow-hidden rounded-full">
								<Image src="/images/siru-profile.png" alt="시루봇" fill className="object-cover" sizes="40px" />
							</span>
							<span className="text-2xl font-extrabold tracking-tighter text-foreground">시루봇</span>
						</Link>
						<p className="max-w-xs break-keep text-sm font-medium leading-relaxed text-muted-foreground">
							음악·AI 채팅·서버 관리를 한 곳에서. 초대하고 바로 시작하세요.
						</p>
						<Link href="/invite" className={cn(buttonVariants({ variant: "cta" }), "h-10 px-5 text-sm font-bold")}>
							시루봇 초대하기
						</Link>
					</div>

					{/* 링크 그룹 */}
					<div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
						{linkGroups.map((group) => (
							<nav key={group.title} aria-label={group.title} className="space-y-3">
								<h3 className="text-sm font-bold text-foreground">{group.title}</h3>
								<ul className="space-y-1">
									{group.links.map((link) => (
										<li key={link.label}>
											<FooterAnchor link={link} />
										</li>
									))}
								</ul>
							</nav>
						))}
					</div>
				</div>

				<div className="mt-4 flex flex-col-reverse gap-2 border-t border-border-subtle pt-4 sm:mt-12 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pt-6">
					<p className="text-xs font-medium text-muted-foreground">© 2026 mochiLabs. 시루봇은 Discord와 무관한 커뮤니티 프로젝트예요.</p>
					<nav aria-label="약관" className="flex items-center gap-4">
						{legalLinks.map((link) => (
							<FooterAnchor key={link.label} link={link} />
						))}
					</nav>
				</div>
			</div>
		</footer>
	);
}
