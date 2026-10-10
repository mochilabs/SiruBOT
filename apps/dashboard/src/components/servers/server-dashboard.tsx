"use client";

import { useState } from "react";
import { BarChart3, Bot, Hash, Music, Radio, ShieldAlert, SlidersHorizontal, UserPlus, UserRoundCog, Volume2 } from "lucide-react";

import { ToastProvider } from "@/components/feedback/toast";
import { Card } from "@/components/primitives/card";
import { Tabs } from "@/components/primitives/tabs";

import PlayerLiveTab from "./player-live/player-live-tab";
import { AiSettings } from "./ai-settings";
import { BotProfileSettings } from "./bot-profile-settings";
import { ChannelSettings } from "./channel-settings";
import { JtcSettings } from "./jtc-settings";
import { MemberGreetingSettings } from "./member-greeting-settings";
import { MixerSettings } from "./mixer-settings";
import { MusicSettings } from "./music-settings";
import { ServerFeatureSidebar } from "./server-feature-sidebar";
import ServerStatsTab from "./server-stats-tab";

const TABS = [
	{ key: "ai", label: "AI 채팅", icon: <Bot size={14} /> },
	{ key: "profile", label: "봇 프로필", icon: <UserRoundCog size={14} /> },
	{ key: "music", label: "음악", icon: <Music size={14} /> },
	{ key: "player-live", label: "라이브", icon: <Radio size={14} /> },
	{ key: "stats", label: "통계", icon: <BarChart3 size={14} /> },
	{ key: "channels", label: "채널·권한", icon: <Hash size={14} /> },
	{ key: "jtc", label: "임시 음성", icon: <Volume2 size={14} /> },
	{ key: "mixer", label: "오디오 엔진", icon: <SlidersHorizontal size={14} /> },
	{ key: "greeting", label: "멤버", icon: <UserPlus size={14} /> },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function NotManageable() {
	return (
		<Card padding="lg" className="text-sm text-muted-foreground space-y-2">
			<p className="flex items-center gap-2 font-bold text-foreground">
				<ShieldAlert size={16} className="text-warning" /> 설정은 서버 관리자만 변경할 수 있어요.
			</p>
			<p>서버 관리자(Manage Server) 권한이 필요해요. 서버 설정에서 권한을 받은 뒤 다시 시도해 주세요.</p>
		</Card>
	);
}

/**
 * 서버 대시보드 셸 — PC(lg+)는 기능 사이드바 + 설정 패널, 모바일은 기존 가로 탭을 유지해요.
 * 탭/사이드바는 패널을 숨기기만 해(언마운트하지 않아) 편집 중인 입력값이 보존되고,
 * 패널은 Tabs 안에서 한 번만 렌더돼 두 내비게이션이 같은 상태를 공유해요(중복 마운트·중복 요청 방지).
 * 데스크톱에서는 탭 스트립만 숨기고(listClassName) 사이드바를 띄워요.
 * 모든 패널이 토큰 프리미티브와 같은 토스트 컨텍스트를 공유해요.
 */
export function ServerDashboard({ guildId, manageable }: { guildId: string; manageable: boolean }) {
	const [tab, setTab] = useState<TabKey>("ai");

	if (!manageable) return <NotManageable />;

	return (
		<ToastProvider>
			<div className="animate-page-in">
				<div className="flex flex-col items-start gap-4 lg:flex-row lg:gap-8">
					<ServerFeatureSidebar
						items={TABS}
						active={tab}
						onSelect={(key) => setTab(key as TabKey)}
					/>

					<div className="w-full min-w-0 flex-1">
						<Tabs
							aria-label="서버 설정 패널"
							items={TABS.map((item) => ({ key: item.key, label: item.label, icon: item.icon }))}
							value={tab}
							onChange={(key: string) => setTab(key as TabKey)}
							listClassName="lg:hidden"
							panelClassName="pt-4 lg:pt-0"
							renderPanel={() => (
								<>
									<div className={tab === "ai" ? "block" : "hidden"}>
										<AiSettings guildId={guildId} />
									</div>
									<div className={tab === "profile" ? "block" : "hidden"}>
										<BotProfileSettings guildId={guildId} />
									</div>
									<div className={tab === "music" ? "block" : "hidden"}>
										<MusicSettings guildId={guildId} />
									</div>
									<div className={tab === "player-live" ? "block" : "hidden"}>
										<PlayerLiveTab guildId={guildId} />
									</div>
									<div className={tab === "stats" ? "block" : "hidden"}>
										<ServerStatsTab guildId={guildId} />
									</div>
									<div className={tab === "channels" ? "block" : "hidden"}>
										<ChannelSettings guildId={guildId} />
									</div>
									<div className={tab === "jtc" ? "block" : "hidden"}>
										<JtcSettings guildId={guildId} />
									</div>
									<div className={tab === "mixer" ? "block" : "hidden"}>
										<MixerSettings guildId={guildId} />
									</div>
									<div className={tab === "greeting" ? "block" : "hidden"}>
										<MemberGreetingSettings guildId={guildId} visible={tab === "greeting"} />
									</div>
								</>
							)}
						/>
					</div>
				</div>
			</div>
		</ToastProvider>
	);
}
