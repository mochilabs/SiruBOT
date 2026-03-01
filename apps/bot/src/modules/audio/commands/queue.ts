import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as view from '../view/queue.ts';
import { Track } from 'lavalink-client';

const QUEUE_PAGE_SIZE = 10;

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'queue',
	description: '음악 대기열을 보거나 관리해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying']
})
export class QueueCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '대기열' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '음악 대기열을 보거나 관리해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('list')
						.setNameLocalizations({ ko: '목록' })
						.setDescription('View the current queue.')
						.setDescriptionLocalizations({ ko: '현재 대기열을 확인해요.' })
						.addIntegerOption((option) =>
							option
								.setName('page')
								.setNameLocalizations({ ko: '페이지' })
								.setDescription('Page number to display.')
								.setDescriptionLocalizations({ ko: '표시할 페이지 번호에요.' })
								.setMinValue(1)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('shuffle')
						.setNameLocalizations({ ko: '셔플' })
						.setDescription('Shuffle the queue.')
						.setDescriptionLocalizations({ ko: '대기열을 셔플해요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('clear')
						.setNameLocalizations({ ko: '비우기' })
						.setDescription('Clear the entire queue.')
						.setDescriptionLocalizations({ ko: '대기열을 전부 비워요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('remove')
						.setNameLocalizations({ ko: '제거' })
						.setDescription('Remove a track from the queue.')
						.setDescriptionLocalizations({ ko: '대기열에서 곡을 제거해요.' })
						.addIntegerOption((option) =>
							option
								.setName('position')
								.setNameLocalizations({ ko: '번호' })
								.setDescription('The position of the track to remove.')
								.setDescriptionLocalizations({ ko: '제거할 곡의 번호에요.' })
								.setMinValue(1)
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('move')
						.setNameLocalizations({ ko: '이동' })
						.setDescription('Move a track to a different position.')
						.setDescriptionLocalizations({ ko: '곡의 위치를 이동해요.' })
						.addIntegerOption((option) =>
							option
								.setName('from')
								.setNameLocalizations({ ko: '원래위치' })
								.setDescription('Current position of the track.')
								.setDescriptionLocalizations({ ko: '이동할 곡의 현재 위치에요.' })
								.setMinValue(1)
								.setRequired(true)
						)
						.addIntegerOption((option) =>
							option
								.setName('to')
								.setNameLocalizations({ ko: '이동위치' })
								.setDescription('New position for the track.')
								.setDescriptionLocalizations({ ko: '곡을 이동할 위치에요.' })
								.setMinValue(1)
								.setRequired(true)
						)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const subcommand = interaction.options.getSubcommand(true);

		switch (subcommand) {
			case 'list':
				await this.handleList(interaction);
				break;
			case 'shuffle':
				await this.handleShuffle(interaction);
				break;
			case 'clear':
				await this.handleClear(interaction);
				break;
			case 'remove':
				await this.handleRemove(interaction);
				break;
			case 'move':
				await this.handleMove(interaction);
				break;
		}
	}

	private async handleList(interaction: ChatInputCommandInteraction<'cached'>) {
		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player || player.queue.tracks.length === 0) {
			await interaction.reply({
				components: [view.queueEmpty()],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}

		const totalPages = Math.ceil(player.queue.tracks.length / QUEUE_PAGE_SIZE);
		const page = Math.min(interaction.options.getInteger('page') ?? 1, totalPages);

		await interaction.reply({
			components: [view.queueList({ player, page, totalPages })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleShuffle(interaction: ChatInputCommandInteraction<'cached'>) {
		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player || player.queue.tracks.length === 0) {
			throw new UserError({
				identifier: 'queue_empty',
				message: '📭 대기열이 비어있어요.'
			});
		}

		await player.queue.shuffle();
		await interaction.reply({
			components: [view.queueShuffled({ count: player.queue.tracks.length })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleClear(interaction: ChatInputCommandInteraction<'cached'>) {
		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player || player.queue.tracks.length === 0) {
			throw new UserError({
				identifier: 'queue_empty',
				message: '📭 대기열이 비어있어요.'
			});
		}

		const count = player.queue.tracks.length;
		player.queue.splice(0, count);

		await interaction.reply({
			components: [view.queueCleared({ count })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleRemove(interaction: ChatInputCommandInteraction<'cached'>) {
		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) return;

		const position = interaction.options.getInteger('position', true);
		if (position > player.queue.tracks.length) {
			throw new UserError({
				identifier: 'queue_invalid_position',
				message: '❌ 해당 번호의 곡이 대기열에 없어요.'
			});
		}

		const removed = player.queue.splice(position - 1, 1);
		await interaction.reply({
			components: [view.queueRemoved({ track: removed[0] as Track, position })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleMove(interaction: ChatInputCommandInteraction<'cached'>) {
		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) return;

		const from = interaction.options.getInteger('from', true);
		const to = interaction.options.getInteger('to', true);
		const queueLength = player.queue.tracks.length;

		if (from > queueLength || to > queueLength) {
			throw new UserError({
				identifier: 'queue_invalid_position',
				message: '❌ 해당 번호의 곡이 대기열에 없어요.'
			});
		}

		if (from === to) {
			throw new UserError({
				identifier: 'queue_same_position',
				message: '❌ 같은 위치로는 이동할 수 없어요.'
			});
		}

		const [track] = player.queue.splice(from - 1, 1);
		player.queue.splice(to - 1, 0, track);

		await interaction.reply({
			components: [view.queueMoved({ track: track as Track, from, to })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
