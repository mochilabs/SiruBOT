"use client";

import { useCallback } from "react";
import { Calculator, Link2, MessageSquare, Quote, Smile } from "lucide-react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { Field } from "@/components/primitives/field";
import { SectionLabel } from "@/components/primitives/section-label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useGuildChannels, useSettingsForm } from "@/hooks/use-guild-settings";
import { toError } from "@/lib/api-error";
import type { GuildSettings } from "@/types/settings";

import { InfoBox, PanelError, PanelHeader, PanelLoading, SaveBar, WarningBox } from "./settings-shared";

// 임베드 복구 사이트 — 봇 계약(packages/utils/src/chatTools.ts)과 같은 순서를 지켜요
const SITE_TOGGLES = [
	{ value: "x", label: "X (트위터)" },
	{ value: "instagram", label: "인스타그램" },
	{ value: "booth", label: "BOOTH" },
] as const;

interface ChatToolsForm {
	emojiEnlargeEnabled: boolean;
	quoteEnabled: boolean;
	embedFixEnabled: boolean;
	embedFixSites: string[];
	embedFixSuppressOriginal: boolean;
	countingEnabled: boolean;
	countingChannelId: string | null;
}

const toChatToolsForm = (settings: GuildSettings): ChatToolsForm => ({
	emojiEnlargeEnabled: settings.emojiEnlargeEnabled,
	quoteEnabled: settings.quoteEnabled,
	embedFixEnabled: settings.embedFixEnabled,
	embedFixSites: settings.embedFixSites,
	embedFixSuppressOriginal: settings.embedFixSuppressOriginal,
	countingEnabled: settings.countingEnabled,
	countingChannelId: settings.countingChannelId,
});

function ChatToolsSettingsPanel({ guildId }: { guildId: string }) {
	const toast = useToast();
	const { form, isLoading, error, saving, dirty, patch, submit, reload } = useSettingsForm(guildId, toChatToolsForm);
	const { channels, error: channelsError, reload: reloadChannels } = useGuildChannels(guildId, true);

	const handleSave = useCallback(async () => {
		try {
			await submit();
			toast.success("채팅 유틸 설정을 저장했어요.", "봇이 곧 새 설정을 적용해요.");
		} catch (err) {
			const apiError = toError(err, "저장에 실패했어요.");
			toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
		}
	}, [submit, toast]);

	if (isLoading) return <PanelLoading label="채팅 유틸 설정 불러오는 중…" />;
	if (error) return <PanelError error={error} onRetry={reload} />;
	if (!form) return <PanelLoading label="채팅 유틸 설정 불러오는 중…" />;

	const listUnavailable = channels === null;

	const toggleSite = (site: string, checked: boolean) => {
		const selected = new Set(form.embedFixSites);
		if (checked) selected.add(site);
		else selected.delete(site);
		// 계약 순서(x → instagram → booth)를 유지해요
		const sites = SITE_TOGGLES.map((toggle) => toggle.value).filter((value) => selected.has(value));
		patch({ embedFixSites: sites });
	};

	return (
		<Card padding="lg" className="gap-6 border-0 overflow-visible">
			<PanelHeader
				icon={<MessageSquare className="h-5 w-5" />}
				title="채팅 유틸"
				description="메시지에 자동으로 반응하는 편의 기능을 관리해요."
			/>

			{channelsError && (
				<WarningBox>
					채널 목록을 불러오지 못했어요. ({channelsError.message}){" "}
					<button type="button" className="font-semibold underline" onClick={reloadChannels}>
						다시 시도
					</button>
				</WarningBox>
			)}

			<div className="flex flex-col gap-2">
				<SectionLabel>
					<span className="inline-flex items-center gap-1.5">
						<Smile size={14} aria-hidden /> 이모지 확대
					</span>
				</SectionLabel>
				<Field
					label="이모지 확대"
					description="커스텀 이모지만으로 보낸 메시지를 큰 이미지로 다시 보내줘요. 이모지 디테일을 자세히 볼 수 있어요."
				>
					<Switch
						checked={form.emojiEnlargeEnabled}
						onChange={(checked: boolean) => patch({ emojiEnlargeEnabled: checked })}
						disabled={saving}
					/>
				</Field>
			</div>

			<div className="flex flex-col gap-2">
				<SectionLabel>
					<span className="inline-flex items-center gap-1.5">
						<Quote size={14} aria-hidden /> 메시지 인용
					</span>
				</SectionLabel>
				<Field
					label="메시지 링크 인용"
					description="디스코드 메시지 링크를 보낼 때 내용을 카드로 인용해요. 같은 서버의 공개 채널만 인용하고, 비공개·연령 제한 채널은 건너뛰어요."
				>
					<Switch checked={form.quoteEnabled} onChange={(checked: boolean) => patch({ quoteEnabled: checked })} disabled={saving} />
				</Field>
			</div>

			<div className="flex flex-col gap-2">
				<SectionLabel>
					<span className="inline-flex items-center gap-1.5">
						<Link2 size={14} aria-hidden /> 임베드 복구
					</span>
				</SectionLabel>
				<Field
					label="임베드 복구"
					description="X·인스타그램·BOOTH 링크의 미리보기가 제대로 뜨지 않으면 고쳐서 다시 보내줘요. 링크를 < >로 감싸면 건드리지 않아요."
				>
					<Switch checked={form.embedFixEnabled} onChange={(checked: boolean) => patch({ embedFixEnabled: checked })} disabled={saving} />
				</Field>
				{form.embedFixEnabled && (
					<>
						<Field label="복구할 사이트" description="링크를 고쳐서 다시 보낼 사이트를 골라요.">
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
						{form.embedFixSites.length === 0 && (
							<WarningBox>선택된 사이트가 없으면 임베드 복구가 동작하지 않아요. 최소 1개는 남겨 주세요.</WarningBox>
						)}
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
				<p>채팅 유틸은 봇이 메시지를 보낸 뒤 잠시 뒤(최대 1분) 반영돼요. 이모지 확대·인용·복구는 각각 유저당 짧은 쿨다운이 있어요.</p>
			</InfoBox>

			<SaveBar dirty={dirty} saving={saving} onSave={handleSave} />
		</Card>
	);
}

export function ChatToolsSettings({ guildId }: { guildId: string }) {
	return <ChatToolsSettingsPanel guildId={guildId} />;
}