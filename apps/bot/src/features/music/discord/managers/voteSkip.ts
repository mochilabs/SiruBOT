import { ButtonInteraction, ChatInputCommandInteraction, ComponentType, MessageFlags } from 'discord.js';
import { Track } from 'lavalink-client';
import { container } from '@sapphire/framework';
import * as view from '../views/skip.ts';
import { voteSkipId } from '../customIds.ts';
import { notice } from '../../../../lib/notice.ts';
import { createComponentSession, type ComponentSession } from '../../../../lib/componentSession.ts';

const VOTE_TIME_MS = 30_000;

export interface ShowVoteSkipOptions {
	interaction: ChatInputCommandInteraction<'cached'>;
	voteId: string;
	votes: number;
	requiredVotes: number;
	currentTrack: Track;
	nextTrack?: Track;
}

export async function showVoteSkip(options: ShowVoteSkipOptions): Promise<void> {
	const { interaction, voteId, currentTrack, nextTrack } = options;
	const customId = voteSkipId.encode('vote', { interactionId: voteId });

	const render = (votes: number, requiredVotes: number) => view.voteSkip({ requiredVotes, votes, trackToSkip: currentTrack, nextTrack, customId });

	try {
		await interaction.reply({
			components: [render(options.votes, options.requiredVotes)],
			flags: [MessageFlags.IsComponentsV2]
		});
	} catch (error) {
		container.voteSkip.closeVote(voteId);
		throw error;
	}

	const channel = interaction.channel;
	if (!channel) {
		container.voteSkip.closeVote(voteId);
		return;
	}

	createComponentSession<ButtonInteraction>(channel, {
		filter: (i) => i.customId === customId,
		componentType: ComponentType.Button,
		time: VOTE_TIME_MS,
		onCollect: async (buttonInteraction, session) => {
			const outcome = await container.voteSkip.castVote(voteId, buttonInteraction.user.id);
			switch (outcome.kind) {
				case 'closed':
					// 클릭한 인터랙션을 직접 갱신해야 "상호작용 실패"가 뜨지 않아요.
					await buttonInteraction.update({ components: [view.alreadySkipped()], flags: [MessageFlags.IsComponentsV2] });
					session.settle();
					return;
				case 'rejected':
					await buttonInteraction.reply({
						components: [notice(outcome.message)],
						flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
					});
					return;
				case 'counted':
					await buttonInteraction.update({
						components: [render(outcome.votes, outcome.requiredVotes)],
						flags: [MessageFlags.IsComponentsV2]
					});
					return;
				case 'passed':
					await buttonInteraction.update({
						components: [view.trackSkippedByVote({ track: currentTrack, votes: outcome.votes })],
						flags: [MessageFlags.IsComponentsV2]
					});
					session.settle();
					return;
			}
		},
		onTimeout: async (_session: ComponentSession) => {
			const summary = container.voteSkip.closeVote(voteId);
			if (!summary) return;
			await interaction.editReply({
				components: [view.voteSkipTimeout({ requiredVotes: summary.requiredVotes, votes: summary.votes })],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	});
}
