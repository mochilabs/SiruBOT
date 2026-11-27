import { emoji } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { gameId } from '../customIds.ts';
import { textContainer } from './textContainer.ts';

export const RPS_LABELS = ['가위', '바위', '보'];

export const rpsIcons = () => [emoji('scissors'), emoji('fist'), emoji('wave')] as const;

export function rpsChoiceView(displayName: string) {
	const container = textContainer([
		`### ${emoji('fist')} 가위바위보`,
		'',
		`**${displayName}** 님, 무엇을 낼까요?`,
		'',
		'-# 아래 버튼을 눌러주세요. 결과는 나만 보여요.'
	]);
	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(gameId.encode('rps', { pick: 0 }))
				.setLabel('가위')
				.setEmoji(emoji('scissors'))
				.setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId(gameId.encode('rps', { pick: 1 }))
				.setLabel('바위')
				.setEmoji(emoji('fist'))
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(gameId.encode('rps', { pick: 2 }))
				.setLabel('보')
				.setEmoji(emoji('wave'))
				.setStyle(ButtonStyle.Danger)
		)
	);
	return container;
}

export function rpsResultView(displayName: string, userPick: number, botPick: number, streakLine: string | null) {
	const outcome = (userPick - botPick + 3) % 3;
	const resultText = outcome === 0 ? `${emoji('cd')} 비겼어요!` : outcome === 1 ? `${emoji('party')} 이겼어요!` : `${emoji('sad')} 졌어요!`;
	const resultEmoji = outcome === 0 ? emoji('fist_bump') : outcome === 1 ? emoji('smile') : emoji('melt');

	const lines = [
		`### ${emoji('fist')} 가위바위보 결과`,
		`**${displayName}** 님: ${rpsIcons()[userPick]} ${RPS_LABELS[userPick]}`,
		`**봇**: ${rpsIcons()[botPick]} ${RPS_LABELS[botPick]}`,
		'',
		`**${resultEmoji} ${resultText}**`
	];
	if (streakLine) lines.push(streakLine);

	const container = textContainer(lines);
	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(gameId.encode('rpsAgain')).setLabel('다시하기').setEmoji(emoji('repeat')).setStyle(ButtonStyle.Secondary)
		)
	);
	return container;
}
