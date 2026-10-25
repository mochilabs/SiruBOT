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
import { getUserQueuedTracks, remainingUntilQueueEnd } from '../lavalink/autoPlayRelated.ts';
import { repeatEmoji } from './repeat.ts';
import { RELATED_TRACK_REQUESTER_ID, TTS_CLIP_REQUESTER_ID } from '../lavalink/requester.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { nowPlayingTrack } from '../lavalink/player/nowPlaying.ts';
import { currentChapter, currentChapterIndex } from '../lavalink/player/chapters.ts';

// 타이틀 링크로 걸 수 있는 URL 최대 길이 (formatTrack의 제한과 같다).
const MAX_TRACK_URL_LENGTH = 70;

/** 컨트롤러에서 보여주는 큐 미리보기 곡 수. */
const QUEUE_PREVIEW_COUNT = 5;

type controllerViewProps = {
	player: CustomPlayer;
	volume?: number;
	nowPlayingCardUrl?: string;
};

const customIdPrefix = 'controller:';
const wrapPrefix = (customId: string) => {
	return customIdPrefix + customId;
};

/** 컨트롤러 미리보기 아래 '대기열 보기' 버튼 — controllerButton 핸들러의 queue:view 서브커맨드로 파싱한다. */
const queueViewCustomId = wrapPrefix('queue:view');

export function controllerView({ player, volume, nowPlayingCardUrl }: controllerViewProps) {
	const containerComponent = createContainer();

	// NOWPLAYING 표시는 trackStart 확정 트랙을 본다 (queue.current는 전이 기계가 덮어쓴다).
	const current = nowPlayingTrack(player);
	// 선예열한 추천곡은 대기열이 아니므로 개수·남은 시간·다음 곡 안내에서 제외한다.
	const queuedTracks = getUserQueuedTracks(player);
	const queueCount = queuedTracks.length;

	// 재생 상태 라벨(음성 채널 멘션·재생 중/일시정지/실시간) — 트랙 정보 위 한 줄로 보여준다.
	const statusLabel = current ? (current.info.isStream ? '실시간으로 재생 중' : player.paused ? '일시정지됨' : '재생 중') : null;
	const playbackLabel = current && player.voiceChannelId && statusLabel ? `-# <#${player.voiceChannelId}> 에서 ${statusLabel}` : null;

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
		.setEmoji(emoji('arrow_back'))
		.setDisabled(chapterIndex === null || (chapterIndex === 0 && atChapterStart));
	const chapterNextButton = new ButtonBuilder()
		.setCustomId(wrapPrefix('chapter:next'))
		.setLabel('다음 챕터')
		.setEmoji(emoji('arrow_forward'))
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
	if (nowPlayingCardUrl) {
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

	if (!nowPlayingCardUrl) {
		// 대기열 요약 → divider → 컨텐츠 → footer 순서. footer에는 대기열 개수를 두지 않는다.
		if (queueCount > 0) {
			containerComponent.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`-# ${emoji('scroll')} 대기열 ${queueCount}곡 (${formatTimeToKorean(remainingUntilQueueEnd(player, queuedTracks) / 1000)} 남음)`
				)
			);
			containerComponent.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

			// 큐 미리보기 — 대기열 앞 5곡을 한 줄씩 보여준다.
			const previewLines = queuedTracks.slice(0, QUEUE_PREVIEW_COUNT).map((track, index) => {
				const title = formatTrack(track, { showLength: false, titleLength: { maxLength: 60 } });
				return `-# ${index + 1}. ${title}`;
			});
			const preview = [new TextDisplayBuilder().setContent(previewLines.join('\n'))];
			if (queueCount > QUEUE_PREVIEW_COUNT) {
				preview.push(new TextDisplayBuilder().setContent(`-# … 외 ${queueCount - QUEUE_PREVIEW_COUNT}곡 더`));
			}
			containerComponent.addTextDisplayComponents(...preview);
			containerComponent.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

			// 대기열 전체 보기 진입 버튼 — 누르면 새 메시지로 queueList(10곡/쪽)를 연다.
			const viewQueueButton = new ButtonBuilder()
				.setCustomId(queueViewCustomId)
				.setLabel('대기열 보기')
				.setEmoji(emoji('scroll'))
				.setStyle(ButtonStyle.Secondary);
			containerComponent.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(viewQueueButton));
		}
		const footerSegments = buildFooterSegments(player, volume);
		// 신청자는 footer 맨 마지막(볼륨 바로 뒤)에 아이콘과 함께 표시한다 — 추천곡/채팅 TTS는 아티스트 줄 라벨을 유지한다.
		const requesterMention = current ? footerRequesterMention(current) : null;
		if (requesterMention) {
			footerSegments.push(`${emoji('user')} ${requesterMention}`);
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
	return `-# ${emoji('chapter')} ${chapter.name} (${start}~${end})`;
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
	// 신청자 멘션은 footer로 옮겼고, 여기서는 추천곡/채팅 TTS 라벨만 남긴다.
	const requesterId = track.requester && typeof track.requester === 'object' ? (track.requester as Record<string, unknown>).id : undefined;
	const requesterLabel =
		requesterId === RELATED_TRACK_REQUESTER_ID ? `${emoji('sparkle')} 추천곡` : requesterId === TTS_CLIP_REQUESTER_ID ? '채팅 TTS' : null;
	contents.push(requesterLabel ? `-# ${emoji('artist')} ${track.info.author} ${requesterLabel}` : `-# ${emoji('artist')} ${track.info.author}`);

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

/** footer용 신청자 멘션 — 사람이 신청한 곡만 멘션, 추천곡/채팅 TTS 센티널은 null. */
function footerRequesterMention(track: Track): string | null {
	const requester = track.requester;
	const id = requester && typeof requester === 'object' ? (requester as Record<string, unknown>).id : undefined;
	if (typeof id !== 'string' || !id || id === RELATED_TRACK_REQUESTER_ID || id === TTS_CLIP_REQUESTER_ID) return null;
	return `<@${id}>`;
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
