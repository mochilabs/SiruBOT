import { emoji, emojiProgressBar, createContainer, formatTrack, formatTime, formatTimeToKorean, removeEmojis, volumeToEmoji } from '@sirubot/utils';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';
import { Player, Track } from 'lavalink-client';
import { getUserQueuedTracks, remainingUntilQueueEnd } from '../../lavalink/autoPlayRelated.ts';
import { nextRepeatMode, repeatEmoji } from './repeat.ts';
import { controllerId } from '../customIds.ts';
import { RELATED_TRACK_REQUESTER_ID, TTS_CLIP_REQUESTER_ID } from '../../lavalink/requester.ts';
import { CustomPlayer } from '../../lavalink/player/customPlayer.ts';
import { nowPlayingTrack } from '../../lavalink/player/nowPlaying.ts';
import { currentChapter, currentChapterIndex } from '../../lavalink/player/chapters.ts';

const MAX_TRACK_URL_LENGTH = 70;

const QUEUE_PREVIEW_COUNT = 5;

type controllerViewProps = {
	player: CustomPlayer;
	volume?: number;
	nowPlayingCardUrl?: string;
	panel?: boolean;
};

const queueViewCustomId = controllerId.encode('queueView');

export function controllerView({ player, volume, nowPlayingCardUrl, panel = false }: controllerViewProps) {
	const containerComponent = createContainer();

	const current = nowPlayingTrack(player);
	const queuedTracks = getUserQueuedTracks(player);
	const queueCount = queuedTracks.length;

	const statusLabel = current ? (current.info.isStream ? '실시간으로 재생 중' : player.paused ? '일시정지됨' : '재생 중') : null;
	// lavalink-client가 voiceChannelId를 비우는 순간에도 라벨이 유지되도록 options.voiceChannelId를 fallback으로 쓴다.
	const voiceChannelId = player.voiceChannelId ?? player.options?.voiceChannelId;
	const playbackLabel = current && voiceChannelId && statusLabel ? `-# <#${voiceChannelId}> 에서 ${statusLabel}` : null;

	const trackLines = buildTrackDisplay(player, current, { progressEmoji: !nowPlayingCardUrl });
	const nowplayingTextDisplay = new TextDisplayBuilder().setContent([...(playbackLabel ? [playbackLabel] : []), ...trackLines].join('\n'));
	const thumbnail = new ThumbnailBuilder();

	const prevButton = new ButtonBuilder()
		.setCustomId(controllerId.encode('prev'))
		.setEmoji(emoji('arrow_back'))
		.setDisabled(player.queue.previous.length === 0);

	const pauseButton = new ButtonBuilder()
		.setCustomId(player.paused ? controllerId.encode('resume') : controllerId.encode('pause'))
		.setEmoji(player.paused ? emoji('play') : emoji('pause'));

	const nextButton = new ButtonBuilder()
		.setCustomId(controllerId.encode('next'))
		.setEmoji(emoji('arrow_forward'))
		.setDisabled(player.queue.tracks.length === 0);

	const stopButton = new ButtonBuilder().setCustomId(controllerId.encode('stop')).setEmoji(emoji('stop'));

	const repeatButton = new ButtonBuilder()
		.setCustomId(controllerId.encode('repeat', { mode: nextRepeatMode(player.repeatMode) }))
		.setEmoji(repeatEmoji(player.repeatMode));

	const primaryComponents: ButtonBuilder[] = [prevButton, pauseButton, nextButton, stopButton, repeatButton];
	const controlActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		primaryComponents.map((button) => {
			return button.setStyle(ButtonStyle.Secondary);
		})
	);

	const chapters = player.chapters ?? [];
	const chapterIndex = chapters.length > 0 ? currentChapterIndex(player) : null;
	const atChapterStart = chapterIndex !== null && (player.position ?? 0) - chapters[chapterIndex]!.start < 5_000;
	const chapterPrevButton = new ButtonBuilder()
		.setCustomId(controllerId.encode('chapter', { direction: 'prev' }))
		.setLabel('이전 챕터')
		.setEmoji(emoji('arrow_back'))
		.setDisabled(chapterIndex === null || (chapterIndex === 0 && atChapterStart));
	const chapterNextButton = new ButtonBuilder()
		.setCustomId(controllerId.encode('chapter', { direction: 'next' }))
		.setLabel('다음 챕터')
		.setEmoji(emoji('arrow_forward'))
		.setDisabled(chapterIndex === null || chapterIndex >= chapters.length - 1);

	const utilityRows: ActionRowBuilder<ButtonBuilder>[] = [];
	if (chapters.length > 0) {
		utilityRows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				[chapterPrevButton, chapterNextButton].map((button) => button.setStyle(ButtonStyle.Secondary))
			)
		);
	}
	if (nowPlayingCardUrl) {
		const gallery = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(nowPlayingCardUrl));
		containerComponent.addMediaGalleryComponents(gallery);
	} else if (current?.info.artworkUrl) {
		const titleSection = new SectionBuilder().addTextDisplayComponents(nowplayingTextDisplay);
		thumbnail.setURL(current.info.artworkUrl);
		titleSection.setThumbnailAccessory(thumbnail);
		containerComponent.addSectionComponents(titleSection);
	} else {
		containerComponent.addTextDisplayComponents(nowplayingTextDisplay);
	}

	containerComponent.addActionRowComponents(controlActionRow);
	for (const utilityRow of utilityRows) {
		containerComponent.addActionRowComponents(utilityRow);
	}

	if (!nowPlayingCardUrl || panel) {
		if (queueCount > 0) {
			containerComponent.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`-# ${emoji('scroll')} 대기열 ${queueCount}곡 (${formatTimeToKorean(remainingUntilQueueEnd(player, queuedTracks) / 1000)} 남음)`
				)
			);
			// divider 없는 SeparatorBuilder만 spacing과 함께 여백을 만든다.
			containerComponent.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

			const previewLines = queuedTracks.slice(0, QUEUE_PREVIEW_COUNT).map((track, index) => {
				const title = formatTrack(track, { showLength: false, titleLength: { maxLength: 60 } });
				return `-# ${index + 1}. ${title}`;
			});
			const preview = [new TextDisplayBuilder().setContent(previewLines.join('\n'))];
			if (queueCount > QUEUE_PREVIEW_COUNT) {
				preview.push(new TextDisplayBuilder().setContent(`-# … 외 ${queueCount - QUEUE_PREVIEW_COUNT}곡 더`));
			}
			containerComponent.addTextDisplayComponents(...preview);
			containerComponent.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

			if (queueCount > QUEUE_PREVIEW_COUNT) {
				const viewQueueButton = new ButtonBuilder()
					.setCustomId(queueViewCustomId)
					.setLabel('대기열 보기')
					.setEmoji(emoji('scroll'))
					.setStyle(ButtonStyle.Secondary);
				containerComponent.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(viewQueueButton));
			}
		}
		const footerSegments = buildFooterSegments(player, volume);
		if (panel) footerSegments.push(...buildPanelStatusSegments(player));
		const requesterMention = current ? footerRequesterMention(current) : null;
		if (requesterMention) {
			footerSegments.push(requesterMention);
		}
		containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footerSegments.join(' ')}`));
	}
	return containerComponent;
}

/**
 * 현재 위치 기준 재생 중인 챕터 한 줄을 만든다. 챕터가 없으면 null.
 * 구간은 챕터의 시작~끝 시각만 보여준다 — 시작~끝이면 길이도 계산되므로 별도 표기는 생략한다.
 */
function buildEpisodeLine(player: Player): string | null {
	const chapter = currentChapter(player as CustomPlayer);
	if (!chapter) return null;

	const start = formatTime(chapter.start / 1000);
	const end = formatTime(chapter.end / 1000);
	return `-# ${emoji('chapter_l')} ${chapter.name} (${start}~${end})`;
}

