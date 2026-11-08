"use client";

import type { ComponentType } from "react";
import { m, useReducedMotion } from "framer-motion";

import { AiChatPreview } from "@/components/home/previews/ai-chat-preview";
import { ChatTtsPreview } from "@/components/home/previews/chat-tts-preview";
import { CustomCommandPreview } from "@/components/home/previews/custom-command-preview";
import { DashboardPreview } from "@/components/home/previews/dashboard-preview";
import { GamesLifePreview } from "@/components/home/previews/games-life-preview";
import { MemberGreetingPreview } from "@/components/home/previews/member-greeting-preview";
import { MixerPreview } from "@/components/home/previews/mixer-preview";
import { PlayerPreview } from "@/components/home/previews/player-preview";
import { ServerOpsPreview } from "@/components/home/previews/server-ops-preview";
import { SocialAlertPreview } from "@/components/home/previews/social-alert-preview";
import { motionSlow } from "@/components/motion/durations";
import { cn } from "@/lib/utils";

/** 기능 블록 하나 — 텍스트 설명과 데모 한 짝. 데모 프리뷰는 부유 카드 콜라주까지 각자 품고 있어요. */
interface FeatureBlock {
	key: string;
	title: string;
	desc: string;
	Preview: ComponentType;
}

const B = {
	music: {
		key: "music",
		title: "원하는 음악을, 원하는 채널에서.",
		desc: "/재생 한 줄로 곡을 찾아 함께 듣고, 컨트롤러 버튼으로 재생을 간편하게 제어하세요.",
		Preview: PlayerPreview
	},
	playback: {
		key: "playback",
		title: "내 방식대로 듣고, 모아두고.",
		desc: "곡 사이의 공백부터 오디오 필터까지 재생 환경을 직접 설정하고, 플레이리스트와 즐겨찾기에 곡을 모아 음성 채널에서 바로 이어 들으세요.",
		Preview: MixerPreview
	},
	chat: {
		key: "chat",
		title: "명령어를 몰라도, 시루에게 물어보세요.",
		desc: "멘션으로 말을 걸면 시루가 대화의 맥락을 이해하고, 검색과 음악 제어 등 필요한 도구를 활용해 답해요.",
		Preview: AiChatPreview
	},
	chatTts: {
		key: "chat-tts",
		title: "채팅이 그대로 목소리가 돼요.",
		desc: "음성 채널의 채팅을 시루가 목소리로 읽어줘요. 노래를 재생하면서 함께 켜둘 수 있어요.",
		Preview: ChatTtsPreview
	},
	custom: {
		key: "custom-commands",
		title: "우리 서버만의 명령어를 만들어요.",
		desc: "접두사 한 글자로 실행하는 우리 서버만의 명령어예요. 대시보드 블록 빌더로 순서를 짜고, AI에게 설명하면 초안이 만들어져요.",
		Preview: CustomCommandPreview
	},
	ops: {
		key: "ops",
		title: "서버 운영은 버튼 한 번으로.",
		desc: "역할 패널과 티켓, 임시 음성 채널을 대시보드에서 설정해요. 역할은 버튼으로 받고, 문의는 비공개 채널로 열리고, 음성 방은 필요할 때만 생겨요.",
		Preview: ServerOpsPreview
	},
	greeting: {
		key: "greeting",
		title: "새로운 멤버를 우리 서버답게 맞이해요.",
		desc: "입장·퇴장 메시지부터 환영 카드까지. 채널과 문구를 설정하고, 다양한 디자인으로 서버만의 인사를 만들어보세요.",
		Preview: MemberGreetingPreview
	},
	dashboard: {
		key: "dashboard",
		title: "서버 설정을 한곳에서, 시루도 서버답게.",
		desc: "음악 기본값부터 채널과 권한까지 웹 대시보드에서 설정하고, 서버별 닉네임과 아바타, 배너로 커뮤니티에 어울리는 시루를 만들어보세요.",
		Preview: DashboardPreview
	},
	social: {
		key: "social",
		title: "좋아하는 크리에이터의 소식을 놓치지 않게.",
		desc: "YouTube 새 영상과 Twitch, Chzzk 방송 시작을 감지해 원하는 채널에 알려줘요. 대시보드에서 웹훅을 연결해 설정해요.",
		Preview: SocialAlertPreview
	},
	games: {
		key: "games",
		title: "출석부터 가위바위보, 택배 조회까지.",
		desc: "매일 출석하면 출석 일수가 쌓이고, 주사위와 가위바위보로 가볍게 놀 수 있어요. 날씨와 택배도 명령어 하나면 확인돼요.",
		Preview: GamesLifePreview
	}
} satisfies Record<string, FeatureBlock>;

