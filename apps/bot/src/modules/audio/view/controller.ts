import {
	createContainer,
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
import { getUserQueuedTracks } from '../lavalink/autoPlayRelated.ts';
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

/**
 * 지금부터 유저 대기열이 끝날 때까지의 실제 남은 시간(ms).
 * 현재 곡의 전체 길이에서 현재 위치만큼 빼고, 선예열한 추천곡은 대기열로 세지 않아 제외한다.
 * 스트리밍은 끝나는 시점이 없어 position을 뺸다.
 */
function remainingUntilQueueEnd(player: Player): number {
	const current = player.queue.current;
	const elapsed = current && !current.info.isStream ? Math.min(player.position ?? 0, current.info.duration ?? 0) : 0;
	const queuedDuration = getUserQueuedTracks(player).reduce((acc, track) => acc + (track.info.duration || 0), 0);
	return Math.max(0, (current?.info.duration ?? 0) + queuedDuration - elapsed);
}

export function controllerView({ player, volume }: controllerViewProps) {
	// Container builder
	const containerComponent = createContainer();

	const current = player.queue.current;
	// 선예열한 추천곡은 대기열이 아니므로 개수·남은 시간·버튼 노출에서 제외한다.
	const queueCount = getUserQueuedTracks(player).length;

	// 대기열 안내를 별도 줄 대신 곡 정보 첫 줄(-# 🎵 ...)뒤에 병합해 세로 크기를 줄인다.
	// 대기열이 비어 있으면 병합하지 않는다.
	const trackLines = buildTrackDisplay(player, current, false);
	if (queueCount > 0) {
		trackLines[0] = `${trackLines[0]} • 대기열 ${queueCount}곡 · ${formatTimeToKorean(remainingUntilQueueEnd(player) / 1000)} 남음`;
	}

	const nowplayingTextDisplay = new TextDisplayBuilder().setContent(trackLines.join('\n'));

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
				: player.repeatMode === 'track'
					? wrapPrefix('repeat:track')
					: wrapPrefix('repeat:off')
		)
		.setEmoji(player.repeatMode === 'off' ? '➡️' : player.repeatMode === 'track' ? '🔂' : '🔁');

	// '대기열 보기' 버튼: 상세 목록(페이지네이션)은 버튼 클릭 시 ephemeral 메시지로 표시한다.
	// 컨트롤 버튼 5개(prev·pause·next·repeat·대기열)를 한 줄에 배치한다.
	const queueShowButton = new ButtonBuilder().setCustomId(wrapPrefix('queue:show')).setLabel('대기열').setEmoji('📄');

	const controlActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		[prevButton, pauseButton, nextButton, repeatButton, queueShowButton].map((e) => e.setStyle(ButtonStyle.Secondary))
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

	const chapter = chapters[index];
	return `-# ╰ ${chapter.name} • (${formatTime(chapter.start / 1000)} - ${formatTime(chapter.end / 1000)})`;
}

export function buildTrackDisplay(player: Player, track: Track | null, showTimestamp = true): string[] {
	const contents = [];
	if (!track) {
		contents.push(`### 재생 중인 음악이 없어요.`);
		return contents;
	}

	contents.push(`-# 🎵 <#${player.voiceChannelId}> 에서 ${player.paused ? '일시 정지' : '재생'} 중`);
	contents.push(`### **[${removeEmojis(track.info.title)}](${track.info.uri})**`);

	// 챕터(에피소드) 표시
	const episode = buildEpisodeLine(player);
	if (episode) contents.push(episode);

	// 아티스트와 신청자는 요청대로 각각 별도 줄로 분리한다.
	contents.push(`-# 아티스트: ${track.info.author}`);
	const requesterId = track.requester && typeof track.requester === 'object' ? (track.requester as Record<string, unknown>).id : undefined;
	if (requesterId) {
		contents.push(requesterId === 'related_track' ? `-# 추천 곡 ${EMOJI_SPARKLE}` : `-# 신청자: <@${requesterId}>`);
	}

	// 길이 표기 — 프로그레스바는 제거하고 (지금시간 / 길이) 짧은 줄만 남긴다.
	const durationText = track.info.isStream ? 'LIVE' : formatTime(track.info.duration / 1000);
	if (track.info.isStream) {
		contents.push(`(${durationText}) 실시간 스트리밍`);
	} else if (showTimestamp) {
		contents.push(`-# (${formatTime(player.position / 1000)} / ${durationText})`);
	} else {
		contents.push(`-# (${durationText})`);
	}

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
