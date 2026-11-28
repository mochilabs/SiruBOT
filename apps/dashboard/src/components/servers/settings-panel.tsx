"use client";

import { type ReactNode, useCallback } from "react";

import { Card } from "@/components/ui/card";
import { useSettingsForm } from "@/hooks/use-guild-settings";
import type { ApiError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";
import type { GuildSettings } from "@/types/settings";

import { PanelError, PanelHeader, PanelLoading, SaveBar } from "./settings-shared";

export function useSettingsPanel<T extends Partial<GuildSettings>>(guildId: string, map: (settings: GuildSettings) => T, savedMessage: string, savedHint?: string | null) {
	const state = useSettingsForm(guildId, map);
	const { submit } = state;

	const handleSave = useCallback(async (): Promise<boolean> => {
		try {
			await submit();
			if (savedHint === undefined) notifySaved(savedMessage);
			else notifySaved(savedMessage, savedHint);
			return true;
		} catch (err) {
			notifyApiError(err, "저장에 실패했어요.");
			return false;
		}
	}, [submit, savedMessage, savedHint]);

	return { ...state, handleSave };
}

export interface SettingsPanelState<T> {
	form: T | null;
	isLoading: boolean;
	error: ApiError | null | undefined;
	dirty: boolean;
	saving: boolean;
	handleSave: () => boolean | void | Promise<boolean | void>;
	reload: () => void;
}

interface SettingsPanelProps<T> {
	panel: SettingsPanelState<T>;
	icon: ReactNode;
	title: string;
	description: string;
	action?: ReactNode;
	notice?: ReactNode;
	children: (form: T) => ReactNode;
}

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
