"use client";

import { useCallback } from "react";
import { Calculator, Globe, Hash, Link2, MessageSquare, PowerOff, Quote, Smile } from "lucide-react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { Field } from "@/components/primitives/field";
import { SectionLabel } from "@/components/primitives/section-label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useGuildChannels, useSettingsForm } from "@/hooks/use-guild-settings";
import { notifyApiError, notifySaved } from "@/lib/notify";
import type { ChatToolMode, GuildSettings } from "@/types/settings";

import { ChannelListError, InfoBox, type ModeCardOption, ModePicker, PanelError, PanelHeader, PanelLoading, SaveBar, WarningBox } from "./settings-shared";

// 임베드 복구 사이트 — 봇 계약(packages/utils/src/chatTools.ts)과 같은 순서를 지켜요
const SITE_TOGGLES = [
	{ value: "x", label: "X (트위터)" },
	{ value: "instagram", label: "인스타그램" },
	{ value: "booth", label: "BOOTH" },
	{ value: "tiktok", label: "TikTok" },
	{ value: "reddit", label: "Reddit" },
	{ value: "pixiv", label: "Pixiv" },
	{ value: "threads", label: "Threads" },
] as const;

const TRANSLATE_LANG_OPTIONS: ReadonlyArray<{ value: GuildSettings["embedFixTranslateLang"]; label: string }> = [
	{ value: "off", label: "번역 안 함" },
	{ value: "ko", label: "한국어" },
	{ value: "en", label: "영어 (English)" },
	{ value: "ja", label: "일본어 (日本語)" },
];
interface ChatToolsForm {
	emojiEnlargeMode: ChatToolMode;
	emojiEnlargeChannelIds: string[];
	quoteMode: ChatToolMode;
	quoteChannelIds: string[];
	embedFixMode: ChatToolMode;
	embedFixChannelIds: string[];
	embedFixSites: GuildSettings["embedFixSites"];
	embedFixSuppressOriginal: boolean;
	embedFixTranslateLang: GuildSettings["embedFixTranslateLang"];
	countingEnabled: boolean;
	countingChannelId: string | null;
}

const toChatToolsForm = (settings: GuildSettings): ChatToolsForm => ({
	emojiEnlargeMode: settings.emojiEnlargeMode,
	emojiEnlargeChannelIds: settings.emojiEnlargeChannelIds,
	quoteMode: settings.quoteMode,
	quoteChannelIds: settings.quoteChannelIds,
	embedFixMode: settings.embedFixMode,
	embedFixChannelIds: settings.embedFixChannelIds,
	embedFixSites: settings.embedFixSites,
	embedFixSuppressOriginal: settings.embedFixSuppressOriginal,
	embedFixTranslateLang: settings.embedFixTranslateLang,
	countingEnabled: settings.countingEnabled,
	countingChannelId: settings.countingChannelId,
});

// 채널 정책 카드 데이터만 여기 두고 마크업은 settings-shared의 ModePicker를 써요
const MODE_CARDS: ModeCardOption<ChatToolMode>[] = [
	{ value: "all", label: "모든 채널", description: "어떤 텍스트 채널에서든 동작해요.", icon: <Globe size={16} /> },
	{ value: "channels", label: "특정 채널", description: "아래에서 선택한 채널에서만 동작해요.", icon: <Hash size={16} /> },
	{ value: "off", label: "끄기", description: "이 서버에서는 동작하지 않아요.", icon: <PowerOff size={16} /> },
];

