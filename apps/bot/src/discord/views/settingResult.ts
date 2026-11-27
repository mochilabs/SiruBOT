import { WARN_COLOR, emoji, type AppEmojiFallbackKey } from '@sirubot/utils';
import { notice } from '../../lib/notice.ts';

type SettingResultProps = {
	icon: AppEmojiFallbackKey;
	title: string;
	details?: string[];
	hint?: string;
};

export function settingResultView({ icon, title, details = [], hint }: SettingResultProps) {
	const lines = [`### ${emoji(icon)} ${title}`, ...details];
	if (hint) lines.push(`-# ${hint}`);
	return notice(lines.join('\n'));
}

export type ChannelScopeMode = 'all' | 'channels' | 'off';

type ChannelToggleProps = {
	icon: AppEmojiFallbackKey;
	label: string;
	enabled: boolean;
	channelId: string;
	mode: ChannelScopeMode;
	channelCount: number;
	hint?: string;
};

export function channelToggleView({ icon, label, enabled, channelId, mode, channelCount, hint }: ChannelToggleProps) {
	const details: string[] = [];
	if (enabled) {
		details.push(mode === 'all' ? '서버의 모든 채널에서 켜져 있어요.' : `<#${channelId}> 채널에서 사용할 수 있어요.`);
		if (mode === 'channels') details.push(`허용된 채널 ${channelCount}개`);
	} else {
		details.push(`<#${channelId}> 채널에서 껐어요.`);
		details.push(mode === 'off' ? '허용된 채널이 더 없어서 서버에서 모두 꺼졌어요.' : `남은 허용 채널 ${channelCount}개`);
	}
	return settingResultView({ icon, title: `${label} ${enabled ? '켜짐' : '꺼짐'}`, details, hint });
}

export function settingWarningView(title: string, lines: string[]) {
	return notice([`### ${emoji('warning')} ${title}`, ...lines].join('\n'), WARN_COLOR);
}
