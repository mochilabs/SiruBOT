import { createContainer, formatTrack, formatTimeToKorean } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextDisplayBuilder } from 'discord.js';
import { Player, Track } from 'lavalink-client';
import { getUserQueuedTracks } from '../lavalink/autoPlayRelated.ts';

type QueueViewProps = {
	player: Player;
	page: number;
	totalPages: number;
	authorId: string;
};

const QUEUE_PAGE_SIZE = 10;

export const queueCustomIdPrefix = 'queue:page:';

export function queueList({ player, page, totalPages, authorId }: QueueViewProps) {
	const containerComponent = createContainer();
	// 선예열한 추천곡은 대기열 목록에 세지 않는다 (재생에는 그대로 쓰인다).
	const tracks = getUserQueuedTracks(player);
	const start = (page - 1) * QUEUE_PAGE_SIZE;
	const pageTracks = tracks.slice(start, start + QUEUE_PAGE_SIZE);

	const lines = pageTracks.map((track, index) => {
		return `\`#${start + index + 1}\` ${formatTrack(track as Track, {
			showLength: true,
			withMarkdownURL: true,
			cleanTitle: true
		})}`;
	});

	// 카운트가 유저 대기열 곡만 세는 만큼, 남은 시간도 그 곡들만 센다 (재생 중인 곡 제외).
	const queuedDuration = tracks.reduce((acc, track) => acc + (track.info.duration || 0), 0);
	const totalDuration = formatTimeToKorean(queuedDuration / 1000);

	const content = [`### 📄 대기열 목록`, ...lines, ``, `-# 페이지 ${page}/${totalPages} | 총 ${tracks.length}곡 | ${totalDuration} 남음`].join(
		'\n'
	);

	containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

	// Pagination buttons
	if (totalPages > 1) {
		const prevButton = new ButtonBuilder()
			.setCustomId(`${queueCustomIdPrefix}${authorId}:${page - 1}`)
			.setEmoji('◀️')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page <= 1);

		const nextButton = new ButtonBuilder()
			.setCustomId(`${queueCustomIdPrefix}${authorId}:${page + 1}`)
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
