"use client";

import { useCallback } from "react";
import { Music } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Select, type SelectOption } from "@/components/overlay/select";
import { Card } from "@/components/primitives/card";
import { Field } from "@/components/primitives/field";
import { Slider } from "@/components/primitives/slider";
import { Switch } from "@/components/primitives/switch";
import { useSettingsForm } from "@/hooks/use-guild-settings";
import { toError } from "@/lib/api-error";
import { SPONSORBLOCK_SEGMENTS } from "@/lib/schemas";
import type { GuildSettings } from "@/types/settings";

import { InfoBox, PanelError, PanelHeader, PanelLoading, SaveBar } from "./settings-shared";

/* ─────────────────────────── 옵션 ─────────────────────────── */

const REPEAT_OPTIONS: SelectOption[] = [
	{ value: "off", label: "🔁 반복 없음" },
	{ value: "track", label: "🔂 한 곡 반복" },
	{ value: "queue", label: "🔁 전체 반복" },
];

const SEGMENT_LABELS: Record<(typeof SPONSORBLOCK_SEGMENTS)[number], string> = {
	sponsor: "💰 스폰서",
	selfpromo: "📢 자기 홍보",
	interaction: "💬 상호작용",
	intro: "🎬 인트로",
	outro: "🔚 아웃트로",
	preview: "👀 미리보기",
	music_offtopic: "🎵 음악 외 구간",
	filler: "⏭️ 필러",
};

const SEGMENT_OPTIONS: SelectOption[] = SPONSORBLOCK_SEGMENTS.map((segment) => ({
	value: segment,
	label: SEGMENT_LABELS[segment],
}));

/* ─────────────────────────── 폼 매핑 (모듈 수준 — 안정 참조) ─────────────────────────── */

interface MusicForm {
	volume: number;
	repeat: GuildSettings["repeat"];
	related: boolean;
	enableController: boolean;
	sponsorBlockSegments: string[];
}

const toMusicForm = (settings: GuildSettings): MusicForm => ({
	volume: settings.volume,
	repeat: settings.repeat,
	related: settings.related,
	enableController: settings.enableController,
	sponsorBlockSegments: settings.sponsorBlockSegments,
});

/* ─────────────────────────── 패널 ─────────────────────────── */

function MusicSettingsPanel({ guildId }: { guildId: string }) {
	const toast = useToast();
	const { form, isLoading, error, saving, dirty, patch, submit, reload } = useSettingsForm(guildId, toMusicForm);

	const handleSave = useCallback(async () => {
		try {
			await submit();
			toast.success("음악 설정을 저장했어요.", "봇이 곧 새 설정을 적용해요.");
		} catch (err) {
			const apiError = toError(err, "저장에 실패했어요.");
			toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
		}
	}, [submit, toast]);

	if (isLoading) return <PanelLoading label="음악 설정 불러오는 중…" />;
	if (error) return <PanelError error={error} onRetry={reload} />;
	if (!form) return <PanelLoading label="음악 설정 불러오는 중…" />;

	return (
		<Card padding="lg" className="gap-6">
			<PanelHeader icon={<Music className="h-5 w-5" />} title="음악 설정" description="기본 볼륨·반복·관련곡·SponsorBlock을 관리해요." />

			<Field label="기본 볼륨">
				<Slider
					value={form.volume}
					onChange={(value) => patch({ volume: value })}
					min={0}
					max={150}
					label="서버 기본 볼륨"
					showValue
					formatValue={(v) => `${v}%`}
					disabled={saving}
				/>
			</Field>

			<div className="grid gap-6 sm:grid-cols-2">
				<Field label="반복 모드">
					<Select options={REPEAT_OPTIONS} value={form.repeat} onChange={(value) => patch({ repeat: value as MusicForm["repeat"] })} disabled={saving} />
				</Field>

				<div className="space-y-4">
					<Switch checked={form.enableController} onChange={(checked) => patch({ enableController: checked })} disabled={saving} label="재생 컨트롤러 메시지" labelPosition="left" />
					<Switch checked={form.related} onChange={(checked) => patch({ related: checked })} disabled={saving} label="관련곡 자동 추천" labelPosition="left" />
				</div>
			</div>

			<Field
				label="SponsorBlock 건너뛰기 구간"
				description="YouTube 영상에서 선택한 구간을 자동으로 건너겨요. 재생 중인 곡에는 다음 곡부터 반영돼요."
			>
				<Select
					multiple
					options={SEGMENT_OPTIONS}
					value={form.sponsorBlockSegments}
					onChange={(value) => patch({ sponsorBlockSegments: value })}
					placeholder="구간을 선택하지 않으면 건너뛰지 않아요"
					disabled={saving}
				/>
			</Field>

			<InfoBox>
				<p>변경 사항은 다음 곡부터 적용돼요. 지금 재생 중인 곡의 볼륨은 /볼륨 커맨드로 바로 바꿀 수 있어요.</p>
			</InfoBox>

			<SaveBar dirty={dirty} saving={saving} onSave={handleSave} />
		</Card>
	);
}

export function MusicSettings({ guildId }: { guildId: string }) {
	return <MusicSettingsPanel guildId={guildId} />;
}
