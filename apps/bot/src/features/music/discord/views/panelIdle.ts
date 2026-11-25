import { createContainer, emoji } from '@sirubot/utils';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	SeparatorBuilder,
	SeparatorSpacingSize,
	StringSelectMenuBuilder,
	TextDisplayBuilder
} from 'discord.js';
import { panelId } from '../customIds.ts';

export interface PanelRecentTrack {
	/** Track 테이블 id — 셀렉트 값으로 쓴다 */
	id: string;
	title: string;
	artist: string;
	url: string;
}

export interface PanelIdleOptions {
	/** 채팅 입력 재생이 켜져 있는지 */
	inputPlay: boolean;
	/** 입력 재생 모드 */
	inputMode: 'play' | 'select';
	/** 패널 모드 여부 */
	deleteInput: boolean;
	djRoleId: string | null;
	/** 서버에서 최근 재생된 곡 (최신순, 최대 5곡) */
	recent: PanelRecentTrack[];
	dashboardUrl: string | null;
	guildId: string;
}

/** 기본 채널 상시 패널의 대기 화면 — 재생이 없을 때 컨트롤러 메시지를 이 모습으로 되돌려요. */
export function panelIdleView(options: PanelIdleOptions) {
	const usage = options.inputPlay
		? `이 채널에 **곡 제목이나 링크**를 입력하면 ${options.inputMode === 'select' ? '검색 결과 5개 중 골라서' : '바로'} 재생해요.`
		: '`/재생`으로 곡을 틀어 보세요. 채널 설정에서 **채팅 입력 재생**을 켜면 곡 제목만 입력해도 재생해요.';
	const settings = [
		`${emoji('cd')} DJ 역할: ${options.djRoleId ? `<@&${options.djRoleId}>` : '없음'}`,
		`${emoji('inbox_tray')} 입력 재생: ${options.inputPlay ? `켜짐 (${options.inputMode === 'select' ? '선택' : '즉시'}${options.deleteInput ? ' · 패널 모드' : ''})` : '꺼짐'}`
	].join(' · ');

	const container = createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(
			[
				`### ${emoji('pin')} 재생 중인 곡이 없어요`,
				usage,
				`-# ${settings}`,
				'-# 재생이 시작되면 이 메시지가 지금 재생 중인 곡으로 바뀌어요.'
			].join('\n')
		)
	);

	if (options.recent.length > 0) {
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				[
					`**${emoji('scroll')} 최근 재생한 곡**`,
					...options.recent.map((track, index) => `-# ${index + 1}. ${track.title.slice(0, 60)} — ${track.artist.slice(0, 30)}`)
				].join('\n')
			)
		);
		const select = new StringSelectMenuBuilder()
			.setCustomId(panelId.encode('recent'))
			.setPlaceholder('최근 곡 다시 재생')
			.addOptions(
				options.recent.map((track) => ({
					label: track.title.slice(0, 100),
					description: track.artist.slice(0, 100) || undefined,
					value: track.id
				}))
			);
		container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
	}

	const buttons = [
		new ButtonBuilder()
			.setCustomId(panelId.encode('playlist'))
			.setLabel('내 플레이리스트 불러오기')
			.setEmoji(emoji('scroll'))
			.setStyle(ButtonStyle.Secondary)
	];
	if (options.dashboardUrl) {
		buttons.push(
			new ButtonBuilder()
				.setURL(`${options.dashboardUrl}/servers/${options.guildId}`)
				.setLabel('대시보드 열기')
				.setEmoji(emoji('globe'))
				.setStyle(ButtonStyle.Link)
		);
	}
	container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
	return container;
}
