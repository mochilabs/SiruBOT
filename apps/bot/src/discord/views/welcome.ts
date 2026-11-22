import { addSeparator, createContainer, emoji } from '@sirubot/utils';
import { BOT_TAGLINE } from '@sirubot/utils/brand';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ApplicationCommand, type ContainerBuilder } from 'discord.js';
import { commandMention } from '../../lib/commandMention.ts';
import { onboardingId } from '../customIds.ts';

export const onboardingSettingsCustomId = onboardingId.encode('settings');
export const onboardingTourCustomId = onboardingId.encode('tour');

export interface WelcomeViewOptions {
	/** `first`: 처음 들어옴(전체 안내) · `rejoin`: 다시 들어옴(짧은 안내, D-3) */
	kind: 'first' | 'rejoin';
	/** 명령 멘션 색인 (`fetchCommandIndex`). 비어 있으면 인라인 코드로 보여요. */
	index: ReadonlyMap<string, ApplicationCommand>;
	/** null이면 "대시보드 열기" 버튼을 숨겨요 (D-4) */
	dashboardUrl: string | null;
	/** null이면 지원 서버 안내를 숨겨요 */
	supportServerUrl: string | null;
}

function buttons(options: WelcomeViewOptions): ActionRowBuilder<ButtonBuilder> {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(onboardingSettingsCustomId).setLabel('서버 설정 시작').setEmoji('⚙️').setStyle(ButtonStyle.Primary)
	);
	if (options.kind === 'rejoin') return row;
	if (options.dashboardUrl) {
		row.addComponents(new ButtonBuilder().setURL(options.dashboardUrl).setLabel('대시보드 열기').setEmoji('🌐').setStyle(ButtonStyle.Link));
	}
	row.addComponents(
		new ButtonBuilder().setCustomId(onboardingTourCustomId).setLabel('기능 둘러보기').setEmoji('🧭').setStyle(ButtonStyle.Secondary)
	);
	return row;
}

function bodyText(options: WelcomeViewOptions): string {
	if (options.kind === 'rejoin') {
		return [`### 다시 와 주셔서 고마워요! ${emoji('music_note')}`, '기존 설정은 그대로 남아 있어요.'].join('\n');
	}
	const lines = [
		`### 시루를 초대해 주셔서 고마워요! ${emoji('music_note')}`,
		BOT_TAGLINE,
		'',
		'**바로 해 보기**',
		`- 음성 채널에 들어가서 ${commandMention('play', options.index)}에 곡 이름을 넣어 보세요.`,
		'- 채팅에서 저를 멘션해서 질문하거나 명령할 수 있어요.',
		`- ${commandMention('help', options.index)}로 할 수 있는 일을 카테고리별로 볼 수 있어요.`
	];
	if (options.supportServerUrl) lines.push('', `-# 문의는 [지원 서버](${options.supportServerUrl})로 남겨 주세요.`);
	return lines.join('\n');
}

/** 서버 가입 안내 메시지 (Components V2) */
export function welcomeView(options: WelcomeViewOptions): ContainerBuilder {
	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(bodyText(options)));
	addSeparator(container);
	container.addActionRowComponents(buttons(options));
	return container;
}
