import { emoji } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { textContainer } from './textContainer.ts';

export const RPS_LABELS = ['가위', '바위', '보'];

export const rpsIcons = () => [emoji('scissors'), emoji('fist'), emoji('wave')] as const;

/** 가위바위보 선택 화면 — 버튼 customId `game:rps:{0|1|2}`는 games 인터랙션 핸들러가 파싱해요 */
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
			new ButtonBuilder().setCustomId('game:rps:0').setLabel('가위').setEmoji(emoji('scissors')).setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('game:rps:1').setLabel('바위').setEmoji(emoji('fist')).setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId('game:rps:2').setLabel('보').setEmoji(emoji('wave')).setStyle(ButtonStyle.Danger)
		)
	);
	return container;
}

/** 가위바위보 결과 화면 — `game:rps:again` 버튼 포함 */
export function rpsResultView(displayName: string, userPick: number, botPick: number, streakLine: string | null) {
	const outcome = (userPick - botPick + 3) % 3;
	// 승·무는 앱 이모지를 쓰지만, 앱 이모지 표(emoji-ids.json)에 패배 계열 이모지가 없어 패만 유니코드를 유지해요
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
			new ButtonBuilder().setCustomId('game:rps:again').setLabel('다시하기').setEmoji(emoji('repeat')).setStyle(ButtonStyle.Secondary)
		)
	);
	return container;
}
