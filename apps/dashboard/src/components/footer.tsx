import Image from "next/image";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const footerLink = "inline-flex min-h-7 items-center max-sm:min-h-10 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground";

interface FooterLink {
	label: string;
	href: string;
	internal: boolean;
}

const TOS_URL = process.env.NEXT_PUBLIC_TOS_URL;
const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL;
const SUPPORT_SERVER = process.env.NEXT_PUBLIC_SUPPORT_SERVER;

/** 푸터 링크 분류 — 봇 초대는 위의 초대 버튼이 맡아서 목록에는 넣지 않아요. */
const linkGroups: Array<{ title: string; links: FooterLink[] }> = [
	{
		title: '기능',
		links: [
			{ label: '주요 기능', href: '/#features', internal: true },
			{ label: '음악 차트', href: '/track', internal: true },
			{ label: '플레이리스트', href: '/playlists', internal: true },
		],
	},
	{
		title: '바로가기',
		links: [
			{ label: '서버 관리', href: '/servers', internal: true },
			{ label: '내 프로필', href: '/profile', internal: true },
			{ label: '서버 상태', href: '/shards', internal: true },
		],
	},
	{
		title: '프로젝트',
		links: [
			{ label: 'GitHub', href: 'https://github.com/mochiLabs/SiruBOT', internal: false },
			{ label: '오픈소스 라이선스', href: '/licenses', internal: true },
			{ label: '기여자', href: '/contributors', internal: true },
		],
	},
	{
		title: '지원',
		links: [
			...(SUPPORT_SERVER ? [{ label: '공식 디스코드', href: SUPPORT_SERVER, internal: false }] : []),
			{ label: '이용약관', href: TOS_URL || '/terms', internal: !TOS_URL },
			{ label: '개인정보처리방침', href: PRIVACY_URL || '/privacy', internal: !PRIVACY_URL },
		],
	},
];

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
			<div className="mx-auto w-full max-w-7xl px-4 pt-7 pb-6 sm:px-6 sm:pt-12 sm:pb-8 lg:px-8">
				<div className="grid gap-6 sm:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-16">
					{/* 브랜드 + 초대: 모바일은 한 줄, sm 이상은 설명을 더해 세로로 쌓아요 */}
					<div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-5">
						<div className="space-y-3">
							<Link href="/" className="inline-flex items-center gap-2 sm:gap-2.5">
								<span className="relative block h-8 w-8 overflow-hidden rounded-full sm:h-10 sm:w-10">
									<Image src="/images/siru-profile.png" alt="" fill className="object-cover" sizes="40px" />
								</span>
								<span className="text-xl font-extrabold tracking-tighter text-foreground sm:text-2xl">시루봇</span>
							</Link>
							<p className="hidden max-w-xs break-keep text-sm font-medium leading-relaxed text-muted-foreground sm:block">
								음악·AI 채팅·서버 관리를 한 곳에서. 초대하고 바로 시작하세요.
							</p>
						</div>
						<Link href="/invite" className={cn(buttonVariants({ variant: "cta" }), "h-9 px-4 text-sm font-bold sm:h-10 sm:px-5")}>
							<span className="sm:hidden">초대하기</span>
							<span className="hidden sm:inline">시루봇 초대하기</span>
						</Link>
					</div>

					{/* 분류별 링크 — 모바일은 제목 옆에 링크가 흘러가는 행, sm 이상은 4열 */}
					<div className="divide-y divide-border-subtle sm:grid sm:grid-cols-4 sm:gap-8 sm:divide-y-0">
						{linkGroups.map((group) => (
							<nav
								key={group.title}
								aria-label={group.title}
								className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-baseline gap-x-3 py-0.5 first:pt-0 last:pb-0 sm:block sm:space-y-3 sm:py-0"
							>
								<h3 className="text-sm font-bold text-foreground">{group.title}</h3>
								<ul className="flex flex-wrap gap-x-4 sm:block sm:space-y-1">
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

				<p className="mt-5 border-t border-border-subtle pt-4 text-xs font-medium text-muted-foreground sm:mt-10 sm:pt-6">
					© 2026 mochiLabs. 시루봇은 Discord와 무관한 커뮤니티 프로젝트예요.
				</p>
			</div>
		</footer>
	);
}
