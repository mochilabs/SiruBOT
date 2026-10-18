import {
	emoji,
	emojiProgressBar,
	createContainer,
	formatTime,
	formatTimeToKorean,
	formatTrack,
	removeEmojis,
	volumeToEmoji,
	BOT_NAME,
	versionInfo,
	isDev
} from '@sirubot/utils';
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
import { getUserQueuedTracks, remainingUntilQueueEnd } from '../lavalink/autoPlayRelated.ts';
import { repeatEmoji } from './repeat.ts';
import { RELATED_TRACK_REQUESTER_ID, TTS_CLIP_REQUESTER_ID } from '../lavalink/requester.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { nowPlayingTrack } from '../lavalink/player/nowPlaying.ts';
import { currentChapter, currentChapterIndex } from '../lavalink/player/chapters.ts';

type controllerViewProps = {
	player: CustomPlayer;
	volume?: number;
	textChannelId?: string;
	nowPlayingCardUrl?: string;
};

const customIdPrefix = 'controller:';
const wrapPrefix = (customId: string) => {
	return customIdPrefix + customId;
};

export function controllerView({ player, volume, textChannelId, nowPlayingCardUrl }: controllerViewProps) {
	const containerComponent = createContainer();

	// NOWPLAYING 표시는 trackStart 확정 트랙을 본다 (queue.current는 전이 기계가 덮어쓴다).
	const current = nowPlayingTrack(player);
	// 선예열한 추천곡은 대기열이 아니므로 개수·남은 시간·다음 곡 안내에서 제외한다.
	const queuedTracks = getUserQueuedTracks(player);
	const queueCount = queuedTracks.length;

	// 메시지에서 재생 상태를 먼저 읽고, 다음 곡은 보조 영역으로 분리한다.
	const NEXT_UP_COUNT = 3;
	const nextUpLines = queuedTracks.slice(0, NEXT_UP_COUNT).map(
		(track, index) =>
			`${index + 1}. ${formatTrack(track as Track, {
				showLength: false,
				withMarkdownURL: true,
				cleanTitle: true,
				titleLength: { maxLength: 80 }
			})}`
	);

	const playbackLabel = current && textChannelId ? `-# <#${textChannelId}>에서 재생 중` : null;
	const trackLines = buildTrackDisplay(player, current, { progressEmoji: !nowPlayingCardUrl });

	const nowplayingTextDisplay = new TextDisplayBuilder().setContent([...(playbackLabel ? [playbackLabel] : []), ...trackLines].join('\n'));

	const thumbnail = new ThumbnailBuilder();

	const prevButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('prev'))
		.setEmoji(emoji('arrow_back'))
		.setDisabled(player.queue.previous.length === 0);

	const pauseButton = new ButtonBuilder()
		.setCustomId(player.paused ? wrapPrefix('resume') : wrapPrefix('pause'))
		.setEmoji(player.paused ? emoji('play') : emoji('pause'));

	const nextButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('next'))
		.setEmoji(emoji('arrow_forward'))
		.setDisabled(player.queue.tracks.length === 0);

	const stopButton = new ButtonBuilder().setCustomId(wrapPrefix('stop')).setEmoji(emoji('stop'));

	// 반복 상태 아이콘 바꾸기
	const repeatButton = new ButtonBuilder()
		.setCustomId(
			player.repeatMode === 'off'
				? wrapPrefix('repeat:queue')
				: player.repeatMode === 'track'
					? wrapPrefix('repeat:track')
					: wrapPrefix('repeat:off')
		)
		.setEmoji(repeatEmoji(player.repeatMode));

	// '대기열 보기' 버튼: 상세 목록(페이지네이션)은 버튼 클릭 시 ephemeral 메시지로 표시한다.
	const queueShowButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('queue:show'))
		.setEmoji(emoji('scroll'))
		.setDisabled(queuedTracks.length === 0);

	// 핵심 조작만 한 행에 둬 모바일에서도 버튼 라벨이 눌리지 않게 한다.
	const primaryComponents: ButtonBuilder[] = [prevButton, pauseButton, nextButton, stopButton, repeatButton];
	const controlActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		primaryComponents.map((button) => {
			return button.setStyle(ButtonStyle.Secondary);
		})
	);

	// // 볼륨 조절 버튼 — 볼륨 조절이 의미 있을 때만 표시 (하한≠상한일 때).
	// const currentVolume = volume ?? player.volume ?? 0;
	// const showVolume = VOLUME_MAX > VOLUME_MIN + 1;
	// const volumeDownButton = new ButtonBuilder()
	// 	.setCustomId(wrapPrefix('volume:down'))
	// 	.setLabel('볼륨 낮추기')
	// 	.setEmoji(emoji('volume_down'))
	// 	.setDisabled(currentVolume <= VOLUME_MIN);
	// const volumeUpButton = new ButtonBuilder()
	// 	.setCustomId(wrapPrefix('volume:up'))
	// 	.setLabel('볼륨 높이기')
	// 	.setEmoji(emoji('volume_up'))
	// 	.setDisabled(currentVolume >= VOLUME_MAX);

	// 챕터 건너뛰기 버튼 — 챕터가 있는 영상(장문 YouTube)에만 노출해요.
	// 현재 챕터 시작에서 5초 이상 지났으면 '이전 챕터'가 현재 챕터로 되돌려요.
	const chapters = player.chapters ?? [];
	const chapterIndex = chapters.length > 0 ? currentChapterIndex(player) : null;
	const atChapterStart = chapterIndex !== null && (player.position ?? 0) - chapters[chapterIndex]!.start < 5_000;
	const chapterPrevButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('chapter:prev'))
		.setLabel('이전 챕터')
		.setEmoji(emoji('chapters_prev', '⏪'))
		.setDisabled(chapterIndex === null || (chapterIndex === 0 && atChapterStart));
	const chapterNextButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('chapter:next'))
		.setLabel('다음 챕터')
		.setEmoji(emoji('chapters_next', '⏩'))
		.setDisabled(chapterIndex === null || chapterIndex >= chapters.length - 1);

	// 부가 조작은 챕터 이동과 재생 설정으로 나눠 한 행에 과밀하게 몰리지 않게 한다.
	const utilityRows: ActionRowBuilder<ButtonBuilder>[] = [];
	if (chapters.length > 0) {
		utilityRows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				[chapterPrevButton, chapterNextButton].map((button) => button.setStyle(ButtonStyle.Secondary))
			)
		);
	}
	const settingComponents: ButtonBuilder[] = [];
	// if (showVolume) {
	// 	settingComponents.push(volumeDownButton, volumeUpButton);
	// }
	if (queuedTracks.length > 0) {
		settingComponents.push(queueShowButton);
	}
	utilityRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(settingComponents.map((button) => button.setStyle(ButtonStyle.Secondary))));

	if (nowPlayingCardUrl) {
		if (playbackLabel) containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(playbackLabel));
		const gallery = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(nowPlayingCardUrl));
		containerComponent.addMediaGalleryComponents(gallery);
	} else if (current?.info.artworkUrl) {
		// 일반 컨트롤러는 카드 대신 원본 앨범 아트만 작은 썸네일로 보여줘요.
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

	if (nextUpLines.length > 0 && !nowPlayingCardUrl) {
		containerComponent
			.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(new TextDisplayBuilder().setContent([`### 다음 곡`, ...nextUpLines].join('\n')));
	}

	if (!nowPlayingCardUrl) {
		// 작은 컨트롤러는 서버·볼륨 상태를 텍스트로 요약한다.
		const footerSegments = buildFooterSegments(player, volume);
		if (queueCount > 0) {
			footerSegments.unshift(
				`${emoji('scroll')} 대기열 ${queueCount}곡 · ${formatTimeToKorean(remainingUntilQueueEnd(player, queuedTracks) / 1000)} 남음`
			);
		}

		// `-#`는 줄 맨 앞에서만 적용되므로 메타데이터를 한 줄에 합친다.
		containerComponent
			.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footerSegments.join(' | ')}`));
	}

	return containerComponent;
}

/**
 * 현재 위치 기준 재생 중인 챕터 한 줄을 만든다. 챕터가 없으면 null.
 * 구간은 챕터의 시작~끝 + 챕터 자체 길이(전체 영상 길이가 아니라)를 보여준다.
 */
function buildEpisodeLine(player: Player): string | null {
	const chapter = currentChapter(player as CustomPlayer);
	if (!chapter) return null;

	const start = formatTime(chapter.start / 1000);
	const end = formatTime(chapter.end / 1000);
	const length = formatTime(chapter.duration / 1000);
	return `-# ╰ ${chapter.name} • ${start}~${end} (${length})`;
}

