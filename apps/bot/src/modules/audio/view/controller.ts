import {
	chunkArray,
	createContainer,
	emojiProgressBar,
	formatTime,
	formatTimeToKorean,
	formatTrack,
	isDev,
	versionInfo,
	removeEmojis,
	volumeToEmoji,
	EMOJI_SPARKLE,
	BOT_NAME
} from '@sirubot/utils';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	StringSelectMenuBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';
import { Player, Track } from 'lavalink-client';

type controllerViewProps = {
	player: Player;
	volume?: number;
	page?: number;
};

export const customIdPrefix = 'controller:';
const wrapPrefix = (customId: string) => {
	return customIdPrefix + customId;
};

export function controllerView({ player, volume, page: requestedPage }: controllerViewProps) {
	// Container builder
	const containerComponent = createContainer();

	const current = player.queue.current;

	const nowplayingTextDisplay = new TextDisplayBuilder().setContent(buildTrackDisplay(player, current).join('\n'));

	const thumbnail = new ThumbnailBuilder();

	// const stopButton = new ButtonBuilder().setCustomId(wrapPrefix('stop')).setEmoji('⏹');

	const prevButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('prev'))
		.setEmoji('⏮️')
		.setDisabled(player.queue.previous.length === 0);

	const pauseButton = new ButtonBuilder()
		.setCustomId(player.paused ? wrapPrefix('resume') : wrapPrefix('pause'))
		.setEmoji(player.paused ? '▶️' : '⏸');

	const nextButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('next'))
		.setEmoji('⏭️')
		.setDisabled(player.queue.tracks.length === 0);

	// Repeat state 아이콘 바꾸기
	const repeatButton = new ButtonBuilder()
		.setCustomId(
			player.repeatMode === 'off'
				? wrapPrefix('repeat:queue')
				: player.repeatMode === 'queue'
					? wrapPrefix('repeat:track')
					: wrapPrefix('repeat:off')
		)
		.setEmoji(player.repeatMode === 'off' ? '➡️' : player.repeatMode === 'track' ? '🔂' : '🔁');

	const controlActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		[prevButton, pauseButton, nextButton, repeatButton].map((e) => e.setStyle(ButtonStyle.Secondary))
	);

	const separator = new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large);

	if (current?.info.artworkUrl) {
		const titleSection = new SectionBuilder().addTextDisplayComponents(nowplayingTextDisplay);
		thumbnail.setURL(current?.info.artworkUrl ?? '');
		titleSection.setThumbnailAccessory(thumbnail);
		containerComponent.addSectionComponents(titleSection);
	} else {
		containerComponent.addTextDisplayComponents(nowplayingTextDisplay);
	}

	containerComponent.addActionRowComponents(controlActionRow);

	// 큐 섹션
	if (player.queue.tracks.length > 0) {
		containerComponent.addSeparatorComponents(separator);
		const QUEUE_PAGE_CHUNK_SIZE = 5;
		const queueChunks = chunkArray(player.queue.tracks, QUEUE_PAGE_CHUNK_SIZE);
		const page = Math.max(1, Math.min(requestedPage ?? 1, queueChunks.length));

		let pageContent: string = queueChunks[page - 1]
			.map((track, index) => {
				// index = 1 ~ 10
				// page = 1 ~ end
				return `\`\`#${index + 1 + (page - 1) * QUEUE_PAGE_CHUNK_SIZE}\`\` - ${formatTrack(track as Track, {
					showLength: true,
					withMarkdownURL: true,
					cleanTitle: true
				})}`;
			})
			.join('\n');

		const queueTextDisplay = new TextDisplayBuilder().setContent(
			`### 📄 대기열 목록\n${pageContent}\n-# 페이지 ${page}/${queueChunks.length} | ${formatTimeToKorean(player.queue.utils.totalDuration() / 1000)} 남음`
		);

		const selectMenu = new StringSelectMenuBuilder().setCustomId(wrapPrefix('queue:select')).setOptions(
			queueChunks[page - 1].map((track, index) => {
				return {
					label: `#${index + 1 + (page - 1) * QUEUE_PAGE_CHUNK_SIZE} ${formatTrack(track as Track, { showLength: true, withMarkdownURL: false })}`,
					value: (index + 1 + (page - 1) * QUEUE_PAGE_CHUNK_SIZE).toString(),
					default: index === 0
				};
			})
		);

		const removeButton = new ButtonBuilder().setCustomId(wrapPrefix('queue:remove')).setEmoji('🗑️').setStyle(ButtonStyle.Danger);

		const queuePrev = new ButtonBuilder()
			.setCustomId(wrapPrefix('queue:prev'))
			.setEmoji('◀️')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page === 1);

		// const pageIndicator = new ButtonBuilder()
		// 	.setCustomId(wrapPrefix('queue:page:indicator'))
		// 	.setLabel(`${page}/${queueChunks.length}`)
		// 	.setStyle(ButtonStyle.Secondary)
		// 	.setDisabled(true);

		const queueNext = new ButtonBuilder()
			.setCustomId(wrapPrefix('queue:next'))
			.setEmoji('▶️')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page === queueChunks.length);

		const jumpTo = new ButtonBuilder().setCustomId(wrapPrefix('queue:jumpTo')).setEmoji('↪️').setStyle(ButtonStyle.Secondary);

		const trackSelectActionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

		const queueActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents([queuePrev, queueNext, jumpTo, removeButton]);

		containerComponent
			.addTextDisplayComponents(queueTextDisplay)
			.addActionRowComponents(trackSelectActionRow)
			.addActionRowComponents(queueActionRow);
	}

	const separatorSmall = new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

	containerComponent
		.addSeparatorComponents(separatorSmall)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(buildFooterSegments(player, volume).join(' | ')));

	return containerComponent;
}

