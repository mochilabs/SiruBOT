import { addSeparator, emoji, createContainer, formatTime } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';
import { Track, UnresolvedTrack } from 'lavalink-client';
import { truncateText } from '../../../../lib/text.ts';
import { searchId } from '../customIds.ts';

export const searchSelectCustomId = searchId.encode('select');
export const searchCancelCustomId = searchId.encode('cancel');

function trackDurationText(track: Track | UnresolvedTrack): string {
	return formatTime((track.info.duration ?? 0) / 1000);
}

export function searchResults(query: string, tracks: (Track | UnresolvedTrack)[]): ContainerBuilder {
	const container = createContainer();

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji('mag')} **${query}** 검색 결과예요. 재생할 곡을 선택해 주세요.`));
	addSeparator(container);

	const listText = tracks
		.map(
			(track, index) =>
				`${index + 1}. **${truncateText(track.info.title ?? '(제목 없음)', 60)}** · ${truncateText(track.info.author ?? '알 수 없음', 40)} · ${trackDurationText(track)}`
		)
		.join('\n');
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(listText));

	addSeparator(container);

	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(searchSelectCustomId)
		.setPlaceholder('재생할 곡을 선택하세요')
		.setMinValues(1)
		.setMaxValues(1)
		.addOptions(
			tracks.map((track, index) => ({
				label: truncateText(`${index + 1}. ${track.info.title ?? '(제목 없음)'}`, 100),
				value: String(index),
				description: truncateText(`${track.info.author ?? '알 수 없음'} · ${trackDurationText(track)}`, 100)
			}))
		);

	container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

	const cancelButton = new ButtonBuilder()
		.setCustomId(searchCancelCustomId)
		.setLabel('취소')
		.setEmoji(emoji('error'))
		.setStyle(ButtonStyle.Secondary);
	container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(cancelButton));

	return container;
}

export function searchTimeout(): ContainerBuilder {
	return createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`${emoji('hourglass')} 시간이 지나 검색을 취소했어요. 다시 /검색을 사용해 주세요.`)
	);
}

export function searchCancelled(): ContainerBuilder {
	return createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`${emoji('stop')} 검색을 취소했어요. 다시 /검색을 사용해 주세요.`)
	);
}
