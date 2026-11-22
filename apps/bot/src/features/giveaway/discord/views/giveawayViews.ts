import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, TextDisplayBuilder, type ContainerBuilder } from 'discord.js';
import { createContainer, emoji } from '@sirubot/utils';
import { describeGiveawayCondition } from '@sirubot/utils/giveaway';
import { notice } from '../../../../lib/notice.ts';
import type { GiveawayCardData } from '../../application/giveawayService.ts';
import { giveawayId } from '../customIds.ts';

const ACCENT = '#FF8FB1';
const ENDED_ACCENT = '#8E9297';

const unix = (date: Date) => Math.floor(date.getTime() / 1000);
const mentions = (ids: readonly string[]) => ids.map((id) => `<@${id}>`).join(' ');

/** 참여 카드 — 진행 중이면 "참여" 버튼, 끝나거나 취소되면 결과와 비활성 버튼 */
export function giveawayCard(card: GiveawayCardData): ContainerBuilder {
	const running = card.status === 'running';
	const container = createContainer(running ? ACCENT : ENDED_ACCENT);

	const title = card.status === 'cancelled' ? `${emoji('error')} 취소된 나눔` : `${emoji('party')} 나눔${running ? '' : ' 종료'}`;
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n### ${card.prize}`));

	const lines: string[] = [];
	if (running) {
		lines.push(
			`${emoji('trophy')} 당첨자 **${card.winnerCount}명**`,
			`${emoji('hourglass')} 마감 <t:${unix(card.endsAt)}:R> (<t:${unix(card.endsAt)}:f>)`
		);
	} else if (card.status === 'ended') {
		lines.push(
			card.winnerIds.length > 0
				? `${emoji('trophy')} 당첨자: ${mentions(card.winnerIds)}`
				: `${emoji('info')} 조건을 통과한 참여자가 없어서 당첨자가 없어요.`
		);
	}
	lines.push(`${emoji('people')} 참여자 **${card.entryCount}명**`);
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

	if (card.conditions.length > 0) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`**참여 조건**\n${card.conditions.map((c) => `- ${describeGiveawayCondition(c)}`).join('\n')}`)
		);
	}
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# 주최 <@${card.createdBy}>`));

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(giveawayId.encode('enter', { id: card.id }))
				.setLabel(running ? '참여' : card.status === 'cancelled' ? '취소됨' : '종료됨')
				.setEmoji('🎉')
				.setStyle(running ? ButtonStyle.Primary : ButtonStyle.Secondary)
				.setDisabled(!running)
		)
	);
	return container;
}

/** 카드 메시지로 보낼 때 쓰는 옵션 — 멘션은 보여주기만 하고 알림은 가지 않아요 */
export function giveawayCardMessage(card: GiveawayCardData) {
	return { flags: MessageFlags.IsComponentsV2 as const, components: [giveawayCard(card)], allowedMentions: { parse: [] as never[] } };
}

/** 결과·다시 뽑기 발표 문구 — 당첨자에게만 알림이 가요 */
export function giveawayAnnouncement(card: GiveawayCardData, kind: 'end' | 'reroll', winnerIds: readonly string[]): string {
	if (winnerIds.length === 0) return `${emoji('info')} **${card.prize}** 나눔은 조건을 통과한 참여자가 없어서 당첨자가 없어요.`;
	const head = kind === 'reroll' ? '새 당첨자를 다시 뽑았어요!' : '나눔이 끝났어요!';
	return `${emoji('party')} ${head}\n${emoji('trophy')} **${card.prize}** 당첨을 축하해요: ${mentions(winnerIds)}`;
}

/** 한 줄 결과 안내 (Components V2) */
export function giveawayNoticeView(message: string) {
	return { flags: MessageFlags.IsComponentsV2 as const, components: [notice(message)] };
}