export function buildTrackDisplay(player: Player, track: Track | null): string[] {
	const contents = [];
	if (!track) {
		contents.push(`### 재생 중인 음악이 없어요.`);
		return contents;
	}

	const durationText = track.info.isStream ? 'LIVE' : formatTime(track.info.duration / 1000);

	contents.push(`-# 🎵 <#${player.voiceChannelId}> 에서 ${player.paused ? '일시 정지' : '재생'} 중`);
	contents.push(`### **[${removeEmojis(track.info.title)}](${track.info.uri})**`);

	if (track.info.isStream) {
		contents.push(`[${durationText}][실시간 스트리밍]`);
	} else {
		contents.push(
			`(${formatTime(player.position / 1000)} / ${formatTime(track.info.duration / 1000)}) ${emojiProgressBar(player.position / track.info.duration)}`
		);
	}

	const requesterInfo = [];
	requesterInfo.push(`-# 아티스트: ${track.info.author}`);
	const requesterId = (track.requester as any)?.id;
	if (requesterId) {
		requesterInfo.push(requesterId === 'related_track' ? `추천 곡 ${EMOJI_SPARKLE}` : `신청자: <@${requesterId}>`);
	}
	contents.push(requesterInfo.join(' | '));

	return contents;
}

export function buildFooterSegments(player: Player, volume?: number): string[] {
	const segments = [];
	segments.push(`-# 📡 재생 서버: ${player.node.id}`);
	if (volume !== undefined) {
		segments.push(`${volumeToEmoji(volume)} 볼륨: ${volume}%`);
	} else if (player.volume !== undefined) {
		segments.push(`${volumeToEmoji(player.volume)} 볼륨: ${player.volume}%`);
	}
	segments.push(
		`${BOT_NAME} ${isDev ? `${versionInfo.getGitBranch()}/${versionInfo.getGitHash()}` : `${versionInfo.getVersion()} (${versionInfo.getGitHash()})`}`
	);
	return segments;
}