function ChatToolsSettingsPanel({ guildId }: { guildId: string }) {
	const { form, isLoading, error, saving, dirty, patch, submit, reload } = useSettingsForm(guildId, toChatToolsForm);
	const { channels, error: channelsError, reload: reloadChannels } = useGuildChannels(guildId, true);

	const handleSave = useCallback(async () => {
		try {
			await submit();
			notifySaved("채팅 유틸 설정을 저장했어요.");
		} catch (err) {
			notifyApiError(err, "저장에 실패했어요.");
		}
	}, [submit]);

	if (isLoading) return <PanelLoading label="채팅 유틸 설정 불러오는 중…" />;
	if (error) return <PanelError error={error} onRetry={reload} />;
	if (!form) return <PanelLoading label="채팅 유틸 설정 불러오는 중…" />;

	const listUnavailable = channels === null;

	const toggleSite = (site: string, checked: boolean) => {
		const selected = new Set<string>(form.embedFixSites);
		if (checked) selected.add(site);
		else selected.delete(site);
		// 계약 순서(x → instagram → booth)를 유지해요
		const sites = SITE_TOGGLES.map((toggle) => toggle.value).filter((value) => selected.has(value));
		patch({ embedFixSites: sites });
	};

	const renderChannelPicker = (mode: ChatToolMode, channelIds: string[], onChannelIds: (ids: string[]) => void) => {
		if (mode !== "channels") return null;
		return (
			<div className="space-y-3">
				<Field label="동작 채널" description="선택한 텍스트 채널에서만 동작해요. 여러 개를 고를 수 있어요.">
					<ChannelSelect
						multiple
						channels={channels}
						types={CHANNEL_TYPE_GROUP.chat}
						searchPlaceholder="채널 검색…"
						placeholder="채널을 선택해 주세요"
						value={channelIds}
						onChange={onChannelIds}
						disabled={saving}
					/>
				</Field>
				{!channelsError && channelIds.length === 0 && <WarningBox>선택된 채널이 0개면 이 기능이 동작하지 않아요. 최소 1개는 남겨 주세요.</WarningBox>}
			</div>
		);
	};

	return (
		<Card padding="lg" className="gap-6 border-0 overflow-visible">
			<PanelHeader
				icon={<MessageSquare className="h-5 w-5" />}
				title="채팅 유틸"
				description="메시지에 자동으로 반응하는 편의 기능을 채널 단위로 관리해요."
			/>

			{channelsError && <ChannelListError error={channelsError} onRetry={reloadChannels} />}

			<div className="flex flex-col gap-3">
				<SectionLabel>
					<span className="inline-flex items-center gap-1.5">
						<Smile size={14} aria-hidden /> 이모지 확대
					</span>
				</SectionLabel>
				<ModePicker
					label="이모지 확대 모드"
					value={form.emojiEnlargeMode}
					options={MODE_CARDS}
					disabled={saving}
					onChange={(mode) => patch({ emojiEnlargeMode: mode })}
				/>
				{renderChannelPicker(form.emojiEnlargeMode, form.emojiEnlargeChannelIds, (ids) => patch({ emojiEnlargeChannelIds: ids }))}
				<p className="text-sm font-medium text-muted-foreground">
					커스텀 이모지만으로 보낸 메시지를 큰 이미지로 다시 보내줘요. 이모지 디테일을 자세히 볼 수 있어요.
				</p>
			</div>

			<div className="flex flex-col gap-3">
				<SectionLabel>
					<span className="inline-flex items-center gap-1.5">
						<Quote size={14} aria-hidden /> 메시지 인용
					</span>
				</SectionLabel>
				<ModePicker
					label="메시지 인용 모드"
					value={form.quoteMode}
					options={MODE_CARDS}
					disabled={saving}
					onChange={(mode) => patch({ quoteMode: mode })}
				/>
				{renderChannelPicker(form.quoteMode, form.quoteChannelIds, (ids) => patch({ quoteChannelIds: ids }))}
				<p className="text-sm font-medium text-muted-foreground">
					디스코드 메시지 링크를 보내면 내용을 카드로 인용해요. 같은 서버의 공개 채널만 인용하고, 비공개·연령 제한 채널은 건너뛰어요.
				</p>
			</div>

			<div className="flex flex-col gap-3">
				<SectionLabel>
					<span className="inline-flex items-center gap-1.5">
						<Link2 size={14} aria-hidden /> 임베드 복구
					</span>
				</SectionLabel>
				<ModePicker
					label="임베드 복구 모드"
					value={form.embedFixMode}
					options={MODE_CARDS}
					disabled={saving}
					onChange={(mode) => patch({ embedFixMode: mode })}
				/>
				{renderChannelPicker(form.embedFixMode, form.embedFixChannelIds, (ids) => patch({ embedFixChannelIds: ids }))}
				{form.embedFixMode !== "off" && (
					<>
						<Field label="복구할 사이트" description="링크를 고쳐서 다시 보낼 사이트를 골라요. 링크를 &lt; &gt;로 감싸면 건드리지 않아요.">
							<div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
								{SITE_TOGGLES.map((toggle) => (
									<label key={toggle.value} className="flex items-center gap-2 text-sm font-medium text-foreground">
										<Switch
											checked={form.embedFixSites.includes(toggle.value)}
											onChange={(checked: boolean) => toggleSite(toggle.value, checked)}
											disabled={saving}
										/>
										{toggle.label}
									</label>
								))}
							</div>
						</Field>
						{form.embedFixSites.length === 0 && <WarningBox>선택된 사이트가 없으면 임베드 복구가 동작하지 않아요. 최소 1개는 남겨 주세요.</WarningBox>}
						<Field
							label="원본 임베드 숨기기"
							description="고친 임베드를 보여줄 때 원본 메시지의 미리보기를 숨겨요. 봇에게 메시지 관리 권한이 있어야 해요."
						>
							<Switch
								checked={form.embedFixSuppressOriginal}
								onChange={(checked: boolean) => patch({ embedFixSuppressOriginal: checked })}
								disabled={saving}
							/>
						</Field>
						<Field
							label="임베드 자동 번역"
							description="외국어 게시글을 선택한 언어로 번역해 함께 보여줘요. 이미 해당 언어인 게시글은 번역하지 않고, 번역 결과는 캐싱돼요."
						>
							<div className="max-w-xs">
								<Select
									value={form.embedFixTranslateLang}
									onValueChange={(value) => {
										if (value) patch({ embedFixTranslateLang: value as GuildSettings["embedFixTranslateLang"] });
									}}
									disabled={saving}
								>
									<SelectTrigger className="w-full">
										<SelectValue>
											{(value: string) =>
												TRANSLATE_LANG_OPTIONS.find((opt) => opt.value === value)?.label ?? "번역 안 함"
											}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{TRANSLATE_LANG_OPTIONS.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</Field>
					</>
				)}
			</div>

			<div className="flex flex-col gap-2">
				<SectionLabel>
					<span className="inline-flex items-center gap-1.5">
						<Calculator size={14} aria-hidden /> 카운팅 채널
					</span>
				</SectionLabel>
				<Field
					label="카운팅 채널"
					description="지정 채널에서 숫자를 순서대로 세요. 1부터 시작하고, 같은 사람이 연속으로 세거나 틀리면 1부터 다시 시작해요. 최고 기록은 남아요."
				>
					<Switch checked={form.countingEnabled} onChange={(checked: boolean) => patch({ countingEnabled: checked })} disabled={saving} />
				</Field>
				<Field
					label="카운팅할 채널"
					description={form.countingEnabled ? "이 채널에서만 카운팅이 동작해요. 잡담(숫자가 아닌 메시지)은 무시해요." : "카운팅 채널을 켜면 지정할 수 있어요."}
				>
					<ChannelSelect
						channels={channels}
						types={CHANNEL_TYPE_GROUP.chat}
						noneLabel="사용 안 함"
						value={form.countingChannelId ?? ""}
						onChange={(value: string) => patch({ countingChannelId: value || null })}
						placeholder="카운팅할 채널 선택"
						disabled={saving || listUnavailable || !form.countingEnabled}
					/>
				</Field>
			</div>

			<InfoBox>
				<p>채팅 유틸은 봇이 메시지를 보낸 뒤 잠시 뒤(최대 1분) 반영돼요. 디스코드에서 /채팅유틸 커맨드로도 채널을 켜고 끌 수 있어요.</p>
			</InfoBox>

			<SaveBar dirty={dirty} saving={saving} onSave={handleSave} />
		</Card>
	);
}

export function ChatToolsSettings({ guildId }: { guildId: string }) {
	return <ChatToolsSettingsPanel guildId={guildId} />;
}