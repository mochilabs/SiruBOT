"use client";

import { useState } from "react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { RoleSelect } from "@/components/discord/role-select";
import { SearchableSelect } from "@/components/servers/searchable-select";
import type { DiscordChannelSummary, DiscordRoleSummary } from "@/types/discord";
import { ChannelTypeValue } from "@/types/discord";

import { SectionHeader, Showcase, ShowcaseRow } from "./shared";

const sampleRoles: DiscordRoleSummary[] = [
	{ id: "1", name: "관리자", color: "#e74c3c", position: 10, managed: false },
	{ id: "2", name: "모더레이터", color: "#3498db", position: 8, managed: false },
	{ id: "3", name: "DJ", color: "#9b59b6", position: 6, managed: false },
	{ id: "4", name: "멤버", color: "#2ecc71", position: 4, managed: false },
	{ id: "5", name: "봇", color: "#95a5a6", position: 2, managed: false },
];

// 실제 서버처럼 순서가 섞여 있는 채널 표본이에요. ChannelSelect가 정렬해서 보여주는지 확인용이에요.
const sampleChannels: DiscordChannelSummary[] = [
	{ id: "1002", name: "음악", type: ChannelTypeValue.GuildCategory, parentId: null, position: 1 },
	{ id: "1001", name: "게임", type: ChannelTypeValue.GuildCategory, parentId: null, position: 0 },
	{ id: "2005", name: "노래-감상", type: ChannelTypeValue.GuildText, parentId: "1002", position: 1 },
	{ id: "2002", name: "자유", type: ChannelTypeValue.GuildText, parentId: null, position: 1 },
	{ id: "2003", name: "게임-일반", type: ChannelTypeValue.GuildText, parentId: "1001", position: 0 },
	{ id: "3001", name: "대화-음성", type: ChannelTypeValue.GuildVoice, parentId: null, position: 0 },
	{ id: "2001", name: "공지", type: ChannelTypeValue.GuildAnnouncement, parentId: null, position: 0 },
	{ id: "3002", name: "게임-음성", type: ChannelTypeValue.GuildVoice, parentId: "1001", position: 0 },
	{ id: "2004", name: "노래-신청", type: ChannelTypeValue.GuildText, parentId: "1002", position: 0 },
];

export function DiscordSection() {
	const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
	const [sampleChatChannel, setSampleChatChannel] = useState("");
	const [sampleVoiceChannels, setSampleVoiceChannels] = useState<string[]>([]);
	const [sampleCategory, setSampleCategory] = useState("");
	const [searchableValue, setSearchableValue] = useState<string>("");
	const [selectedChannels, setSelectedChannels] = useState<string[]>(["general", "music"]);

	return (
		<>
			<SectionHeader
				id="discord"
				title="Discord"
				description="Discord 스타일 UI 컴포넌트"
			/>
			<Showcase className="space-y-8">
				<ShowcaseRow label="RoleSelect" block>
					<div className="w-full max-w-sm">
						<RoleSelect multiple roles={sampleRoles} value={selectedRoles} onChange={setSelectedRoles} />
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="ChannelSelect" block>
					<div className="grid items-start gap-4 sm:grid-cols-2">
						<div className="min-w-0 space-y-1.5">
							<p className="text-xs font-medium text-foreground">채팅 채널 (카테고리 그룹 + 서버 순서)</p>
							<ChannelSelect
								channels={sampleChannels}
								types={CHANNEL_TYPE_GROUP.chat}
								value={sampleChatChannel}
								onChange={setSampleChatChannel}
								noneLabel="채널 지정 안 함"
							/>
							<p className="text-sm text-muted-foreground">
								카테고리 없는 채널이 먼저, 이어서 카테고리 안의 채널이 카테고리 순서대로 보여요.
							</p>
						</div>
						<div className="min-w-0 space-y-1.5">
							<p className="text-xs font-medium text-foreground">음성 채널 · 카테고리</p>
							<ChannelSelect
								multiple
								channels={sampleChannels}
								types={CHANNEL_TYPE_GROUP.voice}
								value={sampleVoiceChannels}
								onChange={setSampleVoiceChannels}
							/>
							<ChannelSelect
								channels={sampleChannels}
								types={CHANNEL_TYPE_GROUP.category}
								groupByCategory={false}
								value={sampleCategory}
								onChange={setSampleCategory}
							/>
						</div>
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="SearchableSelect" block>
					<div className="w-full max-w-sm space-y-3">
						<SearchableSelect
							options={[
								{ value: "kr", label: "한국어", group: "아시아" },
								{ value: "jp", label: "日本語", group: "아시아" },
								{ value: "en", label: "English", group: "유럽" },
								{ value: "de", label: "Deutsch", group: "유럽" },
							]}
							value={searchableValue}
							onChange={(value) => setSearchableValue(value)}
							placeholder="언어 선택 (검색 가능)"
						/>
						<SearchableSelect
							multiple
							options={[
								{ value: "general", label: "일반", group: "텍스트 채널" },
								{ value: "music", label: "음악", group: "텍스트 채널" },
								{ value: "notice", label: "공지", group: "텍스트 채널" },
								{ value: "voice", label: "기본 음성", group: "음성 채널" },
								{ value: "lounge", label: "라운지", group: "음성 채널" },
							]}
							value={selectedChannels}
							onChange={setSelectedChannels}
							placeholder="채널 선택 (다중 · 태그가 트리거 안쪽에 들어가요)"
						/>
					</div>
				</ShowcaseRow>
			</Showcase>
		</>
	);
}
