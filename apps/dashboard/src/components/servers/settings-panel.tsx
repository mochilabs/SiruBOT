"use client";

import { type ReactNode, useCallback } from "react";

import { Card } from "@/components/ui/card";
import { useSettingsForm } from "@/hooks/use-guild-settings";
import type { ApiError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";
import type { GuildSettings } from "@/types/settings";

import { PanelError, PanelHeader, PanelLoading, SaveBar } from "./settings-shared";

/**
 * 설정 폼 패널 상태 — 폼 로딩·편집·저장(토스트 포함)을 한 곳에 모아요.
 * `map`은 모듈 레벨의 안정 참조여야 해요(useSettingsForm이 의존성으로 써요).
 */
export function useSettingsPanel<T extends Partial<GuildSettings>>(guildId: string, map: (settings: GuildSettings) => T, savedMessage: string, savedHint?: string | null) {
	const state = useSettingsForm(guildId, map);
	const { submit } = state;

	const handleSave = useCallback(async () => {
		try {
			await submit();
			if (savedHint === undefined) notifySaved(savedMessage);
			else notifySaved(savedMessage, savedHint);
		} catch (err) {
			notifyApiError(err, "저장에 실패했어요.");
		}
	}, [submit, savedMessage, savedHint]);

	return { ...state, handleSave };
}

/** 틀이 필요로 하는 패널 상태 — useSettingsPanel 말고 자체 데이터 소스를 쓰는 탭(티켓 등)도 이 모양만 맞추면 돼요 */
export interface SettingsPanelState<T> {
	form: T | null;
	isLoading: boolean;
	error: ApiError | null | undefined;
	dirty: boolean;
	saving: boolean;
	handleSave: () => void | Promise<void>;
	reload: () => void;
}

interface SettingsPanelProps<T> {
	panel: SettingsPanelState<T>;
	icon: ReactNode;
	title: string;
	description: string;
	/** 헤더 오른쪽 액션 */
	action?: ReactNode;
	/** 본문 아래 안내문(InfoBox 등) */
	notice?: ReactNode;
	/** 폼이 준비된 뒤에만 호출돼요 — 구획(SettingsSection)들을 돌려줘요 */
	children: (form: T) => ReactNode;
}

/**
 * 설정 탭 공통 틀 — 로딩·오류 → 카드(헤더 + 본문 + 안내문) → 저장 바.
 * 탭마다 Card/PanelHeader/SaveBar 조합을 직접 짜지 않고 이 틀만 써서 간격·순서를 고정해요.
 */
export function SettingsPanel<T>({ panel, icon, title, description, action, notice, children }: SettingsPanelProps<T>) {
	const { form, isLoading, error, dirty, saving, handleSave, reload } = panel;

	if (isLoading || (!form && !error)) return <PanelLoading label={`${title} 불러오는 중…`} />;
	if (error) return <PanelError error={error} onRetry={reload} />;
	if (!form) return <PanelLoading label={`${title} 불러오는 중…`} />;

	return (
		<Card padding="lg" className="gap-6 overflow-visible">
			<PanelHeader icon={icon} title={title} description={description} action={action} />
			<div>{children(form)}</div>
			{notice}
			<SaveBar dirty={dirty} saving={saving} onSave={handleSave} />
		</Card>
	);
}
