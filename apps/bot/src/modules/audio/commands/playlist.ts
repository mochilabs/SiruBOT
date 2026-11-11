import { ApplyOptions } from '@sapphire/decorators';
import { emoji } from '@sirubot/utils';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { respondPlaylistNames, respondPlaylistTrackPositions } from '../../../lib/autocomplete.ts';
import { openPlaylistPanel, addPlaylistQuery } from '../view/playlistPanel.ts';
import { notice } from '../../general/view/notice.ts';

@ApplyOptions<Command.Options>({ name: 'playlist', description: 'Manage your playlists.', fullCategory: ['음악'] })
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
							opt
								.setName('name')
								.setNameLocalizations({ ko: '이름' })
								.setDescription('Playlist name.')
								.setDescriptionLocalizations({ ko: '플레이리스트 이름이에요.' })
								.setMaxLength(80)
								.setDescriptionLocalizations({ ko: '플레이리스트 이름이에요.' })
								.setDescriptionLocalizations({ ko: '플레이리스트 이름이에요.' })
								.setRequired(true)
						)
						.addStringOption((opt) =>
							opt
								.setName('description')
								.setNameLocalizations({ ko: '설명' })
								.setDescription('Optional playlist description.')
								.setDescriptionLocalizations({ ko: '플레이리스트 설명 (선택)' })
								.setRequired(false)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('delete')
						.setNameLocalizations({ ko: '삭제' })
						.setDescription('Delete a playlist.')
						.setDescriptionLocalizations({ ko: '플레이리스트를 삭제해요.' })
						.addStringOption((opt) =>
							opt
								.setName('name')
								.setNameLocalizations({ ko: '이름' })
								.setDescription('Playlist to delete.')
								.setDescriptionLocalizations({ ko: '삭제할 플레이리스트 이름이에요.' })
								.setRequired(true)
								.setAutocomplete(true)
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
							opt
								.setName('name')
								.setNameLocalizations({ ko: '이름' })
								.setDescription('Playlist to view.')
								.setDescriptionLocalizations({ ko: '조회할 플레이리스트 이름이에요.' })
								.setRequired(true)
								.setAutocomplete(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('add')
						.setNameLocalizations({ ko: '추가' })
						.setDescription('Add a track to a playlist.')
						.setDescriptionLocalizations({ ko: '플레이리스트에 곡을 추가해요.' })
						.addStringOption((opt) =>
							opt
								.setName('name')
								.setNameLocalizations({ ko: '이름' })
								.setDescription('Playlist name.')
								.setDescriptionLocalizations({ ko: '플레이리스트 이름이에요.' })
								.setMaxLength(80)
								.setRequired(true)
								.setAutocomplete(true)
						)
						.addStringOption((opt) =>
							opt
								.setName('query')
								.setNameLocalizations({ ko: '검색어' })
								.setDescription('Track title or URL.')
								.setDescriptionLocalizations({ ko: '곡 제목이나 URL이에요.' })
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('add-current')
						.setNameLocalizations({ ko: '현재곡추가' })
						.setDescription('Add the currently playing track to a playlist.')
						.setDescriptionLocalizations({ ko: '현재 재생 중인 곡을 플레이리스트에 추가해요.' })
						.addStringOption((opt) =>
							opt
								.setName('name')
								.setNameLocalizations({ ko: '이름' })
								.setDescription('Playlist name.')
								.setDescriptionLocalizations({ ko: '플레이리스트 이름이에요.' })
								.setMaxLength(80)
								.setRequired(true)
								.setAutocomplete(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('remove')
						.setNameLocalizations({ ko: '곡제거' })
						.setDescription('Remove a track from a playlist.')
						.setDescriptionLocalizations({ ko: '플레이리스트에서 곡을 제거해요.' })
						.addStringOption((opt) =>
							opt
								.setName('name')
								.setNameLocalizations({ ko: '이름' })
								.setDescription('Playlist name.')
								.setDescriptionLocalizations({ ko: '플레이리스트 이름이에요.' })
								.setMaxLength(80)
								.setRequired(true)
								.setAutocomplete(true)
						)
						.addStringOption((opt) =>
							opt
								.setName('track')
								.setNameLocalizations({ ko: '곡' })
								.setDescription('Track number to remove.')
								.setDescriptionLocalizations({ ko: '제거할 곡을 선택해요. 삭제 전에 다시 확인해요.' })
								.setRequired(true)
								.setAutocomplete(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('play')
						.setNameLocalizations({ ko: '재생' })
						.setDescription('Play a playlist.')
						.setDescriptionLocalizations({ ko: '플레이리스트의 곡들을 대기열에 추가하고 재생해요.' })
						.addStringOption((opt) =>
							opt
								.setName('name')
								.setNameLocalizations({ ko: '이름' })
								.setDescription('Playlist to play.')
								.setDescriptionLocalizations({ ko: '재생할 플레이리스트 이름이에요.' })
								.setRequired(true)
								.setAutocomplete(true)
						)
				);
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		if (!interaction.inCachedGuild()) return interaction.respond([]);

		let subcommand: string;
		try {
			subcommand = interaction.options.getSubcommand(true);
		} catch {
			return interaction.respond([]);
		}

		const focused = interaction.options.getFocused(true);
		if (focused.name === 'track') {
			// 번호 후보는 이미 고른 플레이리스트의 곡 목록이에요
			return respondPlaylistTrackPositions(interaction, interaction.options.getString('name'));
		}
		if (focused.name === 'name' && subcommand !== 'create') {
			return respondPlaylistNames(interaction);
		}
		return interaction.respond([]);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const sub = interaction.options.getSubcommand(true);
		const name = interaction.options.getString('name') ?? undefined;
		if (sub === 'create') {
			const created = await this.container.playlistService.createPlaylist(
				interaction.user.id,
				interaction.options.getString('name', true).trim(),
				interaction.options.getString('description') ?? undefined
			);
			return openPlaylistPanel(interaction, { name: created.name });
		}
		if (sub === 'list') return openPlaylistPanel(interaction);
		if (sub === 'view') return openPlaylistPanel(interaction, { name });
		if (sub === 'delete') return openPlaylistPanel(interaction, { name, action: 'delete' });
		if (sub === 'remove')
			return openPlaylistPanel(interaction, { name, action: 'remove', entryId: interaction.options.getString('track', true) });
		if (sub === 'add') {
			const feedback = await addPlaylistQuery(
				interaction.user.id,
				interaction.options.getString('name', true),
				interaction.options.getString('query', true)
			);
			await interaction.editReply({ components: [notice(feedback)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
			return;
		}
		if (sub === 'add-current') {
			const track = this.container.audio.getPlayer(interaction.guildId)?.queue.current;
			if (!track || !('encoded' in track))
				throw new UserError({
					identifier: 'playlist_no_track',
					message: `${emoji('error')} 현재 곡이 없어요. /플레이리스트 추가로 제목이나 주소를 입력해 주세요.`,
					context: { ephemeral: true }
				});
			await this.container.playlistService.addTrack(interaction.user.id, interaction.options.getString('name', true), track);
			await interaction.editReply({
				components: [notice(`${emoji('success')} **${track.info.title}**을(를) 목록에 추가했어요.`)],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { parse: [] }
			});
			return;
		}
		if (sub === 'play') {
			const { tracks } = await this.container.playlistService.getPlaylistTracks(
				interaction.user.id,
				interaction.options.getString('name', true)
			);
			const feedback = await this.container.playlistPlayback.playSavedTracks(interaction, tracks);
			await interaction.editReply({ components: [notice(feedback)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
		}
	}
}