export function buildTrackDisplay(player: Player, track: Track | null, options: { progressEmoji?: boolean } = {}): string[] {
	const contents = [];
	if (!track) {
		contents.push(`### 재생 중인 음악이 없어요.`);
		return contents;
	}

	// 타이틀에 원본 링크를 되살린다 — 마크다운 제한에 안 걸리게 짧은 URL일 때만 건다.
	const trackTitle = removeEmojis(track.info.title);
	const hasValidUrl = track.info.uri && track.info.uri.length <= MAX_TRACK_URL_LENGTH;
	contents.push(`### **${hasValidUrl ? `[${trackTitle}](${track.info.uri})` : trackTitle}**`);
	// 신청자 멘션·추천곡 인디케이터는 footer로 옮겼고, 여기서는 채팅 TTS 라벨만 남긴다.
	const requesterId = track.requester && typeof track.requester === 'object' ? (track.requester as Record<string, unknown>).id : undefined;
	const requesterLabel = requesterId === TTS_CLIP_REQUESTER_ID ? '채팅 TTS' : null;
	contents.push(requesterLabel ? `-# ${emoji('artist_l')} ${track.info.author} ${requesterLabel}` : `-# ${emoji('artist_l')} ${track.info.author}`);

	// 챕터(에피소드) 표시
	const episode = buildEpisodeLine(player);
	if (episode) contents.push(episode);

	// 진행 정보 — 재생 상태 라벨은 controllerView에서 트랙 줄 위에 붙인다.
	if (track.info.isStream) {
		// 라이브는 길이가 없어 진행바·타임이 무의미 — 라이브 표시만 남긴다.
		contents.push(`-# ${emoji('radio_wave')} 라이브`);
	} else {
		// The bar precedes the elapsed/total time, matching the compact controller layout.
		const progressText = options.progressEmoji ? `${emojiProgressBar((player.position ?? 0) / (track.info.duration || 1))} ` : '';
		contents.push(`-# ${progressText}(${formatTime((player.position ?? 0) / 1000)} / ${formatTime(track.info.duration / 1000)})`);
	}

	return contents;
}

