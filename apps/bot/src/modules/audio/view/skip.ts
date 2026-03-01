import { createContainer, formatTrack } from '@sirubot/utils';
import { ActionRowBuilder, APIUser, ButtonBuilder, ButtonStyle, User } from 'discord.js';
import { Track } from 'lavalink-client';
import { addTextWithThumbnail } from './play.ts';

type voteSkipProps = {
	requiredVotes: number;
	voteUsers: Set<string>;
	trackToSkip: Track;
	nextTrack?: Track;
};

const formatOptions = { showLength: true, withMarkdownURL: true, timeType: 'seconds', cleanTitle: true } as const;

export function voteSkip({ requiredVotes, voteUsers, trackToSkip, nextTrack }: voteSkipProps) {
	const containerComponent = createContainer();
	const totalVotes = voteUsers.size;
	addTextWithThumbnail(
		containerComponent,
		`⏭️ 투표로 노래를 건너뛸까요?\n### ${formatTrack(trackToSkip, { showLength: true, withMarkdownURL: true, timeType: 'seconds' })}${nextTrack ? '\n\nㄴ 다음 곡: ' + formatTrack(nextTrack, { showLength: true, withMarkdownURL: true, timeType: 'seconds' }) : ''}\n-# 투표는 **30초** 동안 진행돼요.`,
		trackToSkip.info.artworkUrl
	);

	const voteSkipButton = new ButtonBuilder()
		.setCustomId('skip_vote')
		.setEmoji('⏭️')
		.setStyle(ButtonStyle.Secondary)
		.setLabel(`건너뛰기 (${totalVotes}/${requiredVotes})`);
	containerComponent.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(voteSkipButton));

	return containerComponent;
}

type trackSkippedProps = {
	track: Track;
	requester: User | APIUser;
};

export function trackSkipped({ track }: trackSkippedProps) {
	const containerComponent = createContainer();

	addTextWithThumbnail(containerComponent, `⏭️ 노래를 건너뛰었어요.\n### ${formatTrack(track, formatOptions)}`, track.info.artworkUrl);
	return containerComponent;
}

export function trackRelatedSkipped({ track }: Omit<trackSkippedProps, 'requester'>) {
	const containerComponent = createContainer();
	addTextWithThumbnail(containerComponent, `⏭️ 추천 곡을 건너뛰었어요.\n### ${formatTrack(track, formatOptions)}`, track.info.artworkUrl);
	return containerComponent;
}

export function trackSkippedTo({ track, to }: Omit<trackSkippedProps, 'requester'> & { to: number }) {
	const containerComponent = createContainer();
	addTextWithThumbnail(containerComponent, `⏭️ ${to}번째 곡으로 건너뛰었어요.\n### ${formatTrack(track, formatOptions)}`, track.info.artworkUrl);
	return containerComponent;
}

type trackSkippedByVoteProps = Omit<trackSkippedProps, 'requester'> & Pick<voteSkipProps, 'voteUsers'>;

export function trackSkippedByVote({ track, voteUsers }: trackSkippedByVoteProps) {
	const containerComponent = createContainer();

	const totalVotes = voteUsers.size;
	addTextWithThumbnail(
		containerComponent,
		`⏭️ 투표로 노래를 건너뛰었어요. (${totalVotes}표) \n### ${formatTrack(track, formatOptions)}`,
		track.info.artworkUrl
	);
	return containerComponent;
}

export function alreadySkipped() {
	return createContainer().addTextDisplayComponents((textDisplay) => textDisplay.setContent('⏭️ 이미 다음 곡이 재생 중이에요.'));
}

export function voteSkipTimeout({ requiredVotes, voteUsers }: Pick<voteSkipProps, 'requiredVotes' | 'voteUsers'>) {
	const totalVotes = voteUsers.size;
	return createContainer().addTextDisplayComponents((textDisplay) =>
		textDisplay.setContent(`⏭️ 투표 시간이 종료되었어요.\n-# **${totalVotes}**표 / **${requiredVotes}**표 필요`)
	);
}
