"use client";

import { useCallback, useState } from "react";
import { Folder,Volume2 } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Select, type SelectOption } from "@/components/overlay/select";
import { Card } from "@/components/primitives/card";
import { Field } from "@/components/primitives/field";
import { Input } from "@/components/primitives/input";
import { Slider } from "@/components/primitives/slider";
import { Switch } from "@/components/primitives/switch";
import { useGuildChannels, useSettingsForm } from "@/hooks/use-guild-settings";
import { toApiError, toError } from "@/lib/api-error";
import { ChannelTypeValue } from "@/types/discord";
import type { GuildSettings } from "@/types/settings";

import { InfoBox, PanelError, PanelHeader, PanelLoading, SaveBar, WarningBox } from "./settings-shared";

/* ─────────────────────────── 폼 매핑 ─────────────────────────── */

interface JtcForm {
	jtcEnabled: boolean;
	jtcCategoryId: string | null;
	jtcMarkerChannelId: string | null;
	jtcTemplate: string;
	jtcUserLimit: number;
}

const toJtcForm = (settings: GuildSettings): JtcForm => ({
	jtcEnabled: settings.jtcEnabled,
	jtcCategoryId: settings.jtcCategoryId,
	jtcMarkerChannelId: settings.jtcMarkerChannelId,
	jtcTemplate: settings.jtcTemplate,
	jtcUserLimit: settings.jtcUserLimit,
});

/* ─────────────────────────── 패널 ─────────────────────────── */

function JtcSettingsPanel({ guildId }: { guildId: string }) {
	const toast = useToast();
	const { form, isLoading, error, saving, dirty, patch, submit, reload } = useSettingsForm(guildId, toJtcForm);
	const { channels, error: channelsError, reload: reloadChannels } = useGuildChannels(guildId, true);
	const [setupLoading, setSetupLoading] = useState(false);

	const handleSave = useCallback(async () => {
		try {
			await submit();
			toast.success("임시 음성 설정을 저장했어요.", "봇이 곧 새 설정을 적용해요.");
		} catch (err) {
			const apiError = toError(err, "저장에 실패했어요.");
			toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
		}
	}, [submit, toast]);

	/** 카테고리 선택 = 봇과 같은 마커 채널 준비 작업(디스코드 채널 생성/이동) */
	const handleCategoryChange = useCallback(
		async (categoryId: string) => {
			setSetupLoading(true);
			try {
				const res = await fetch(`/api/servers/${guildId}/jtc/setup`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ categoryId }),
				});
				if (!res.ok) throw await toApiError(res, "마커 채널을 준비하지 못했어요.");
				const data = (await res.json()) as { categoryId: string; markerChannelId: string };
				patch({ jtcCategoryId: data.categoryId, jtcMarkerChannelId: data.markerChannelId });
				toast.success("마커 채널을 준비했어요.", "카테고리에 '🔊 임시방 만들기' 채널이 생겼어요.");
			} catch (err) {
				const apiError = toError(err, "마커 채널을 준비하지 못했어요.");
				toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
			} finally {
				setSetupLoading(false);
			}
		},
		[guildId, patch, toast],
	);

	if (isLoading) return <PanelLoading label="임시 음성 설정 불러오는 중…" />;
	if (error) return <PanelError error={error} onRetry={reload} />;
	if (!form) return <PanelLoading label="임시 음성 설정 불러오는 중…" />;

	const categoryOptions: SelectOption[] = (channels ?? [])
		.filter((channel) => channel.type === ChannelTypeValue.GuildCategory)
		.map((channel) => ({ value: channel.id, label: channel.name, icon: <Folder size={16} aria-hidden /> }));
	if (form.jtcCategoryId && !categoryOptions.some((option) => option.value === form.jtcCategoryId)) {
		categoryOptions.push({ value: form.jtcCategoryId, label: `${form.jtcCategoryId} (삭제된 카테고리)` });
	}

	const markerName = channels?.find((channel) => channel.id === form.jtcMarkerChannelId)?.name ?? form.jtcMarkerChannelId;
	const templatePreview = (form.jtcTemplate.trim() || "{user}의 방").replaceAll("{user}", "철수");

	return (
		<Card padding="lg" className="gap-6">
			<PanelHeader
				icon={<Volume2 className="h-5 w-5" />}
				title="임시 음성채널 (JTC)"
				description="마커 채널에 들어가면 방장 이름으로 개인 음성방을 만들어 줘요."
			/>

			{channelsError && (
				<WarningBox>
					채널 목록을 불러오지 못했어요. — {channelsError.message}{" "}
					<button type="button" className="font-semibold underline" onClick={reloadChannels}>
						다시 시도
					</button>
				</WarningBox>
			)}

			<div className="flex items-center justify-between gap-4">
				<Switch
					checked={form.jtcEnabled}
					onChange={(checked) => patch({ jtcEnabled: checked })}
					disabled={saving || !form.jtcMarkerChannelId}
					label="임시 음성채널 사용"
					labelPosition="left"
				/>
				{!form.jtcMarkerChannelId && <span className="text-xs text-muted-foreground/70">먼저 아래에서 카테고리를 설정해 주세요.</span>}
			</div>

			<Field
				label="생성 위치 (카테고리)"
				description="선택하면 카테고리 안에 '🔊 임시방 만들기' 마커 채널을 만들거나 옮겨요. (채널 관리 권한이 필요해요)"
			>
				<Select
					searchable
					options={categoryOptions}
					value={form.jtcCategoryId ?? ""}
					onChange={(value) => void handleCategoryChange(value)}
					placeholder="카테고리 선택"
					disabled={saving || setupLoading || channels === null}
				/>
			</Field>

			{form.jtcMarkerChannelId && (
				<InfoBox>
					<p>
						마커 채널: <span className="font-semibold text-foreground">{markerName}</span> — 멤버가 이 채널에 들어가면 임시방이
						생겨요. 채널을 삭제해도 다음 설정 시 다시 만들어져요.
					</p>
				</InfoBox>
			)}

			<div className="grid gap-6 sm:grid-cols-2">
				<Field htmlFor="jtc-template" label="방 이름 템플릿" description="{user}는 들어온 멤버의 이름으로 바뀌어요.">
					<Input
						id="jtc-template"
						type="text"
						value={form.jtcTemplate}
						maxLength={100}
						disabled={saving}
						onChange={(e) => patch({ jtcTemplate: e.target.value })}
						placeholder="{user}의 방"
					/>
					<p className="pt-1 text-xs text-muted-foreground/70">
						예시: <span className="font-semibold text-foreground">{templatePreview}</span>
					</p>
				</Field>

				<Field label="인원 제한">
					<Slider
						value={form.jtcUserLimit}
						onChange={(value) => patch({ jtcUserLimit: value })}
						min={0}
						max={99}
						label="임시방 인원 제한"
						showValue
						formatValue={(v) => (v === 0 ? "제한 없음" : `${v}명`)}
						disabled={saving}
					/>
				</Field>
			</div>

			<InfoBox>
				<p>비어 있는 임시방은 30초 후 자동으로 삭제돼요. (서버 설정 JTC_EMPTY_GRACE_MS로 조정 가능)</p>
			</InfoBox>

			<SaveBar dirty={dirty} saving={saving || setupLoading} onSave={handleSave} />
		</Card>
	);
}

export function JtcSettings({ guildId }: { guildId: string }) {
	return <JtcSettingsPanel guildId={guildId} />;
}
