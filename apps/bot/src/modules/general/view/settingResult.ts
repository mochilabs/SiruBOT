import { WARN_COLOR, emoji, type AppEmojiFallbackKey } from '@sirubot/utils';
import { notice } from './notice.ts';

type SettingResultProps = {
	icon: AppEmojiFallbackKey;
	/** 무엇이 어떻게 바뀌었는지 한 줄 (예: `AI 채팅 켜짐`) */
	title: string;
	/** 바뀐 범위·값의 세부 — 줄마다 한 항목 */
	details?: string[];
	/** 다음에 해야 할 일이나 보충 설명 (서브텍스트) */
	hint?: string;
};

/** 설정 변경 결과 카드 — 제목 + 세부 + 보충 설명 순서로 모든 설정 명령이 같은 모양을 써요. */
export function settingResultView({ icon, title, details = [], hint }: SettingResultProps) {
	const lines = [`### ${emoji(icon)} ${title}`, ...details];
	if (hint) lines.push(`-# ${hint}`);
	return notice(lines.join('\n'));
}

export type ChannelScopeMode = 'all' | 'channels' | 'off';

type ChannelToggleProps = {
	icon: AppEmojiFallbackKey;
	/** 기능 이름 (예: `AI 채팅`, `채팅 낭독`) */
	label: string;
	enabled: boolean;
	channelId: string;
	/** 변경 뒤 서버 전체 적용 범위 */
	mode: ChannelScopeMode;
	/** 변경 뒤 허용된 채널 수 */
	channelCount: number;
	hint?: string;
};

/** 채널 단위 켜기/끄기 결과 — AI 채팅·낭독·채팅 유틸이 같은 문구 구조를 써요. */
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

/** 설정은 저장했지만 후속 처리가 일부 실패했을 때 — 에러가 아니라 경고 톤으로 알려요. */
export function settingWarningView(title: string, lines: string[]) {
	return notice([`### ${emoji('warning')} ${title}`, ...lines].join('\n'), WARN_COLOR);
}
