"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { m, useReducedMotion } from "framer-motion";
import { AudioLines, Bot, FastForward, Infinity as InfinityIcon, LayoutDashboard, ListMusic, ListOrdered, type LucideIcon, Mic, MonitorPlay, Music2, Palette, SlidersHorizontal, UserPlus } from "lucide-react";

import { AiChatPreview } from "@/components/home/previews/ai-chat-preview";
import { BotProfilePreview } from "@/components/home/previews/bot-profile-preview";
import { DashboardPreview } from "@/components/home/previews/dashboard-preview";
import { MemberGreetingPreview } from "@/components/home/previews/member-greeting-preview";
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
	);
}

/** 음악 엔진의 기능 한 줄 설명 — 씬 카드의 하단에 사양처럼 나열해요 */
const ENGINE_FEATURES = [
	{ icon: FastForward, name: "스폰서 스킵", desc: "광고 구간을 찾아 자동으로 걷어내요." },
	{ icon: ListOrdered, name: "챕터", desc: "컨트롤러 버튼으로 구간을 바로 이동해요." },
	{ icon: InfinityIcon, name: "갭리스 · 크로스페이드", desc: "곡 이음새를 지우고 자연스럽게 이어요(4초)." },
	{ icon: AudioLines, name: "오디오 필터", desc: "베이스부스트·나이트코어·노래방 등 즉석 토글." },
	{ icon: Mic, name: "TTS 겹침", desc: "노래 위에 입력한 말을 그대로 얹어 전해요." },
	{ icon: MonitorPlay, name: "대시보드 재생", desc: "웹 플레이어에서 검색해 곧장 대기열에 넣어요." }
];

/** 음악 엔진 씬 카드 — 스폰서가 걷어진 진행 바와 챕터, 기능 설명을 한 장으로 보여줘요 (넘기기 없음) */
function PlaybackEngineScene() {
	return (
		<m.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={sectionVariants} className="space-y-4">
			<div className="max-w-2xl space-y-3">
				<div className="flex items-center gap-2.5">
					<SlidersHorizontal size={18} className="text-primary-text" aria-hidden />
					<SectionLabel as="p" className="px-0 py-0 text-primary-text">
						음악 엔진
					</SectionLabel>
				</div>
				<h3 className="text-2xl font-black tracking-tighter text-foreground sm:text-3xl">광고는 걷어내고, 곡은 끊기지 않게.</h3>
				<p className="max-w-xl text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
					곡과 곡 사이, 광고 구간, 소리 자체까지 재생의 모든 디테일을 제어해요.
				</p>
			</div>
			{/* 기준: SponsorBlock 세그먼트 설정, 15분 이상 곡의 챕터(data-api /v1/chapters)와 컨트롤러
			    챕터 버튼, /music 음성(TTS 겹침), /믹서 갭리스·크로스페이드 */}
			<div className="mx-auto max-w-2xl space-y-3 rounded-card bg-discord-embed p-3 sm:p-4">
				<div className="flex items-center gap-2 border-b border-discord-btn-active px-1 pb-2">
					<Music2 size={14} className="text-discord-text-muted" aria-hidden />
					<span className="text-xs font-semibold text-discord-text">지금 재생 중</span>
					<span className="ml-auto text-2xs text-discord-text-muted">#음악-라운지</span>
				</div>
				<div className="flex items-center gap-2 text-2xs tabular-nums text-discord-text-muted">
					<span>0:43 / 4:40</span>
					<div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-discord-btn-active">
						<div className="absolute inset-y-0 left-0 w-[28%] rounded-full bg-primary-control" />
						{["18%", "52%", "79%"].map((left) => (
							<div key={left} className="absolute inset-y-0 w-px bg-discord-text-muted/70" style={{ left }} />
						))}
						<div className="absolute inset-y-0 left-[35%] w-[9%] bg-warning/50" />
					</div>
				</div>
				{ENGINE_FEATURES.map((feature) => (
					<div key={feature.name} className="flex min-w-0 items-start gap-2 rounded-control bg-discord-btn-active/60 px-2.5 py-2">
						<feature.icon size={14} className="mt-0.5 shrink-0 text-discord-text-muted" aria-hidden />
						<div className="min-w-0">
							<p className="text-xs font-bold text-discord-text">{feature.name}</p>
							<p className="text-2xs font-medium leading-relaxed text-discord-text-muted">{feature.desc}</p>
						</div>
					</div>
				))}
				<p className="text-2xs text-discord-text-muted">켜고 끄는 건 /믹서와 /music 필터 명령이면 충분해요.</p>
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
					<h2 className="text-3xl font-black tracking-tighter text-foreground sm:text-4xl lg:text-5xl">채널에서 재생하고, 웹에서 관리해요.</h2>
					<p className="text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
						명령어 한 줄로 음악을 시작하고, 서버 설정과 재생목록은 대시보드에서 손봐요. 재생 흐름은 Discord 안에서 끊기지 않게 이어져요.
					</p>
				</m.div>

				{/* 음악 재생 블록 → 음악 엔진 스트립 → 나머지 교차 블록. 홀수 인덱스에서 텍스트가 오른쪽으로 가요 */}
				<div className="mt-16 space-y-16 sm:mt-24 sm:space-y-24">
					<FeatureBlockItem block={FEATURE_BLOCKS[0]} index={0} shouldReduce={shouldReduce} />
					<PlaybackEngineScene />
					{FEATURE_BLOCKS.slice(1).map((block, index) => (
						<FeatureBlockItem key={block.key} block={block} index={index + 1} shouldReduce={shouldReduce} />
					))}
				</div>
			</div>
		</section>
	);
}