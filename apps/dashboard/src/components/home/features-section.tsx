"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { m, useReducedMotion } from "framer-motion";
import { Bot, LayoutDashboard, ListMusic, type LucideIcon, Music2, Palette, SlidersHorizontal, UserPlus } from "lucide-react";

import { AiChatPreview } from "@/components/home/previews/ai-chat-preview";
import { BotProfilePreview } from "@/components/home/previews/bot-profile-preview";
import { DashboardPreview } from "@/components/home/previews/dashboard-preview";
import { MemberGreetingPreview } from "@/components/home/previews/member-greeting-preview";
import { PlaybackDetailPreview } from "@/components/home/previews/playback-detail-preview";
import { PlayerPreview } from "@/components/home/previews/player-preview";
import { PlaylistPreview } from "@/components/home/previews/playlist-preview";
import { sectionVariants } from "@/components/home/section-variants";
import { SectionLabel } from "@/components/primitives/section-label";
import { cn } from "@/lib/utils";

const secondaryLink =
	"inline-flex h-8 pointer-coarse:min-h-11 cursor-pointer select-none items-center justify-center gap-2 self-start rounded-control border border-border-strong bg-surface-2 px-3 text-sm font-medium text-foreground transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/**
 * 명령어 칩 — 살짝 아래에서 올라오며 등장해요.
 * reduced-motion 환경에선 chipFadeVariants(opacity만)로 폴백해요.
 */
const chipVariants = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
} as const;

/** chipVariants의 reduced-motion 폴백 — 위치 이동 없이 opacity 페이드만으로 등장해요. */
const chipFadeVariants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { duration: 0.3, ease: "easeOut" } },
} as const;

/** 칩 스태거 컨테이너 — 자식 칩들이 0.04초 간격으로 연쇄 등장해요. */
const chipsContainerVariants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
} as const;

const COMMAND_TOKEN = "rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-bold text-muted-foreground";

/** 기능 블록 하나 — 텍스트 설명과 데모 한 짝. 데모 프리뷰는 부유 카드 콜라주까지 각자 품고 있어요. */
interface FeatureBlock {
	key: string;
	icon: LucideIcon;
	label: string;
	title: string;
	desc: string;
	Preview: ComponentType;
	secondary?: { href: string; label: string };
}

const FEATURE_BLOCKS: FeatureBlock[] = [
	{
		key: "music",
		icon: Music2,
		label: "음악 재생",
		title: "원하는 곡을 바로 재생해요.",
		desc: "/재생 한 줄로 곡을 찾아 다른 사람들과 함께 듣고, Discord 컨트롤러 버튼으로 일시정지·건너뛰기·반복을 해요.",
		Preview: PlayerPreview,
		secondary: { href: "#commands", label: "사용 중인 명령어 보기" },
	},
	{
		key: "playback",
		icon: SlidersHorizontal,
		label: "재생 디테일",
		title: "광고는 걷어내고, 곡은 끊기지 않게.",
		desc: "스폰서 구간은 자동으로 건너뛰고, 15분이 넘는 곡은 챕터로 바로 이동해요. 갭리스와 크로스페이드로 곡 이음새를 지우고, 재생 중엔 TTS로 말을 얹을 수도 있어요.",
		Preview: PlaybackDetailPreview,
	},
	{
		key: "chat",
		icon: Bot,
		label: "AI 채팅",
		title: "명령어 대신 채팅으로 착.",
		desc: "명령어를 외우지 않아도 돼요. 멘션으로 말 걸면 시루가 날씨·검색·음악 제어 같은 도구를 직접 골라 써요.",
		Preview: AiChatPreview,
	},
	{
		key: "greeting",
		icon: UserPlus,
		label: "환영·작별 인사",
		title: "인사말부터 카드까지 내 서버 스타일로.",
		desc: "채널과 인사 문구는 직접 정하고, 카드는 프리셋 위에 텍스트·아바타·스티커 레이어를 자유롭게 쌓아 꾸며요. 저장하기 전 테스트 전송으로 미리 확인도 돼요. 전부 무료예요.",
		Preview: MemberGreetingPreview,
		secondary: { href: "/servers", label: "인사 설정하기" },
	},
	{
		key: "profile",
		icon: Palette,
		label: "봇 프로필 커스텀",
		title: "서버마다 다른 모습의 시루.",
		desc: "길드 전용 닉네임·아바타·배너로 서버 분위기에 맞춰 봇을 바꿔요. 저장하면 즉시 봇에 반영돼요. 전부 무료예요.",
		Preview: BotProfilePreview,
		secondary: { href: "/servers", label: "프로필 바꾸기" },
	},
	{
		key: "playlist",
		icon: ListMusic,
		label: "내 음악 보관함",
		title: "자주 듣는 곡을 모아둬요.",
		desc: "/플레이리스트와 /즐겨찾기로 곡을 저장하고, 불러온 목록을 채널에서 그대로 재생할 수 있어요.",
		Preview: PlaylistPreview,
		secondary: { href: "/playlists", label: "대시보드에서 보관함 관리" },
	},
	{
		key: "dashboard",
		icon: LayoutDashboard,
		label: "서버 대시보드",
		title: "웹에서 슝 슝, 봇에 바로 반영.",
		desc: "채널 지정부터 음악 기본값, 역할까지, 웹에서 바꾸면 Discord 서버에 그대로 적용돼요.",
		Preview: DashboardPreview,
		secondary: { href: "/servers", label: "서버 관리 시작하기" },
	},
];

