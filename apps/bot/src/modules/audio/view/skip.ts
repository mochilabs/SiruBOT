import { createContainer, formatTrack } from '@sirubot/utils';
import { ActionRowBuilder, APIUser, ButtonBuilder, ButtonStyle, User } from 'discord.js';
import { Track } from 'lavalink-client';
import { addTextWithThumbnail } from './play.ts';

type voteSkipProps = {
	requiredVotes: number;
	totalVotes: number;
	requester: User;
	trackToSkip: Track;
};

export function voteSkip({ requiredVotes, totalVotes, trackToSkip }: voteSkipProps) {
	const containerComponent = createContainer();

	addTextWithThumbnail(
		containerComponent,
		`### ⏭️ 투표로 건너뛸까요? ${totalVotes}/${requiredVotes}\n### ${formatTrack(trackToSkip, { showLength: true, withMarkdownURL: true, timeType: 'korean' })}`,
		trackToSkip.info.artworkUrl
	);

	const voteSkipButton = new ButtonBuilder().setCustomId('skip_vote').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setLabel('건너뛰기');
	containerComponent.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(voteSkipButton));

	return containerComponent;
}

type trackSkippedProps = {
	track: Track;
	requester: User | APIUser;
};

export function trackSkipped({ track }: trackSkippedProps) {
	const containerComponent = createContainer();

	addTextWithThumbnail(
		containerComponent,
		`### ⏭️ 노래를 건너뛰었어요. \n### ${formatTrack(track, { showLength: true, withMarkdownURL: true, timeType: 'seconds', cleanTitle: true })}`,
		track.info.artworkUrl
	);
	return containerComponent;
}

export function trackRelatedSkipped({ track }: Omit<trackSkippedProps, 'requester'>) {
	const containerComponent = createContainer();
	addTextWithThumbnail(
		containerComponent,
		`### ⏭️ 자동 재생 노래를 건너뛰었어요. \n### ${formatTrack(track, { showLength: true, withMarkdownURL: true, timeType: 'seconds', cleanTitle: true })}`,
		track.info.artworkUrl
	);
	return containerComponent;
}

export function trackSkippedTo({ track, to }: Omit<trackSkippedProps, 'requester'> & { to: number }) {
	const containerComponent = createContainer();
	addTextWithThumbnail(
		containerComponent,
		`### ⏭️ ${to}번째 곡으로 건너뛰었어요. \n### ${formatTrack(track, { showLength: true, withMarkdownURL: true, timeType: 'seconds', cleanTitle: true })}`,
		track.info.artworkUrl
	);
	return containerComponent;
}

export function queueIsEmpty() {
	const containerComponent = createContainer();

	addTextWithThumbnail(containerComponent, '🔍 건너뛸 곡이 없어요.', null);
	return containerComponent;
}
