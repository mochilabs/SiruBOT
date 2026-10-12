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
import { RELATED_TRACK_REQUESTER_ID } from '../lavalink/requester.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { currentChapter, currentChapterIndex } from '../lavalink/player/chapters.ts';

type controllerViewProps = {
	player: CustomPlayer;
	volume?: number;
	/** NowPlaying 카드 attachment URL (attachment://...) — 있으면 상단에 카드 이미지 표시 */
	nowPlayingCardUrl?: string;
};

const customIdPrefix = 'controller:';
const wrapPrefix = (customId: string) => {
	return customIdPrefix + customId;
};

/** 볼륨 조절 범위(%) */
const VOLUME_MIN = 0;
const VOLUME_MAX = 150;

export function controllerView({ player, volume, nowPlayingCardUrl }: controllerViewProps) {
	const containerComponent = createContainer();

	const current = player.queue.current;
	// 선예열한 추천곡은 대기열이 아니므로 개수·남은 시간·다음 곡 안내에서 제외한다.
	const queuedTracks = getUserQueuedTracks(player);
	const queueCount = queuedTracks.length;

	// 다음 곡 3개를 타이틀로 표시한다 (대기열 보기 버튼 대신).
	const NEXT_UP_COUNT = 3;
	const nextUpLines = queuedTracks.slice(0, NEXT_UP_COUNT).map(
		(track, index) =>
			`-# \`${index + 1}\` ${formatTrack(track as Track, {
				showLength: false,
				withMarkdownURL: true,
				cleanTitle: true,
				titleLength: { maxLength: 80 }
			})}`
	);

	const trackLines = buildTrackDisplay(player, current, { progressEmoji: !nowPlayingCardUrl });

	const nowplayingTextDisplay = new TextDisplayBuilder().setContent(trackLines.join('\n'));

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

	// '대기열 보기' 버튼: 상세 목록(페이지네이션)은 버튼 클릭 시 ephemeral 메시지로 표시한다.
	const queueShowButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('queue:show'))
		.setLabel('대기열')
		.setEmoji(emoji('scroll'))
		.setDisabled(queuedTracks.length === 0);

	// 1행: 이전/재생/다음/정지 + (대기열 있을 때만) 대기열 보기. Discord 한 행당 버튼 5개 제한.
	const primaryComponents: ButtonBuilder[] = [prevButton, pauseButton, nextButton, stopButton];
	if (queuedTracks.length > 0) {
		primaryComponents.push(queueShowButton);
	}
	const controlActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(primaryComponents.map((e) => e.setStyle(ButtonStyle.Secondary)));

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

	// 볼륨 조절 버튼 — 볼륨 조절이 의미 있을 때만 표시 (하한≠상한일 때).
	const currentVolume = volume ?? player.volume ?? 0;
	const showVolume = VOLUME_MAX > VOLUME_MIN + 1;
	const volumeDownButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('volume:down'))
		.setEmoji(emoji('volume_down'))
		.setDisabled(currentVolume <= VOLUME_MIN);
	const volumeUpButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('volume:up'))
		.setEmoji(emoji('volume_up'))
		.setDisabled(currentVolume >= VOLUME_MAX);

	// 챕터 건너뛰기 버튼 — 챕터가 있는 영상(장문 YouTube)에만 노출해요.
	// 현재 챕터 시작에서 5초 이상 지났으면 '이전 챕터'가 현재 챕터로 되돌려요.
	const chapters = player.chapters ?? [];
	const chapterIndex = chapters.length > 0 ? currentChapterIndex(player) : null;
	const atChapterStart = chapterIndex !== null && (player.position ?? 0) - chapters[chapterIndex]!.start < 5_000;
	const chapterPrevButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('chapter:prev'))
		.setEmoji(emoji('chapters_prev', '⏪'))
		.setDisabled(chapterIndex === null || (chapterIndex === 0 && atChapterStart));
	const chapterNextButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('chapter:next'))
		.setEmoji(emoji('chapters_next', '⏩'))
		.setDisabled(chapterIndex === null || chapterIndex >= chapters.length - 1);

	// 2행: (챕터 있을 때만) 이전/다음 챕터 + 반복 + (볼륨 가능할 때만) 볼륨. Discord 한 행당 버튼 5개 제한.
	const utilityComponents: ButtonBuilder[] = [];
	if (chapters.length > 0) {
		utilityComponents.push(chapterPrevButton, chapterNextButton);
	}
	utilityComponents.push(repeatButton);
	if (showVolume) {
		utilityComponents.push(volumeDownButton, volumeUpButton);
	}

	const utilityRows: ActionRowBuilder<ButtonBuilder>[] = [];
	if (utilityComponents.length <= 5) {
		utilityRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(utilityComponents.map((e) => e.setStyle(ButtonStyle.Secondary))));
	} else {
		utilityRows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(utilityComponents.slice(0, 5).map((e) => e.setStyle(ButtonStyle.Secondary)))
		);
		utilityRows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(utilityComponents.slice(5).map((e) => e.setStyle(ButtonStyle.Secondary)))
		);
	}

	// NowPlaying 카드가 있으면 상단에 크게 보여주고, 썸네일은 중복되니 생략한다.
	if (nowPlayingCardUrl) {
		const gallery = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(nowPlayingCardUrl));
		containerComponent.addMediaGalleryComponents(gallery);
		containerComponent.addTextDisplayComponents(nowplayingTextDisplay);
	} else if (current?.info.artworkUrl) {
		const titleSection = new SectionBuilder().addTextDisplayComponents(nowplayingTextDisplay);
		thumbnail.setURL(current?.info.artworkUrl ?? '');
		titleSection.setThumbnailAccessory(thumbnail);
		containerComponent.addSectionComponents(titleSection);
	} else {
		containerComponent.addTextDisplayComponents(nowplayingTextDisplay);
	}

	containerComponent.addActionRowComponents(controlActionRow);
	for (const utilityRow of utilityRows) {
		containerComponent.addActionRowComponents(utilityRow);
	}

	// 다음 곡 목록은 카드 이미지에 그려져요 — 카드가 있으면 텍스트 목록과 중복되지 않게 생략해요.
	if (nextUpLines.length > 0 && !nowPlayingCardUrl) {
		containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent([`-# **다음 곡**`, ...nextUpLines].join('\n')));
	}

	const separatorSmall = new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

	// 하단 푸터 — 카드가 없을 때만 봇 이름/버전까지 표시 (카드가 있으면 브랜드는 이미지에 박혀 있다).
	const footerSegments = buildFooterSegments(player, volume, !nowPlayingCardUrl);
	if (queueCount > 0) {
		footerSegments.unshift(
			`${emoji('scroll')} 대기열 ${queueCount}곡 · ${formatTimeToKorean(remainingUntilQueueEnd(player, queuedTracks) / 1000)} 남음`
		);
	}

	// `-#`(작은 글씨)는 줄 맨 앞에서만 적용되므로 하나의 줄로 합친 뒤 맨 앞에 한 번만 붙인다.
	containerComponent
		.addSeparatorComponents(separatorSmall)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footerSegments.join(' | ')}`));

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
		contents.push(requesterId === RELATED_TRACK_REQUESTER_ID ? `-# 추천 곡 ${emoji('sparkle')}` : `-# 신청자: <@${requesterId}>`);
	}

	// 종료 안내 — 카드가 없을 때만 이모지 프로그레스바를 보여주고,
	// 카드가 있으면 정적인 종료 시각 타임스탬프(<t:unix:R>)로 대체한다.
	if (track.info.isStream) {
		contents.push(`-# ${emoji('radio_wave')} 실시간 스트리밍`);
	} else if (player.paused) {
		contents.push(`-# ${emoji('pause')} 일시정지됨`);
	} else if (options.progressEmoji) {
		const progressText = ` ${emojiProgressBar((player.position ?? 0) / (track.info.duration || 1))}`;
		contents.push(`-# (${formatTime(player.position / 1000)} / ${formatTime(track.info.duration / 1000)})${progressText}`);
	} else {
		contents.push(`-# ${emoji('hourglass')} ${endTimestamp(player as CustomPlayer, track)} 후 종료`);
	}

	return contents;
}

/**
 * 종료 시각 타임스탬프 — 디스코드 <t:unix:R>로 "3분 후 종료"처럼 클라이언트가 자동 갱신한다.
 * 챕터가 있으면 챕터 끝, 없으면 곡 끝을 기준으로 한다. 5초 단위로 반올림해
 * 재생 중 position이 흘러도 문자열이 바뀌지 않게 한다(불필요한 메시지 편집 방지).
 */
function endTimestamp(player: CustomPlayer, track: Track): string {
	const chapter = currentChapter(player);
	const endMs = chapter ? chapter.end : track.info.duration;
	const positionMs = Math.min(player.position ?? 0, endMs);
	const remainingMs = Math.max(0, endMs - positionMs);
	const endUnix = Math.round((Date.now() + remainingMs) / 5000) * 5;
	return `<t:${endUnix}:R>`;
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
