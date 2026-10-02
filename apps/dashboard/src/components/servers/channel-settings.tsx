"use client";

import { useCallback } from "react";
import { Hash } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Select, type SelectOption } from "@/components/overlay/select";
import { useGuildChannels, useGuildRoles, useSettingsForm } from "@/hooks/use-guild-settings";
import { toError } from "@/lib/api-error";
import { ChannelTypeValue, type DiscordChannelSummary } from "@/types/discord";
import type { GuildSettings } from "@/types/settings";

import { Field, InfoBox, PanelError, PanelHeader, PanelLoading, SaveBar, WarningBox } from "./settings-shared";

/* ─────────────────────────── 옵션 ─────────────────────────── */

const PINNED_MODE_OPTIONS: SelectOption[] = [
	{ value: "play", label: "▶️ 즉시 재생 (첫 결과 바로 재생)" },
	{ value: "select", label: "🗂 선택 재생 (5개 중 선택)" },
];

const NO_SELECTION = { value: "", label: "사용 안 함" };

function buildChannelOptions(
	channels: DiscordChannelSummary[] | null,
	predicate: (channel: DiscordChannelSummary) => boolean,
	currentId: string | null,
	prefix: string,
): SelectOption[] {
	const list = channels ?? [];
	const categories = new Map(list.filter((c) => c.type === ChannelTypeValue.GuildCategory).map((c) => [c.id, c.name]));
	const options: SelectOption[] = list
		.filter((channel) => channel.type !== ChannelTypeValue.GuildCategory && predicate(channel))
		.map((channel) => ({
			value: channel.id,
			label: `${prefix} ${channel.name}`,
			group: channel.parentId ? (categories.get(channel.parentId) ?? "기타") : "카테고리 없음",
		}));
	if (currentId && !options.some((option) => option.value === currentId)) {
		options.push({ value: currentId, label: `${currentId} (삭제된 채널)`, group: "삭제된 채널" });
	}
	return options;
}

/* ─────────────────────────── 폼 매핑 ─────────────────────────── */

interface ChannelForm {
	textChannelId: string | null;
	voiceChannelId: string | null;
	pinnedChannelId: string | null;
	pinnedChannelMode: GuildSettings["pinnedChannelMode"];
	djRoleId: string | null;
}

const toChannelForm = (settings: GuildSettings): ChannelForm => ({
	textChannelId: settings.textChannelId,
	voiceChannelId: settings.voiceChannelId,
	pinnedChannelId: settings.pinnedChannelId,
	pinnedChannelMode: settings.pinnedChannelMode,
	djRoleId: settings.djRoleId,
});

/* ─────────────────────────── 패널 ─────────────────────────── */

