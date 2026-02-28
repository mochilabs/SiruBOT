import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { createContainer } from '@sirubot/utils';
import { Track } from 'lavalink-client';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'favorites',
	description: '즐겨찾기한 노래를 관리해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable']
})
export class FavoritesCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '즐겨찾기' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '즐겨찾기를 관리해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('add')
						.setNameLocalizations({ ko: '추가' })
						.setDescription('Add the currently playing track to your favorites.')
						.setDescriptionLocalizations({ ko: '현재 재생 중인 곡을 즐겨찾기에 추가해요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('remove')
						.setNameLocalizations({ ko: '삭제' })
						.setDescription('Remove the currently playing track from your favorites.')
						.setDescriptionLocalizations({ ko: '현재 재생 중인 곡을 즐겨찾기에서 삭제해요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('list')
						.setNameLocalizations({ ko: '목록' })
						.setDescription('Show your favorite tracks.')
						.setDescriptionLocalizations({ ko: '즐겨찾기 목록을 보여줘요.' })
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
						.setName('play')
						.setNameLocalizations({ ko: '재생' })
						.setDescription('Play all your favorite tracks.')
						.setDescriptionLocalizations({ ko: '즐겨찾기의 모든 곡을 재생해요.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const subcommand = interaction.options.getSubcommand(true);

		switch (subcommand) {
			case 'add':
				await this.handleAdd(interaction);
				break;
			case 'remove':
				await this.handleRemove(interaction);
				break;
			case 'list':
				await this.handleList(interaction);
				break;
			case 'play':
				await this.handlePlay(interaction);
				break;
		}
	}

	private async handleAdd(interaction: ChatInputCommandInteraction<'cached'>) {
		const player = this.container.audio.getPlayer(interaction.guildId);
		const current = player?.queue.current;

		if (!player || !current) {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent('❌ 현재 재생 중인 곡이 없어요.'))],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}

		// Ensure user exists
		await this.container.db.user.upsert({
			where: { id: interaction.user.id },
			create: { id: interaction.user.id },
			update: {}
		});

		// Ensure track exists
		const trackData = this.extractTrackData(current);
		await this.container.db.track.upsert({
			where: { id: trackData.id },
			create: trackData,
			update: {}
		});

		// Check if already favorited
		const existing = await this.container.db.userFavorite.findUnique({
			where: {
				userId_trackId: {
					userId: interaction.user.id,
					trackId: trackData.id
				}
			}
		});

		if (existing) {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent('⚠️ 이미 즐겨찾기에 추가된 곡이에요.'))],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}

		await this.container.db.userFavorite.create({
			data: {
				userId: interaction.user.id,
				trackId: trackData.id
			}
		});

		await interaction.reply({
			components: [
				createContainer().addTextDisplayComponents((t) => t.setContent(`⭐ **${current.info.title}**을(를) 즐겨찾기에 추가했어요.`))
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleRemove(interaction: ChatInputCommandInteraction<'cached'>) {
		const player = this.container.audio.getPlayer(interaction.guildId);
		const current = player?.queue.current;

		if (!player || !current) {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent('❌ 현재 재생 중인 곡이 없어요.'))],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}

		const trackId = current.info.identifier;

		try {
			await this.container.db.userFavorite.delete({
				where: {
					userId_trackId: {
						userId: interaction.user.id,
						trackId
					}
				}
			});

			await interaction.reply({
				components: [
					createContainer().addTextDisplayComponents((t) => t.setContent(`🗑️ **${current.info.title}**을(를) 즐겨찾기에서 삭제했어요.`))
				],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent('❌ 즐겨찾기에 없는 곡이에요.'))],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
		}
	}

	private async handleList(interaction: ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply();

		const page = interaction.options.getInteger('page') ?? 1;
		const pageSize = 10;
		const skip = (page - 1) * pageSize;

		const [favorites, total] = await Promise.all([
			this.container.db.userFavorite.findMany({
				where: { userId: interaction.user.id },
				include: { track: true },
				orderBy: { createdAt: 'desc' },
				skip,
				take: pageSize
			}),
			this.container.db.userFavorite.count({
				where: { userId: interaction.user.id }
			})
		]);

		if (favorites.length === 0) {
			await interaction.editReply({
				components: [
					createContainer().addTextDisplayComponents((t) =>
						t.setContent(
							total === 0
								? '📭 즐겨찾기가 비어있어요.\n-# `/즐겨찾기 추가`로 현재 재생 중인 곡을 추가해보세요!'
								: '❌ 해당 페이지에 곡이 없어요.'
						)
					)
				],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		const totalPages = Math.ceil(total / pageSize);
		const list = favorites
			.map((fav, index) => {
				const track = fav.track;
				return `\`#${skip + index + 1}\` **[${track.title}](${track.url})** - ${track.artist}`;
			})
			.join('\n');

		await interaction.editReply({
			components: [
				createContainer().addTextDisplayComponents((t) =>
					t.setContent(`### ⭐ 즐겨찾기 목록\n${list}\n-# 페이지 ${page}/${totalPages} | 총 ${total}곡`)
				)
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handlePlay(interaction: ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply();

		const member = interaction.member;
		const voiceChannel = member.voice.channel;

		if (!voiceChannel) {
			await interaction.editReply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent('❌ 먼저 음성 채널에 접속해주세요.'))],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		const favorites = await this.container.db.userFavorite.findMany({
			where: { userId: interaction.user.id },
			include: { track: true },
			orderBy: { createdAt: 'asc' }
		});

		if (favorites.length === 0) {
			await interaction.editReply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent('📭 즐겨찾기가 비어있어요.'))],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		let player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) {
			player = this.container.audio.createPlayer({
				guildId: interaction.guildId,
				voiceChannelId: voiceChannel.id,
				textChannelId: interaction.channelId,
				selfDeaf: true
			});
			await player.connect();
		}

		let addedCount = 0;
		for (const fav of favorites) {
			const result = await player.search(
				{
					query: fav.track.url,
					source: fav.track.source as any
				},
				interaction.user
			);

			if (result.tracks.length > 0) {
				await player.queue.add(result.tracks[0]);
				addedCount++;
			}
		}

		if (!player.playing && !player.paused) {
			await player.play();
		}

		await interaction.editReply({
			components: [
				createContainer().addTextDisplayComponents((t) => t.setContent(`⭐ 즐겨찾기에서 **${addedCount}곡**을 대기열에 추가했어요.`))
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private extractTrackData(track: Track) {
		const info = track.info;
		const id = info.identifier;
		const title = info.title ?? 'Unknown Title';
		const artist = info.author ?? 'Unknown Artist';
		const duration = info.duration ?? 0;
		const url = info.uri ?? '';
		const source = info.sourceName ?? 'unknown';
		const thumbnail = info.artworkUrl ?? (source === 'youtube' && id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null);

		return { id, title, artist, duration, url, source, thumbnail };
	}
}