export function FeaturesSection() {
	/** 칩 스태거 reduced-motion 폴백 선택용 */
	const shouldReduce = useReducedMotion();

	return (
		<section id="features" className="py-14 sm:py-20 lg:py-24">
			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				{/* 섹션 헤더 — 기존 그대로 */}
				<m.div
					className="max-w-2xl space-y-3"
					initial="hidden"
					whileInView="visible"
					viewport={{ once: true, margin: "-80px" }}
					variants={sectionVariants}
				>
					<SectionLabel as="p" className="px-0 py-0">
						시루봇으로 할 수 있는 일
					</SectionLabel>
					<h2 className="text-3xl font-black tracking-tighter text-foreground sm:text-4xl lg:text-5xl">채널에서 재생하고, 웹에서 관리해요.</h2>
					<p className="text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
						명령어 한 줄로 음악을 시작하고, 서버 설정과 재생목록은 대시보드에서 손봐요. 재생 흐름은 Discord 안에서 끊기지 않게 이어져요.
					</p>
				</m.div>

				{/* 6개 기능 블록 — 위아래로 교차(짝수 블록은 데모 좌측) */}
				<div className="mt-16 space-y-16 sm:mt-24 sm:space-y-24">
					{FEATURE_BLOCKS.map((block, index) => (
						<m.div
							key={block.key}
							initial="hidden"
							whileInView="visible"
							viewport={{ once: true, margin: "-80px" }}
							variants={sectionVariants}
							className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12"
						>
							{/* 텍스트 — 홀수 인덱스(0 기준 1,3,5)에서 lg:order-2로 오른쪽 */}
							<div className={cn("min-w-0 space-y-3", index % 2 === 1 && "lg:order-2")}>
								<div className="flex items-center gap-2.5">
									<block.icon size={18} className="text-primary-text" aria-hidden />
									<SectionLabel as="p" className="px-0 py-0 text-primary-text">
										{block.label}
									</SectionLabel>
								</div>
								<h3 className="text-2xl font-black tracking-tighter text-foreground sm:text-3xl">{block.title}</h3>
								<p className="max-w-md text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">{block.desc}</p>
								{/* 음악 블록만 — 명령어 칩 스태거 + 2단 스펙 */}
								{block.key === "music" && (
									<div className="space-y-4 pt-1">
										{/* 치트시트 03. 스태거 — 칩들이 0.04초 간격으로 연쇄 등장.
											reduced-motion에선 이동 없이 페이드만(선례: hero-section 조건부 variants) */}
										<m.ul
											variants={chipsContainerVariants}
											initial="hidden"
											whileInView="visible"
											viewport={{ once: true, margin: "-40px" }}
											className="flex flex-wrap gap-2"
										>
											{["/재생", "/검색", "/현재곡", "/대기열", "/볼륨", "/셔플", "/일시정지", "/가사"].map((command) => (
												<m.li key={command} variants={shouldReduce ? chipFadeVariants : chipVariants} className={COMMAND_TOKEN}>
													{command}
												</m.li>
											))}
										</m.ul>
										<div className="grid grid-cols-2 gap-3">
											<div>
												<p className="text-2xs font-medium text-muted-foreground">지원 음원</p>
												<p className="mt-1 text-sm font-black tracking-tighter text-foreground">YouTube · Spotify</p>
											</div>
											<div>
												<p className="text-2xs font-medium text-muted-foreground">오디오</p>
												<p className="mt-1 text-sm font-black tracking-tighter text-foreground">크로스페이드 지원</p>
											</div>
										</div>
									</div>
								)}
								{/* 초대 CTA는 티켓 한 곳만 — 블록엔 각자 정체가 있는 동작만 남겨요 */}
								{block.secondary && (
									<Link href={block.secondary.href} className={cn(secondaryLink, "mt-6")}>
										{block.secondary.label}
									</Link>
								)}
							</div>
							{/* 데모 */}
							<div className={cn("min-w-0", index % 2 === 1 && "lg:order-1")}>
								<block.Preview />
							</div>
						</m.div>
					))}
				</div>
			</div>
		</section>
	);
}