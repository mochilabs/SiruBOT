import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { createContainer } from '@sirubot/utils';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'playlist',
	description: '커스텀 플레이리스트를 관리해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable']
})
export class PlaylistCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '플레이리스트' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '커스텀 플레이리스트를 관리해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('create')
						.setNameLocalizations({ ko: '생성' })
						.setDescription('Create a new playlist.')
						.setDescriptionLocalizations({ ko: '새로운 플레이리스트를 생성해요.' })
						.addStringOption((opt) =>
							opt.setName('name').setNameLocalizations({ ko: '이름' }).setDescription('이름을 입력하세요.').setRequired(true)
						)
						.addStringOption((opt) =>
							opt.setName('description').setNameLocalizations({ ko: '설명' }).setDescription('설명을 입력하세요.').setRequired(false)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('delete')
						.setNameLocalizations({ ko: '삭제' })
						.setDescription('Delete a playlist.')
						.setDescriptionLocalizations({ ko: '플레이리스트를 삭제해요.' })
						.addStringOption((opt) =>
							opt.setName('name').setNameLocalizations({ ko: '이름' }).setDescription('삭제할 플레이리스트 이름').setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('list')
						.setNameLocalizations({ ko: '목록' })
						.setDescription('List your playlists.')
						.setDescriptionLocalizations({ ko: '나의 플레이리스트 목록을 보여줘요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('view')
						.setNameLocalizations({ ko: '조회' })
						.setDescription('View tracks in a playlist.')
						.setDescriptionLocalizations({ ko: '플레이리스트에 담긴 곡들을 보여줘요.' })
						.addStringOption((opt) =>
							opt.setName('name').setNameLocalizations({ ko: '이름' }).setDescription('조회할 플레이리스트 이름').setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('add')
						.setNameLocalizations({ ko: '추가' })
						.setDescription('Add a track to a playlist.')
						.setDescriptionLocalizations({ ko: '플레이리스트에 곡을 추가해요.' })
						.addStringOption((opt) =>
							opt.setName('name').setNameLocalizations({ ko: '이름' }).setDescription('플레이리스트 이름').setRequired(true)
						)
						.addStringOption((opt) =>
							opt.setName('query').setNameLocalizations({ ko: '검색어' }).setDescription('곡 제목이나 URL').setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('add-current')
						.setNameLocalizations({ ko: '현재곡추가' })
						.setDescription('Add the currently playing track to a playlist.')
						.setDescriptionLocalizations({ ko: '현재 재생 중인 곡을 플레이리스트에 추가해요.' })
						.addStringOption((opt) =>
							opt.setName('name').setNameLocalizations({ ko: '이름' }).setDescription('플레이리스트 이름').setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('remove')
						.setNameLocalizations({ ko: '곡제거' })
						.setDescription('Remove a track from a playlist.')
						.setDescriptionLocalizations({ ko: '플레이리스트에서 곡을 제거해요.' })
						.addStringOption((opt) =>
							opt.setName('name').setNameLocalizations({ ko: '이름' }).setDescription('플레이리스트 이름').setRequired(true)
						)
						.addIntegerOption((opt) =>
							opt.setName('position').setNameLocalizations({ ko: '번호' }).setDescription('제거할 곡의 번호').setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('play')
						.setNameLocalizations({ ko: '재생' })
						.setDescription('Play a playlist.')
						.setDescriptionLocalizations({ ko: '플레이리스트의 곡들을 대기열에 추가하고 재생해요.' })
						.addStringOption((opt) =>
							opt.setName('name').setNameLocalizations({ ko: '이름' }).setDescription('재생할 플레이리스트 이름').setRequired(true)
						)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const subcommand = interaction.options.getSubcommand(true);

		switch (subcommand) {
			case 'create': return this.handleCreate(interaction);
			case 'delete': return this.handleDelete(interaction);
			case 'list': return this.handleList(interaction);
			case 'view': return this.handleView(interaction);
			case 'add': return this.handleAdd(interaction);
			case 'add-current': return this.handleAddCurrent(interaction);
			case 'remove': return this.handleRemove(interaction);
			case 'play': return this.handlePlay(interaction);
		}
	}

	private async handleCreate(interaction: ChatInputCommandInteraction<'cached'>) {
		const name = interaction.options.getString('name', true);
		const description = interaction.options.getString('description');

		try {
			await this.container.playlistService.createPlaylist(interaction.user.id, name, description ?? undefined);
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`✅ 플레이리스트 **${name}**을(를) 생성했어요.`))],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error: any) {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`❌ ${error.message}`))],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
		}
	}

	private async handleDelete(interaction: ChatInputCommandInteraction<'cached'>) {
		const name = interaction.options.getString('name', true);

		try {
			await this.container.playlistService.deletePlaylist(interaction.user.id, name);
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`🗑️ 플레이리스트 **${name}**을(를) 삭제했어요.`))],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error: any) {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`❌ ${error.message}`))],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
		}
	}

	private async handleList(interaction: ChatInputCommandInteraction<'cached'>) {
		const playlists = await this.container.playlistService.getUserPlaylists(interaction.user.id);

		if (playlists.length === 0) {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent('📭 생성된 플레이리스트가 없어요.'))],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		const list = playlists.map((p) => `**${p.name}** - ${p._count.tracks}곡 ${p.description ? `\n-# ${p.description}` : ''}`).join('\n\n');

		await interaction.reply({
			components: [createContainer().addTextDisplayComponents((t) => t.setContent(`### 📁 나의 플레이리스트\n${list}`))],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleView(interaction: ChatInputCommandInteraction<'cached'>) {
		const name = interaction.options.getString('name', true);

		try {
			const { playlist, tracks } = await this.container.playlistService.getPlaylistTracks(interaction.user.id, name);

			if (tracks.length === 0) {
				await interaction.reply({
					components: [createContainer().addTextDisplayComponents((t) => t.setContent(`📭 **${playlist.name}** 플레이리스트가 비어있어요.`))],
					flags: [MessageFlags.IsComponentsV2]
				});
				return;
			}

			const list = tracks.map((t, index) => `\`#${index + 1}\` **[${t.track.title}](${t.track.url})** - ${t.track.artist}`).join('\n');

			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`### 📋 플레이리스트: ${playlist.name}\n${list}`))],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error: any) {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`❌ ${error.message}`))],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
		}
	}

	private async handleAdd(interaction: ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply();

		const name = interaction.options.getString('name', true);
		const query = interaction.options.getString('query', true);

		let player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) {
			player = this.container.audio.createPlayer({
				guildId: interaction.guildId,
				voiceChannelId: interaction.member.voice.channelId ?? '',
				textChannelId: interaction.channelId,
				selfDeaf: true
			});
		}

		const result = await player.search({ query }, interaction.user);
		if (result.tracks.length === 0) {
			await interaction.editReply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent('❌ 곡을 찾을 수 없어요.'))],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		const track = result.tracks[0];

		try {
			await this.container.playlistService.addTrack(interaction.user.id, name, track);
			await interaction.editReply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`✅ **${track.info.title}**을(를) **${name}** 플레이리스트에 추가했어요.`))],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error: any) {
			await interaction.editReply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`❌ ${error.message}`))],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	}

	private async handleAddCurrent(interaction: ChatInputCommandInteraction<'cached'>) {
		const name = interaction.options.getString('name', true);
		const player = this.container.audio.getPlayer(interaction.guildId);
		const current = player?.queue.current;

		if (!player || !current) {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent('❌ 현재 재생 중인 곡이 없어요.'))],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}

		try {
			await this.container.playlistService.addTrack(interaction.user.id, name, current);
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`✅ **${current.info.title}**을(를) **${name}** 플레이리스트에 추가했어요.`))],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error: any) {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`❌ ${error.message}`))],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
		}
	}

	private async handleRemove(interaction: ChatInputCommandInteraction<'cached'>) {
		const name = interaction.options.getString('name', true);
		const position = interaction.options.getInteger('position', true);

		try {
			const { tracks } = await this.container.playlistService.getPlaylistTracks(interaction.user.id, name);
			const target = tracks[position - 1]; // 1-based index to array index

			if (!target) {
				throw new Error('해당 번호의 곡이 없어요.');
			}

			await this.container.playlistService.removeTrack(interaction.user.id, name, target.position);
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`🗑️ **${name}** 플레이리스트에서 곡을 제거했어요.`))],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error: any) {
			await interaction.reply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`❌ ${error.message}`))],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
		}
	}

	private async handlePlay(interaction: ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply();

		const member = interaction.member;
		const voiceChannel = member.voice.channel;
		const name = interaction.options.getString('name', true);

		if (!voiceChannel) {
			await interaction.editReply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent('❌ 먼저 음성 채널에 접속해주세요.'))],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		try {
			const { playlist, tracks } = await this.container.playlistService.getPlaylistTracks(interaction.user.id, name);

			if (tracks.length === 0) {
				await interaction.editReply({
					components: [createContainer().addTextDisplayComponents((t) => t.setContent(`📭 **${playlist.name}** 플레이리스트가 비어있어요.`))],
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
			for (const t of tracks) {
				const result = await player.search({ query: t.track.url, source: t.track.source as any }, interaction.user);
				if (result.tracks.length > 0) {
					await player.queue.add(result.tracks[0]);
					addedCount++;
				}
			}

			if (!player.playing && !player.paused) {
				await player.play();
			}

			await interaction.editReply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`🎵 **${playlist.name}** 플레이리스트에서 **${addedCount}곡**을 대기열에 추가했어요.`))],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error: any) {
			await interaction.editReply({
				components: [createContainer().addTextDisplayComponents((t) => t.setContent(`❌ ${error.message}`))],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	}
}