export function buildTrackDisplay(player: Player, track: Track | null, options: { progressEmoji?: boolean } = {}): string[] {
	const contents = [];
	if (!track) {
		contents.push(`### 재생 중인 음악이 없어요.`);
		return contents;
	}

	contents.push(`### **${removeEmojis(track.info.title)}**`);
	contents.push(`-# 아티스트: ${track.info.author}`);

	// 챕터(에피소드) 표시
	const episode = buildEpisodeLine(player);
	if (episode) contents.push(episode);

	// 신청자
	const requesterId = track.requester && typeof track.requester === 'object' ? (track.requester as Record<string, unknown>).id : undefined;
	if (requesterId) {
		contents.push(
			requesterId === RELATED_TRACK_REQUESTER_ID
				? `-# 추천 곡 ${emoji('sparkle')}`
				: requesterId === TTS_CLIP_REQUESTER_ID
					? `-# 채팅 TTS`
					: `-# 신청자: <@${requesterId}>`
		);
	}

	// 상대 타임스탬프는 종료 직후 "0초 전"으로 남으므로, 양쪽 레이아웃에서 경과/전체 시간만 표시한다.
	if (track.info.isStream) {
		contents.push(`-# ${emoji('radio_wave')} 실시간 스트리밍`);
	} else if (player.paused) {
		contents.push(`-# ${emoji('pause')} 일시정지됨`);
	} else {
		const progressText = options.progressEmoji ? ` ${emojiProgressBar((player.position ?? 0) / (track.info.duration || 1))}` : '';
		contents.push(`-# (${formatTime((player.position ?? 0) / 1000)} / ${formatTime(track.info.duration / 1000)})${progressText}`);
	}

	return contents;
}

/**
 * 컨트롤러 하단 푸터 세그먼트 — 재생 서버·볼륨·브랜드(봇 이름/버전) 순.
 * `-#`(작은 글씨)는 줄 맨 앞에서만 적용되므로, 여기선 세그먼트를 평문으로 돌려주고
 * 호출자가 한 줄로 합친 뒤 맨 앞에 `-# `를 한 번만 붙인다(중간 `-#`가 그대로 노출되는 버그 방지).
 */
export function buildFooterSegments(player: Player, volume?: number, includeBrand = true): string[] {
	const segments = [`${emoji('radio_wave')} 재생 서버: ${player.node.id}`];
	if (volume !== undefined) {
		segments.push(`${volumeToEmoji(volume)} 볼륨: ${volume}%`);
	} else if (player.volume !== undefined) {
		segments.push(`${volumeToEmoji(player.volume)} 볼륨: ${player.volume}%`);
	}
	if (includeBrand) {
		segments.push(
			`${BOT_NAME} ${isDev ? `${versionInfo.getGitBranch()}/${versionInfo.getGitHash()}` : `${versionInfo.getVersion()} (${versionInfo.getGitHash()})`}`
		);
	}
	return segments;
}
