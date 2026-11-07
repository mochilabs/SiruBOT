"use client";

import type { ComponentType } from "react";

import { AiChatPreview } from "@/components/home/previews/ai-chat-preview";
import { BotProfilePreview } from "@/components/home/previews/bot-profile-preview";
import { ChatTtsPreview } from "@/components/home/previews/chat-tts-preview";
import { CustomCommandPreview } from "@/components/home/previews/custom-command-preview";
import { DashboardPreview } from "@/components/home/previews/dashboard-preview";
import { MemberGreetingPreview } from "@/components/home/previews/member-greeting-preview";
import { MixerPreview } from "@/components/home/previews/mixer-preview";
import { PlayerPreview } from "@/components/home/previews/player-preview";
import { PlaylistPreview } from "@/components/home/previews/playlist-preview";
import { cn } from "@/lib/utils";



/** 기능 블록 하나 — 텍스트 설명과 데모 한 짝. 데모 프리뷰는 부유 카드 콜라주까지 각자 품고 있어요. */
interface FeatureBlock {
	key: string;
	title: string;
	desc: string;
	Preview: ComponentType;
}

const FEATURE_BLOCKS: FeatureBlock[] = [
	{
		key: "music",
		title: "원하는 음악을, 원하는 채널에서.",
		desc: "/재생 한 줄로 곡을 찾아 함께 듣고, 컨트롤러 버튼으로 재생을 간편하게 제어하세요.",
		Preview: PlayerPreview,
	},
	{
		key: "playback",
		title: "재생의 디테일까지 직접 설정해요.",
		desc: "곡 사이의 공백부터 오디오 필터까지. 원하는 설정을 조합해 나만의 재생 환경을 만들어보세요.",
		Preview: MixerPreview,
	},
	{
		key: "chat-tts",
		title: "채팅이 그대로 목소리가 돼요.",
		desc: "음성 채널의 채팅을 시루가 목소리로 읽어줘요. 노래를 재생하면서 함께 켜둘 수 있어요.",
		Preview: ChatTtsPreview,
	},
	{
		key: "chat",
		title: "명령어를 몰라도, 시루에게 물어보세요.",
		desc: "멘션으로 말을 걸면 시루가 대화의 맥락을 이해하고, 검색과 음악 제어 등 필요한 도구를 활용해 답해요.",
		Preview: AiChatPreview,
	},
	{
		key: "custom-commands",
		title: "우리 서버만의 명령어를 만들어요.",
		desc: "접두사 한 글자로 실행하는 우리 서버만의 명령어예요. 대시보드 블록 빌더로 순서를 짜고, AI에게 설명하면 초안이 만들어져요.",
		Preview: CustomCommandPreview,
	},
	{
		key: "greeting",
		title: "새로운 멤버를 우리 서버답게 맞이해요.",
		desc: "입장·퇴장 메시지부터 환영 카드까지. 채널과 문구를 설정하고, 다양한 디자인으로 서버만의 인사를 만들어보세요.",
		Preview: MemberGreetingPreview,
	},
	{
		key: "profile",
		title: "서버마다 다른 모습의 시루.",
		desc: "서버별 닉네임과 아바타, 배너를 설정해 각 커뮤니티의 분위기에 어울리는 시루를 만들어보세요.",
		Preview: BotProfilePreview,
	},
	{
		key: "playlist",
		title: "좋아하는 음악을 모아두고, 언제든 다시.",
		desc: "플레이리스트와 즐겨찾기에 곡을 저장하고, Discord 음성 채널에서 바로 이어서 재생하세요.",
		Preview: PlaylistPreview,
	},
	{
		key: "dashboard",
		title: "서버 설정을 한곳에서 간편하게.",
		desc: "음악 기본값부터 채널과 권한까지. 웹 대시보드에서 설정하고 서버 운영을 더 편리하게 관리하세요.",
		Preview: DashboardPreview,
	},
];

/** 기능 블록 하나 — 텍스트와 데모가 교차해서 등장해요. */
function FeatureBlockItem({ block, index }: { block: FeatureBlock; index: number }) {
	return (
		<div
			className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12"
		>
			{/* 텍스트 — 홀수 인덱스(0 기준 1,3,5)에서 lg:order-2로 오른쪽 */}
			<div className={cn("min-w-0 space-y-3", index % 2 === 1 && "lg:order-2")}>
				<h3 className="break-keep text-balance text-xl font-black tracking-tighter text-foreground sm:text-2xl">{block.title}</h3>
				<p className="max-w-md break-keep text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">{block.desc}</p>
			</div>
			{/* 데모 */}
			<div className={cn("min-w-0", index % 2 === 1 && "lg:order-1")}>
				<block.Preview />
			</div>
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
				{/* 기능 블록 9개 — 위아래로 교차(홀수 인덱스는 데모가 왼쪽) */}
				<div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
					{FEATURE_BLOCKS.map((block, index) => (
						<FeatureBlockItem key={block.key} block={block} index={index} />
					))}
				</div>
			</div>
		</section>
	);
}