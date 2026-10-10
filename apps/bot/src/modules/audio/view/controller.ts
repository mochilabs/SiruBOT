import {
	emoji,
	emojiProgressBar,
	createContainer,
	formatTime,
	formatTimeToKorean,
	formatTrack,
	isDev,
	versionInfo,
	removeEmojis,
	volumeToEmoji,
	BOT_NAME
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
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';

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

	const trackLines = buildTrackDisplay(player, current);

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

	// Repeat state 아이콘 바꾸기
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
	// 1행: 재생 제어(prev·pause·next·repeat·stop), 2행: 대기열 (Discord 한 행당 버튼 5개 제한)
	const queueShowButton = new ButtonBuilder().setCustomId(wrapPrefix('queue:show')).setLabel('대기열').setEmoji(emoji('scroll'));

	const controlActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		[prevButton, pauseButton, nextButton, repeatButton, stopButton].map((e) => e.setStyle(ButtonStyle.Secondary))
	);
	const queueActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents([queueShowButton.setStyle(ButtonStyle.Secondary)]);

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
	containerComponent.addActionRowComponents(queueActionRow);

	if (nextUpLines.length > 0) {
		containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent([`-# **다음 곡**`, ...nextUpLines].join('\n')));
	}

	const separatorSmall = new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

	// 하단 푸터 — 카드가 없을 때만 봇 이름/버전까지 표시 (카드가 있으면 브랜드는 이미지에 박혀 있다).
	const footerLines = buildFooterSegments(player, volume, !nowPlayingCardUrl);
	if (queueCount > 0) {
		footerLines.unshift(
			`${emoji('scroll')} 대기열 ${queueCount}곡 · ${formatTimeToKorean(remainingUntilQueueEnd(player, queuedTracks) / 1000)} 남음`
		);
	}

	containerComponent.addSeparatorComponents(separatorSmall).addTextDisplayComponents(new TextDisplayBuilder().setContent(footerLines.join(' | ')));

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

export function buildTrackDisplay(player: Player, track: Track | null): string[] {
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
		contents.push(requesterId === 'related_track' ? `-# 추천 곡 ${emoji('sparkle')}` : `-# 신청자: <@${requesterId}>`);
	}

	// 길이 표기 — 짧은 이모지 프로그레스바와 (지금시간 / 길이)을 함께 표시한다.
	// 진행바는 카드 이미지에 박지 않아 이 라인이 playerUpdate마다 edit로 갱신되는 유일한 동적 라인이다.
	const durationText = track.info.isStream ? 'LIVE' : formatTime(track.info.duration / 1000);
	if (track.info.isStream) {
		contents.push(`-# (${durationText}) 실시간 스트리밍`);
	} else {
		const progressBar = emojiProgressBar((player.position ?? 0) / (track.info.duration || 1));
		contents.push(`-# (${formatTime(player.position / 1000)} / ${durationText}) ${progressBar}`);
	}

	return contents;
}

/**
 * 컨트롤러 하단 푸터 — 각 세그먼트가 `-#`(작은 글씨)로 시작해야 하나의 줄로 합쳐도
 * 마크다운이 깨지지 않아요 (중간 세그먼트에만 `-#`를 넣으면 렌더가 깨져요).
 * includeBrand=false면 브랜드(봇이름/버전)는 카드 이미지에 박혀 있으므로 생략해요.
 */
export function buildFooterSegments(player: Player, volume?: number, includeBrand = true): string[] {
	const muted = (text: string) => `-# ${text}`;
	const segments = [muted(`${emoji('radio_wave')} 재생 서버: ${player.node.id}`)];
	if (volume !== undefined) {
		segments.push(muted(`${volumeToEmoji(volume)} 볼륨: ${volume}%`));
	} else if (player.volume !== undefined) {
		segments.push(muted(`${volumeToEmoji(player.volume)} 볼륨: ${player.volume}%`));
	}
	if (includeBrand) {
		segments.push(
			muted(
				`${BOT_NAME} ${isDev ? `${versionInfo.getGitBranch()}/${versionInfo.getGitHash()}` : `${versionInfo.getVersion()} (${versionInfo.getGitHash()})`}`
			)
		);
	}
	return segments;
}
