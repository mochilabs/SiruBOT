import {
	chunkArray,
	createContainer,
	emojiProgressBar,
	formatTime,
	formatTimeToKorean,
	formatTrack,
	isDev,
	versionInfo,
	removeEmojis
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
};

export function controllerView({ player }: controllerViewProps) {
	// Container builder
	const containerComponent = createContainer();

	// Current track
	const current = player.queue.current;

	const durationText = current ? (current.info.isStream ? 'LIVE' : formatTime(current?.info.duration / 1000)) : '';
	const firstContent = !current
		? `### 재생 중인 음악이 없어요.`
		: `### 🎵 <#${player.voiceChannelId}> 에서 재생 중
### **[${removeEmojis(current.info.title)}](${current.info.uri})**
${emojiProgressBar(player.position / current.info.duration)} [${current.info.isStream ? durationText : `${formatTime(player.position / 1000)}/${formatTime(current.info.duration / 1000)}`}]
-# 아티스트: ${current.info.author}${(current.requester as any).id ? ` | 신청자: <@${(current.requester as any).id}>` : ''}`;
	const nowplayingTextDisplay = new TextDisplayBuilder().setContent(firstContent);

	const thumbnail = new ThumbnailBuilder();

	const prevButton = new ButtonBuilder()
		.setCustomId('prev')
		.setEmoji('⏮️')
		.setDisabled(player.queue.previous.length === 0);

	const stopButton = new ButtonBuilder().setCustomId('stop').setEmoji('⏹');

	const pauseButton = new ButtonBuilder().setCustomId(player.paused ? 'resume' : 'pause').setEmoji(player.paused ? '▶️' : '⏸');

	const nextButton = new ButtonBuilder()
		.setCustomId('next')
		.setEmoji('⏭️')
		.setDisabled(player.queue.tracks.length === 0);

	// Repeat state 아이콘 바꾸기
	const repeatButton = new ButtonBuilder()
		.setCustomId(player.repeatMode === 'off' ? 'setrepeat_queue' : player.repeatMode === 'queue' ? 'setrepeat_track' : 'setrepeat_off')
		.setEmoji(player.repeatMode === 'off' ? '🔁' : player.repeatMode === 'track' ? '🔂' : '🔁');

	const controlActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		[stopButton, prevButton, pauseButton, nextButton, repeatButton].map((e) => e.setStyle(ButtonStyle.Secondary))
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
		let page = 1; // TODO: 페이지 움직이게 해야함

		const QUEUE_PAGE_CHUNK_SIZE = 5;
		const queueChunks = chunkArray(player.queue.tracks, 5);
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

		const selectMenu = new StringSelectMenuBuilder().setCustomId('qc-sel').setOptions(
			queueChunks[page - 1].map((track, index) => {
				return {
					label: `#${index + 1 + (page - 1) * QUEUE_PAGE_CHUNK_SIZE} ${formatTrack(track as Track, { showLength: true, withMarkdownURL: false })}`,
					value: (index + 1 + (page - 1) * QUEUE_PAGE_CHUNK_SIZE).toString(),
					default: index === 0
				};
			})
		);

		const removeButton = new ButtonBuilder().setCustomId('queuerm').setEmoji('🗑️').setStyle(ButtonStyle.Danger);

		const queuePrev = new ButtonBuilder()
			.setCustomId('qprev')
			.setEmoji('◀️')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page === 1);

		const queueNext = new ButtonBuilder()
			.setCustomId('qnext')
			.setEmoji('▶️')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page === queueChunks.length);

		const jumpTo = new ButtonBuilder().setCustomId('qjumpto').setEmoji('↪️').setStyle(ButtonStyle.Secondary);

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
		.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`-# 📡 재생 서버: ${player.node.id} | 치노봇 ${isDev ? `${versionInfo.getGitBranch()}/${versionInfo.getGitHash()}` : `${versionInfo.getVersion()} (${versionInfo.getGitHash()})`}`
			)
		);

	return containerComponent;
}
