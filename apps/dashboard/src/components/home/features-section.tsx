"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { m, useReducedMotion } from "framer-motion";
import { Bot, LayoutDashboard, ListMusic, type LucideIcon, Music2, Palette, SlidersHorizontal, Speech, Terminal, UserPlus } from "lucide-react";

import { AiChatPreview } from "@/components/home/previews/ai-chat-preview";
import { BotProfilePreview } from "@/components/home/previews/bot-profile-preview";
import { ChatTtsPreview } from "@/components/home/previews/chat-tts-preview";
import { CustomCommandPreview } from "@/components/home/previews/custom-command-preview";
import { DashboardPreview } from "@/components/home/previews/dashboard-preview";
import { MemberGreetingPreview } from "@/components/home/previews/member-greeting-preview";
import { MixerPreview } from "@/components/home/previews/mixer-preview";
import { PlayerPreview } from "@/components/home/previews/player-preview";
import { PlaylistPreview } from "@/components/home/previews/playlist-preview";
import { sectionVariants } from "@/components/home/section-variants";
import { SectionLabel } from "@/components/primitives/section-label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";



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
	/** 아직 출시 전인 블록 — 라벨 옆에 "곧 만나요" 상태 칩이 붙어요 */
	soon?: boolean;
}

const FEATURE_BLOCKS: FeatureBlock[] = [
	{
		key: "music",
		icon: Music2,
		label: "음악 재생",
		title: "원하는 음악을, 원하는 채널에서.",
		desc: "/재생 한 줄로 곡을 찾아 함께 듣고, 컨트롤러 버튼으로 재생을 간편하게 제어하세요.",
		Preview: PlayerPreview,
		secondary: { href: "#commands", label: "사용 중인 명령어 보기" },
	},
	{
		key: "playback",
		icon: SlidersHorizontal,
		label: "음악 엔진",
		title: "재생의 디테일까지 직접 설정해요.",
		desc: "곡 사이의 공백부터 오디오 필터까지. 원하는 설정을 조합해 나만의 재생 환경을 만들어보세요.",
		Preview: MixerPreview,
	},
	{
		key: "chat-tts",
		icon: Speech,
		label: "채팅 TTS",
		title: "채팅이 그대로 목소리가 돼요.",
		desc: "음성 채널의 채팅을 시루가 목소리로 읽어줘요. 노래를 재생하면서 함께 켜둘 수 있어요.",
		Preview: ChatTtsPreview,
		soon: true,
	},
	{
		key: "chat",
		icon: Bot,
		label: "AI 채팅",
		title: "명령어를 몰라도, 시루에게 물어보세요.",
		desc: "멘션으로 말을 걸면 시루가 대화의 맥락을 이해하고, 검색과 음악 제어 등 필요한 도구를 활용해 답해요.",
		Preview: AiChatPreview,
	},
	{
		key: "custom-commands",
		icon: Terminal,
		label: "커스텀 명령어",
		title: "우리 서버만의 명령어를 만들어요.",
		desc: "접두사 한 글자로 실행하는 우리 서버만의 명령어예요. 대시보드 블록 빌더로 순서를 짜고, AI에게 설명하면 초안이 만들어져요.",
		Preview: CustomCommandPreview,
	},
	{
		key: "greeting",
		icon: UserPlus,
		label: "환영·작별 인사",
		title: "새로운 멤버를 우리 서버답게 맞이해요.",
		desc: "입장·퇴장 메시지부터 환영 카드까지. 채널과 문구를 설정하고, 다양한 디자인으로 서버만의 인사를 만들어보세요.",
		Preview: MemberGreetingPreview,
		secondary: { href: "/servers", label: "인사 설정하기" },
	},
	{
		key: "profile",
		icon: Palette,
		label: "봇 프로필 커스텀",
		title: "서버마다 다른 모습의 시루.",
		desc: "서버별 닉네임과 아바타, 배너를 설정해 각 커뮤니티의 분위기에 어울리는 시루를 만들어보세요.",
		Preview: BotProfilePreview,
		secondary: { href: "/servers", label: "프로필 바꾸기" },
	},
	{
		key: "playlist",
		icon: ListMusic,
		label: "내 음악 보관함",
		title: "좋아하는 음악을 모아두고, 언제든 다시.",
		desc: "플레이리스트와 즐겨찾기에 곡을 저장하고, Discord 음성 채널에서 바로 이어서 재생하세요.",
		Preview: PlaylistPreview,
		secondary: { href: "/playlists", label: "대시보드에서 보관함 관리" },
	},
	{
		key: "dashboard",
		icon: LayoutDashboard,
		label: "서버 대시보드",
		title: "서버 설정을 한곳에서 간편하게.",
		desc: "음악 기본값부터 채널과 권한까지. 웹 대시보드에서 설정하고 서버 운영을 더 편리하게 관리하세요.",
		Preview: DashboardPreview,
		secondary: { href: "/servers", label: "서버 관리 시작하기" },
	},
];

/** 기능 블록 하나 — 텍스트와 데모가 교차해서 등장해요. */
function FeatureBlockItem({ block, index, shouldReduce }: { block: FeatureBlock; index: number; shouldReduce: boolean | null }) {
	return (
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
					<block.icon size={18} className="shrink-0 text-primary-text" aria-hidden />
					<SectionLabel as="p" className="px-0 py-0 text-primary-text">
						{block.label}
					</SectionLabel>
					{block.soon && (
						<span className="shrink-0 rounded-sm border border-primary-control/20 bg-primary-control/10 px-1.5 py-0.5 text-2xs font-bold text-primary-text">
							곧 만나요
						</span>
					)}
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
							{["/음악 재생", "/음악 검색", "/현재곡", "/대기열", "/음악 볼륨", "/음악 필터", "/음악 가사", "/플레이리스트"].map((command) => (
								<m.li key={command} variants={shouldReduce ? chipFadeVariants : chipVariants} className={COMMAND_TOKEN}>
									{command}
								</m.li>
							))}
						</m.ul>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<p className="text-xs font-medium text-muted-foreground">지원 음원</p>
								<p className="mt-1 text-sm font-black tracking-tighter text-foreground">YouTube · Spotify</p>
							</div>
							<div>
								<p className="text-xs font-medium text-muted-foreground">오디오</p>
								<p className="mt-1 text-sm font-black tracking-tighter text-foreground">크로스페이드 지원</p>
							</div>
						</div>
					</div>
				)}
				{/* 초대 CTA는 티켓 한 곳만 — 블록엔 각자 정체가 있는 동작만 남겨요 */}
				{block.secondary && (
					<Link href={block.secondary.href} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-6 self-start")}>
						{block.secondary.label}
					</Link>
				)}
			</div>
			{/* 데모 */}
			<div className={cn("min-w-0", index % 2 === 1 && "lg:order-1")}>
				<block.Preview />
			</div>
		</m.div>
	);
}

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
					<h2 className="break-keep text-3xl font-black tracking-tighter text-foreground sm:text-4xl">필요한 기능은 간편하게, 설정은 자유롭게.</h2>
					<p className="text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
						명령어로 바로 실행하고, 웹 대시보드에서 내 서버에 맞게 설정하세요.
					</p>
				</m.div>

				{/* 기능 블록 9개 — 위아래로 교차(홀수 인덱스는 데모가 왼쪽) */}
				<div className="mt-16 space-y-16 sm:mt-24 sm:space-y-24">
					{FEATURE_BLOCKS.map((block, index) => (
						<FeatureBlockItem key={block.key} block={block} index={index} shouldReduce={shouldReduce} />
					))}
				</div>
			</div>
		</section>
	);
}