import {
	createContainer,
	emojiProgressBar,
	formatTime,
	formatTimeToKorean,
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
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';
import { Player, Track } from 'lavalink-client';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';

type controllerViewProps = {
	player: CustomPlayer;
	volume?: number;
	page?: number;
};

export const customIdPrefix = 'controller:';
const wrapPrefix = (customId: string) => {
	return customIdPrefix + customId;
};

export function controllerView({ player, volume }: controllerViewProps) {
	// Container builder
	const containerComponent = createContainer();

	const current = player.queue.current;

	const nowplayingTextDisplay = new TextDisplayBuilder().setContent(buildTrackDisplay(player, current).join('\n'));

	const thumbnail = new ThumbnailBuilder();

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

	if (current?.info.artworkUrl) {
		const titleSection = new SectionBuilder().addTextDisplayComponents(nowplayingTextDisplay);
		thumbnail.setURL(current?.info.artworkUrl ?? '');
		titleSection.setThumbnailAccessory(thumbnail);
		containerComponent.addSectionComponents(titleSection);
	} else {
		containerComponent.addTextDisplayComponents(nowplayingTextDisplay);
	}

	containerComponent.addActionRowComponents(controlActionRow);

	// 큐 섹션: 인라인 목록 대신 '대기열 보기' 버튼 하나로 축소.
	// 상세 목록(페이지네이션)은 버튼 클릭 시 ephemeral 메시지로 표시한다.
	if (player.queue.tracks.length > 0) {
		const queueCount = player.queue.tracks.length;
		const remaining = formatTimeToKorean(player.queue.utils.totalDuration() / 1000);

		const queueShowButton = new ButtonBuilder()
			.setCustomId(wrapPrefix('queue:show'))
			.setLabel(`대기열 ${queueCount}곡 보기`)
			.setEmoji('📄')
			.setStyle(ButtonStyle.Secondary);

		const queueHint = new TextDisplayBuilder().setContent(`-# 대기열 ${queueCount}곡 | ${remaining} 남음`);

		containerComponent
			.addTextDisplayComponents(queueHint)
			.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(queueShowButton));
	}

	const separatorSmall = new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

	containerComponent
		.addSeparatorComponents(separatorSmall)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(buildFooterSegments(player, volume).join(' | ')));

	return containerComponent;
}

/** 현재 위치 기준으로 진행 중인 챕터 한 줄을 만든다. 챕터가 없으면 null. */
function buildEpisodeLine(player: Player): string | null {
	const chapters = (player as CustomPlayer).chapters;
	if (!Array.isArray(chapters) || chapters.length === 0) return null;

	const position = player.position ?? 0;
	const index = chapters.findIndex((chapter) => position >= chapter.start && position < chapter.end);
	if (index < 0) return null;

	return `-# 🎬 ${index + 1}/${chapters.length} · ${chapters[index].name}`;
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

	const episode = buildEpisodeLine(player);
	if (episode) contents.push(episode);

	const requesterInfo = [];
	requesterInfo.push(`-# 아티스트: ${track.info.author}`);
	const requesterId = track.requester && typeof track.requester === 'object' ? (track.requester as Record<string, unknown>).id : undefined;
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