function ChannelSettingsPanel({ guildId }: { guildId: string }) {
	const toast = useToast();
	const { form, isLoading, error, saving, dirty, patch, submit, reload } = useSettingsForm(guildId, toChannelForm);
	const { channels, error: channelsError, reload: reloadChannels } = useGuildChannels(guildId, true);
	const { roles, error: rolesError, reload: reloadRoles } = useGuildRoles(guildId, true);

	const handleSave = useCallback(async () => {
		try {
			await submit();
			toast.success("채널·권한 설정을 저장했어요.", "봇이 곧 새 설정을 적용해요.");
		} catch (err) {
			const apiError = toError(err, "저장에 실패했어요.");
			toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
		}
	}, [submit, toast]);

	if (isLoading) return <PanelLoading label="채널·권한 설정 불러오는 중…" />;
	if (error) return <PanelError error={error} onRetry={reload} />;
	if (!form) return <PanelLoading label="채널·권한 설정 불러오는 중…" />;

	const isText = (channel: DiscordChannelSummary) =>
		channel.type === ChannelTypeValue.GuildText || channel.type === ChannelTypeValue.GuildAnnouncement;
	const isVoice = (channel: DiscordChannelSummary) =>
		channel.type === ChannelTypeValue.GuildVoice || channel.type === ChannelTypeValue.GuildStageVoice;

	const roleOptions: SelectOption[] = (roles ?? []).map((role) => ({
		value: role.id,
		label: role.name,
		icon: role.color ? (
			<span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
		) : undefined,
	}));
	if (form.djRoleId && !roleOptions.some((option) => option.value === form.djRoleId)) {
		roleOptions.push({ value: form.djRoleId, label: `${form.djRoleId} (삭제된 역할)` });
	}

	const listUnavailable = channels === null;

	return (
		<section className="glass-panel p-6 space-y-6">
			<PanelHeader
				icon={<Hash className="h-5 w-5" />}
				title="채널·권한 설정"
				description="기본 채널, 고정 채널 동작, DJ 역할을 관리해요."
			/>

			{(channelsError || rolesError) && (
				<WarningBox>
					일부 목록을 불러오지 못했어요. — {channelsError?.message ?? rolesError?.message}{" "}
					<button
						type="button"
						className="font-semibold underline"
						onClick={() => {
							reloadChannels();
							reloadRoles();
						}}
					>
						다시 시도
					</button>
				</WarningBox>
			)}

			<div className="grid gap-6 sm:grid-cols-2">
				<Field label="기본 텍스트 채널" hint="미설정이면 입력이 온 채널을 그대로 사용해요.">
					<Select
						searchable
						options={[NO_SELECTION, ...buildChannelOptions(channels, isText, form.textChannelId, "#")]}
						value={form.textChannelId ?? ""}
						onChange={(value) => patch({ textChannelId: value || null })}
						placeholder="사용 안 함"
						disabled={saving || listUnavailable}
					/>
				</Field>

				<Field label="기본 음성 채널" hint="/재생 커맨드로 자동 입장하는 채널이에요.">
					<Select
						searchable
						options={[NO_SELECTION, ...buildChannelOptions(channels, isVoice, form.voiceChannelId, "🔊")]}
						value={form.voiceChannelId ?? ""}
						onChange={(value) => patch({ voiceChannelId: value || null })}
						placeholder="사용 안 함"
						disabled={saving || listUnavailable}
					/>
				</Field>
			</div>

			<Field
				label="고정 채널"
				hint="이 채널에 입력한 텍스트를 검색어로 재생해요. 전체 채널에서 고정 채널을 하나만 지정할 수 있어요."
			>
				<Select
					searchable
					options={[NO_SELECTION, ...buildChannelOptions(channels, isText, form.pinnedChannelId, "#")]}
					value={form.pinnedChannelId ?? ""}
					onChange={(value) => patch({ pinnedChannelId: value || null })}
					placeholder="사용 안 함"
					disabled={saving || listUnavailable}
				/>
			</Field>

			<Field
				label="고정 채널 입력 동작"
				hint={form.pinnedChannelId ? undefined : "고정 채널을 지정하면 적용돼요."}
			>
				<Select
					options={PINNED_MODE_OPTIONS}
					value={form.pinnedChannelMode}
					onChange={(value) => patch({ pinnedChannelMode: value as ChannelForm["pinnedChannelMode"] })}
					disabled={saving || !form.pinnedChannelId}
				/>
			</Field>

			<Field
				label="DJ 역할"
				hint="이 역할을 가진 멤버만 정지·스킵·볼륨 등 컨트롤 커맨드를 쓸 수 있어요. 관리자는 항상 가능해요."
			>
				<Select
					searchable
					options={[NO_SELECTION, ...roleOptions]}
					value={form.djRoleId ?? ""}
					onChange={(value) => patch({ djRoleId: value || null })}
					placeholder="사용 안 함"
					disabled={saving || roles === null}
				/>
			</Field>

			<InfoBox>
				<p>채널·역할은 디스코드에서 삭제되면 자동으로 무시돼요. 목록이 비어 있으면 새로고침해 주세요.</p>
			</InfoBox>

			<SaveBar dirty={dirty} saving={saving} onSave={handleSave} />
		</section>
	);
}

export function ChannelSettings({ guildId }: { guildId: string }) {
	return <ChannelSettingsPanel guildId={guildId} />;
}