/** footer용 신청자·추천곡 인디케이터 — 사람이 신청한 곡은 멘션, 추천곡은 sparkle 라벨, 채팅 TTS 센티널은 null. */
function footerRequesterMention(track: Track): string | null {
	const requester = track.requester;
	const id = requester && typeof requester === 'object' ? (requester as Record<string, unknown>).id : undefined;
	if (id === RELATED_TRACK_REQUESTER_ID) return `${emoji('sparkle')} 추천 곡`;
	if (typeof id !== 'string' || !id || id === TTS_CLIP_REQUESTER_ID) return null;
	return `${emoji('user')} <@${id}>`;
}

/** Footer segments: 음성 서버(node), 볼륨. */
export function buildFooterSegments(player: Player, volume?: number): string[] {
	const segments = [`${emoji('radio_wave')} ${player.node.id}`];
	if (volume !== undefined) {
		segments.push(`${volumeToEmoji(volume)} ${volume}%`);
	} else if (player.volume !== undefined) {
		segments.push(`${volumeToEmoji(player.volume)} ${player.volume}%`);
	}
	return segments;
}

/** 패널 전용 재생 상태 요약 — 반복 모드·일시정지·큐 길이를 footer에 덧붙인다. */
export function buildPanelStatusSegments(player: Player): string[] {
	const segments: string[] = [];
	if (player.repeatMode && player.repeatMode !== 'off') {
		segments.push(`${repeatEmoji(player.repeatMode)} ${player.repeatMode === 'track' ? '한 곡 반복' : '전체 반복'}`);
	}
	if (player.paused) segments.push(`${emoji('pause')} 일시정지`);
	return segments;
}