interface Chapter {
	title: string;
	desc: string;
	blocks: FeatureBlock[];
}

/** 챕터마다 블록을 한 줄에 하나씩 — 글과 데모가 좌우로 번갈아 놓여요 */
const CHAPTERS: Chapter[] = [
	{ title: "음악과 음성", desc: "재생부터 읽어주기까지.", blocks: [B.music, B.playback, B.chatTts] },
	{ title: "서버 운영", desc: "설정은 한곳에서, 운영은 자동으로.", blocks: [B.ops, B.greeting, B.dashboard] },
	{ title: "AI와 놀이", desc: "말을 걸고, 알림 받고, 함께 놀아요.", blocks: [B.chat, B.custom, B.social, B.games] }
];

/** 제목 — 마스크 안에서 올라와요. 관찰 대상은 클립되지 않는 h4이고, 자식 span이 variants로 따라와요 */
function MaskedTitle({ children }: { children: string }) {
	const shouldReduce = useReducedMotion();
	return (
		<m.h4
			className="overflow-hidden break-keep text-balance text-xl font-black tracking-tighter text-foreground sm:text-2xl"
			initial={shouldReduce ? false : "hidden"}
			whileInView="visible"
			viewport={{ once: true, margin: "-40px" }}
		>
			<m.span
				className="block"
				variants={{ hidden: { y: "105%" }, visible: { y: 0, transition: { duration: motionSlow, ease: [0.22, 1, 0.36, 1] } } }}
			>
				{children}
			</m.span>
		</m.h4>
	);
}

/** 한 줄 — 글과 데모를 좌우로 놓고 세로 가운데로 맞춰요. flip이면 좌우가 바뀌어요 */
function FeatureRow({ block, flip }: { block: FeatureBlock; flip: boolean }) {
	const shouldReduce = useReducedMotion();
	return (
		<div className="grid items-center gap-6 py-8 sm:gap-8 sm:py-12 lg:grid-cols-2 lg:gap-16">
			<div className={cn("min-w-0 space-y-3", flip && "lg:order-2")}>
				<MaskedTitle>{block.title}</MaskedTitle>
				<m.p
					className="max-w-md break-keep text-sm font-medium leading-relaxed text-muted-foreground sm:text-base"
					initial={shouldReduce ? false : { opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true, margin: "-40px" }}
					transition={{ duration: motionSlow, delay: 0.12, ease: "easeOut" }}
				>
					{block.desc}
				</m.p>
			</div>
			<m.div
				className={cn("min-w-0", flip && "lg:order-1")}
				initial={shouldReduce ? false : { clipPath: "inset(10% 6% 10% 6% round 16px)", opacity: 0, scale: 0.97 }}
				whileInView={{ clipPath: "inset(0% 0% 0% 0% round 16px)", opacity: 1, scale: 1 }}
				viewport={{ once: true, margin: "-60px" }}
				transition={{ duration: motionSlow, ease: [0.22, 1, 0.36, 1] }}
			>
				<block.Preview />
			</m.div>
		</div>
	);
}

/** 챕터 머리 — 제목과 한 줄 설명, 왼쪽에서 그려지는 가는 선 */
function ChapterHeader({ chapter }: { chapter: Chapter }) {
	const shouldReduce = useReducedMotion();
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<h3 className="text-2xl font-black tracking-tighter text-foreground sm:text-3xl">{chapter.title}</h3>
				<span className="text-sm font-medium text-muted-foreground sm:text-base">{chapter.desc}</span>
			</div>
			<m.div
				aria-hidden
				className="h-px origin-left bg-border-subtle"
				initial={shouldReduce ? false : { scaleX: 0 }}
				whileInView={{ scaleX: 1 }}
				viewport={{ once: true, margin: "-60px" }}
				transition={{ duration: motionSlow, ease: [0.22, 1, 0.36, 1] }}
			/>
		</div>
	);
}

export function FeaturesSection() {
	return (
		<section id="features" className="py-14 sm:py-20 lg:py-24">
			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="max-w-2xl space-y-3">
					<h2 className="break-keep text-balance text-3xl font-black tracking-tighter text-foreground sm:text-5xl">필요한 기능은 간편하게, 설정은 자유롭게.</h2>
					<p className="text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">명령어로 바로 실행하고, 웹 대시보드에서 내 서버에 맞게 설정하세요.</p>
				</div>
				<div className="mt-10 space-y-12 sm:mt-12 sm:space-y-16">
					{CHAPTERS.map((chapter) => (
						<div key={chapter.title} className="space-y-0">
							<ChapterHeader chapter={chapter} />
							<div className="divide-y divide-border-subtle">
								{chapter.blocks.map((block, index) => (
									<FeatureRow key={block.key} block={block} flip={index % 2 === 1} />
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
