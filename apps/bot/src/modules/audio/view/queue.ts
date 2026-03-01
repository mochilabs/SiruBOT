import { createContainer, formatTrack, formatTimeToKorean } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextDisplayBuilder } from 'discord.js';
import { Player, Track } from 'lavalink-client';

type QueueViewProps = {
	player: Player;
	page: number;
	totalPages: number;
};

const QUEUE_PAGE_SIZE = 10;

export const queueCustomIdPrefix = 'queue:page:';

export function queueList({ player, page, totalPages }: QueueViewProps) {
	const containerComponent = createContainer();
	const tracks = player.queue.tracks;
	const start = (page - 1) * QUEUE_PAGE_SIZE;
	const pageTracks = tracks.slice(start, start + QUEUE_PAGE_SIZE);

	const lines = pageTracks.map((track, index) => {
		return `\`#${start + index + 1}\` ${formatTrack(track as Track, {
			showLength: true,
			withMarkdownURL: true,
			cleanTitle: true
		})}`;
	});

	const totalDuration = formatTimeToKorean(player.queue.utils.totalDuration() / 1000);

	const content = [`### 📄 대기열 목록`, ...lines, ``, `-# 페이지 ${page}/${totalPages} | 총 ${tracks.length}곡 | ${totalDuration} 남음`].join(
		'\n'
	);

	containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

	// Pagination buttons
	if (totalPages > 1) {
		const prevButton = new ButtonBuilder()
			.setCustomId(`${queueCustomIdPrefix}${page - 1}`)
			.setEmoji('◀️')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page <= 1);

		const nextButton = new ButtonBuilder()
			.setCustomId(`${queueCustomIdPrefix}${page + 1}`)
			.setEmoji('▶️')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page >= totalPages);

		const pageIndicator = new ButtonBuilder()
			.setCustomId('queue:page:indicator')
			.setLabel(`${page} / ${totalPages}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true);

		containerComponent.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, pageIndicator, nextButton));
	}

	return containerComponent;
}

export function queueEmpty() {
	return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent('📭 대기열이 비어있어요.'));
}

export function queueShuffled({ count }: { count: number }) {
	return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔀 대기열의 **${count}곡**을 셔플했어요.`));
}

export function queueCleared({ count }: { count: number }) {
	return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🗑️ 대기열의 **${count}곡**을 비웠어요.`));
}

export function queueRemoved({ track, position }: { track: Track; position: number }) {
	return createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`🗑️ \`#${position}\` **${track.info.title}**을(를) 대기열에서 제거했어요.`)
	);
}

export function queueMoved({ track, from, to }: { track: Track; from: number; to: number }) {
	return createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`↕️ **${track.info.title}**을(를) \`#${from}\` → \`#${to}\`(으)로 이동했어요.`)
	);
}

export const QUEUE_PAGE_SIZE_EXPORT = QUEUE_PAGE_SIZE;
