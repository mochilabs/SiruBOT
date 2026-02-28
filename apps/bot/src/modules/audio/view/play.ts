import { addSeparator, createContainer, createThumbnail, formatTime, formatTimeToKorean, formatTrack, getRequesterText } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder } from 'discord.js';
import { Player, PlaylistInfo, Track } from 'lavalink-client';

type playViewProps = {
	track: Track;
	queued: boolean;
	position?: number;
	totalDuration?: number;
};

export function addTextWithThumbnail(container: ContainerBuilder, textContent: string, thumbnailUrl: string | null): void {
	const textDisplay = new TextDisplayBuilder().setContent(textContent);

	if (thumbnailUrl) {
		const section = new SectionBuilder().addTextDisplayComponents(textDisplay).setThumbnailAccessory(createThumbnail(thumbnailUrl));
		container.addSectionComponents(section);
	} else {
		container.addTextDisplayComponents(textDisplay);
	}
}

export function trackAdded({ track, queued, position, totalDuration }: playViewProps) {
	const container = createContainer();

	const firstContent = queued ? `🎵  노래를 대기열 ${position}번에 추가했어요.` : `🎶  노래를 곧 재생할게요!`;

	const trackText = formatTrack(track, {
		showLength: true,
		withMarkdownURL: true
	});
	let artistText = `-# 아티스트: ${track.info.author}`;

	artistText += ' | ' + getRequesterText(track);

	if (queued) {
		artistText += ` | ${position}개 남음 (${formatTime((totalDuration ?? 0) / 1000)})`;
	}

	const content = `${firstContent}\n### ${trackText}\n${artistText}`;
	addTextWithThumbnail(container, content, track?.info.artworkUrl);

	return container;
}

type playlistQueuedViewProps = {
	playlist: PlaylistInfo;
	tracks: Track[];
};

function addPlaylistPreviewSection({ playlist, tracks, containerComponent }: playlistQueuedViewProps & { containerComponent: ContainerBuilder }) {
	if (tracks.length <= 1) return containerComponent;

	addSeparator(containerComponent);

	const previewTracks = tracks
		.slice(0, 5)
		.map((track: Track, idx: number) => `\`\`#${idx + 1}\`\` - ${formatTrack(track, { showLength: true, withMarkdownURL: true })}`)
		.join('\n');

	const moreText = tracks.length > 5 ? `이후 ${tracks.length - 5}곡` : '';
	const queueText = `-# 🎵  추가된 곡 미리보기\n${previewTracks}\n-# ${moreText}`;

	const thumbnailUrl = playlist.thumbnail || tracks[0].info.artworkUrl;
	addTextWithThumbnail(containerComponent, queueText, thumbnailUrl);

	return containerComponent;
}

export function playlistQueued({ playlist, tracks }: playlistQueuedViewProps) {
	const container = createContainer();

	const playlistDuration = formatTimeToKorean(tracks.reduce((acc, track) => acc + (track.info.duration ?? 0), 0) / 1000);

	const content = `### 📝 재생목록의 노래 ${tracks.length}곡이 추가되었어요.\n-# **${playlist.name || '플레이리스트'}** (${playlistDuration})`;

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

	return addPlaylistPreviewSection({
		playlist,
		tracks,
		containerComponent: container
	});
}

type askPlaylistAddViewProps = {
	playlist: PlaylistInfo;
	selectedTrack: Track;
	remainTracks: Track[];
	player: Player;
};

export function askPlaylistAdd({ playlist, selectedTrack, remainTracks, player }: askPlaylistAddViewProps) {
	const container = trackAdded({
		track: selectedTrack,
		queued: player.queue.current !== null,
		position: player.queue.tracks.length,
		totalDuration: player.queue.tracks.reduce((acc, track) => acc + (track.info.duration ?? 0), 0)
	});

	const askText = `### 📄 플레이리스트의 나머지 곡들도 추가하시겠어요?\n**${playlist.name || '플레이리스트'}**에 ${remainTracks.length}곡이 더 있어요.`;

	addSeparator(container);
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(askText));

	// 버튼 생성
	const buttons = [
		new ButtonBuilder()
			.setLabel(`나머지 ${remainTracks.length}곡 추가`)
			.setStyle(ButtonStyle.Success)
			.setCustomId('playlist_add_remaining')
			.setEmoji('➕'),
		new ButtonBuilder().setLabel('현재 곡만 재생').setStyle(ButtonStyle.Secondary).setCustomId('playlist_skip_remaining').setEmoji('⏭️')
	];

	const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
	container.addActionRowComponents(actionRow);

	return container;
}

export function playlistAddRemaining({ playlist, player, remainTracks, selectedTrack }: askPlaylistAddViewProps) {
	const container = trackAdded({
		track: selectedTrack,
		queued: player.queue.current !== null,
		position: player.queue.tracks.length,
		totalDuration: player.queue.tracks.reduce((acc, track) => acc + (track.info.duration ?? 0), 0)
	});

	const content = `### 📝 재생목록의 노래 ${remainTracks.length}곡이 추가되었어요.\n-# **${playlist.name || '플레이리스트'}**`;

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

	return addPlaylistPreviewSection({
		playlist,
		tracks: remainTracks,
		containerComponent: container
	});
}
