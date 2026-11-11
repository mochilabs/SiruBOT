import { randomUUID } from 'node:crypto';
import { emoji } from '@sirubot/utils';
import { container, UserError } from '@sapphire/framework';
import {
	ActionRowBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ChatInputCommandInteraction,
	type ButtonInteraction
} from 'discord.js';
import { libraryId } from '../customIds.ts';
import { playlistLibraryView, PLAYLIST_PAGE_SIZE, type LibraryState } from './playlist.ts';
import { notice } from '../../general/view/notice.ts';

export async function addPlaylistQuery(userId: string, name: string, query: string): Promise<string> {
	const node = container.audio.nodeManager.leastUsedNodes('players')[0];
	if (!node)
		throw new UserError({
			identifier: 'playlist_search_unavailable',
			message: `${emoji('error')} 지금 음악을 검색할 수 없어요. 잠시 후 다시 추가해 주세요.`,
			context: { ephemeral: true }
		});
	const result = await node.search({ query, source: 'ytsearch' }, { id: userId });
	const track = result.tracks[0];
	if (!track)
		throw new UserError({
			identifier: 'playlist_search_empty',
			message: `${emoji('error')} 곡을 찾지 못했어요. 제목이나 주소를 확인해 주세요.`,
			context: { ephemeral: true }
		});
	await container.playlistService.addTrack(userId, name, track);
	return `**${track.info.title.slice(0, 100)}**을(를) 추가했어요.`;
}

export async function openPlaylistPanel(
	interaction: ChatInputCommandInteraction<'cached'>,
	options: { name?: string; action?: 'delete' | 'remove'; entryId?: string; page?: number } = {}
) {
	await container.playlistService.getOrCreateFavoritesPlaylist(interaction.user.id);
	let playlists = await container.playlistService.getUserPlaylists(interaction.user.id);
	const initial = options.name ? playlists.find((playlist) => playlist.name === options.name) : undefined;
	if (options.name && !initial)
		throw new UserError({
			identifier: 'playlist_missing',
			message: `${emoji('error')} 플레이리스트를 찾을 수 없어요. /플레이리스트 목록에서 다시 골라 주세요.`,
			context: { ephemeral: true }
		});
	let state: LibraryState = initial
		? options.action === 'delete'
			? { kind: 'delete', playlistId: initial.id, page: 0 }
			: options.action === 'remove' && options.entryId
				? { kind: 'remove', playlistId: initial.id, entryId: options.entryId, page: 0 }
				: { kind: 'tracks', playlistId: initial.id, page: Math.max(0, (options.page ?? 1) - 1) }
		: { kind: 'list', page: 0 };
	const id = randomUUID();
	/** 이 보관함 패널의 컴포넌트 customId만 해석해요 (모달·다른 패널의 ID는 null). */
	const decodeOwn = (customId: string) => {
		const decoded = libraryId.decode(customId);
		return decoded && decoded.action !== 'form' && decoded.action !== 'formValue' && decoded.sessionId === id ? decoded : null;
	};
	let busy = false;
	let expired = false;
	async function render(feedback = '') {
		playlists = await container.playlistService.getUserPlaylists(interaction.user.id);
		let detail = null;
		if (state.kind !== 'list') {
			const selectedId = state.playlistId;
			const selected = playlists.find((playlist) => playlist.id === selectedId);
			if (selected) {
				detail = await container.playlistService.getPlaylistTracks(interaction.user.id, selected.name);
				if (detail.playlist.id !== selectedId) throw new Error('목록이 변경됐어요. 다시 열어 주세요.');
			} else state = { kind: 'list', page: 0 };
		}
		const count = state.kind === 'list' ? playlists.length : (detail?.tracks.length ?? 0);
		state.page = Math.min(state.page, Math.max(0, Math.ceil(count / PLAYLIST_PAGE_SIZE) - 1));
		return playlistLibraryView(id, state, playlists, detail, feedback);
	}
	const message = await interaction.editReply({
		components: [await render()],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { parse: [] }
	});
	const collector = message.createMessageComponentCollector({
		time: 10 * 60_000,
		idle: 3 * 60_000,
		filter: (component) => decodeOwn(component.customId) !== null
	});
	async function form(button: ButtonInteraction<'cached'>, create: boolean, playlistId?: string) {
		const formId = libraryId.encode('form', { formId: randomUUID() });
		const modal = new ModalBuilder()
			.setCustomId(formId)
			.setTitle(create ? '새 플레이리스트' : '곡 추가')
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder()
						.setCustomId(libraryId.encode('formValue'))
						.setLabel(create ? '플레이리스트 이름' : '곡 제목 또는 주소')
						.setStyle(TextInputStyle.Short)
						.setRequired(true)
						.setMaxLength(create ? 80 : 500)
				)
			);
		await button.showModal(modal);
		const submitted = await button
			.awaitModalSubmit({ time: 120_000, filter: (submission) => submission.user.id === interaction.user.id && submission.customId === formId })
			.catch(() => null);
		if (!submitted) return;
		await submitted.deferReply({ flags: [MessageFlags.Ephemeral] });
		try {
			if (expired) throw new Error('보관함 사용 시간이 지났어요. /플레이리스트 목록을 다시 열어 주세요.');
			const value = submitted.fields.getTextInputValue(libraryId.encode('formValue')).trim();
			if (!value) throw new Error('내용을 입력해 주세요.');
			let feedback;
			if (create) {
				const playlist = await container.playlistService.createPlaylist(interaction.user.id, value);
				state = { kind: 'tracks', playlistId: playlist.id, page: 0 };
				feedback = '플레이리스트를 만들었어요. 곡 추가 버튼으로 첫 곡을 담아 보세요.';
			} else {
				const playlist = await container.db.playlist.findFirst({ where: { id: playlistId, userId: interaction.user.id } });
				if (!playlist) throw new Error('플레이리스트가 삭제됐어요. 목록을 다시 열어 주세요.');
				feedback = await addPlaylistQuery(interaction.user.id, playlist.name, value);
			}
			await submitted.editReply({ components: [notice(feedback)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
			if (!expired) await interaction.editReply({ components: [await render(feedback)] });
		} catch (error) {
			await submitted.editReply({
				components: [notice(error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해 주세요.')],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	}
	collector.on('collect', async (component) => {
		if (component.user.id !== interaction.user.id || !component.inCachedGuild()) {
			await component.reply({
				components: [notice(`${emoji('error')} 본인의 /플레이리스트 목록을 열어 주세요.`)],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}
		if (busy || expired) {
			await component.reply({
				components: [notice(`${emoji('error')} 이전 요청을 처리 중이에요. 잠시 후 다시 선택해 주세요.`)],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}
		busy = true;
		try {
			const action = decodeOwn(component.customId)?.action;
			if ((action === 'create' || action === 'add') && component.isButton()) {
				await form(component, action === 'create', state.kind === 'list' ? undefined : state.playlistId);
				return;
			}
			await component.deferUpdate();
			let feedback = '';
			if (action === 'home') state = { kind: 'list', page: 0 };
			else if (action === 'prev') state.page = Math.max(0, state.page - 1);
			else if (action === 'next') state.page++;
			else if (action === 'open' && component.isStringSelectMenu()) state = { kind: 'tracks', playlistId: component.values[0]!, page: 0 };
			else if (state.kind !== 'list') {
				const playlist = await container.db.playlist.findFirst({ where: { id: state.playlistId, userId: interaction.user.id } });
				if (!playlist) {
					state = { kind: 'list', page: 0 };
					feedback = '이미 삭제된 목록이에요.';
				} else if (action === 'remove' && component.isStringSelectMenu())
					state = { kind: 'remove', playlistId: playlist.id, page: state.page, entryId: component.values[0]! };
				else if (action === 'delete' && playlist.name !== '즐겨찾기') state = { kind: 'delete', playlistId: playlist.id, page: state.page };
				else if (action === 'cancel') state = { kind: 'tracks', playlistId: playlist.id, page: state.page };
				else if (action === 'confirm' && state.kind === 'delete' && playlist.name !== '즐겨찾기') {
					await container.db.playlist.deleteMany({ where: { id: playlist.id, userId: interaction.user.id } });
					state = { kind: 'list', page: 0 };
					feedback = '플레이리스트를 삭제했어요.';
				} else if (action === 'confirm' && state.kind === 'remove') {
					const removed = await container.db.playlistTrack.deleteMany({ where: { id: state.entryId, playlistId: playlist.id } });
					state = { kind: 'tracks', playlistId: playlist.id, page: state.page };
					feedback = removed.count ? '선택한 곡을 목록에서 뺐어요.' : '이미 삭제된 곡이에요. 현재 목록을 보여드릴게요.';
				} else if (action === 'play') {
					const { tracks } = await container.playlistService.getPlaylistTracks(interaction.user.id, playlist.name);
					feedback = await container.playlistPlayback.playSavedTracks(component, tracks);
				}
			}
			if (!expired) await interaction.editReply({ components: [await render(feedback)] });
		} catch (error) {
			const feedback = error instanceof Error ? error.message : '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
			if (!expired) await interaction.editReply({ components: [await render(feedback)] }).catch(() => undefined);
		} finally {
			busy = false;
		}
	});
	collector.once('end', () => {
		expired = true;
		void interaction
			.editReply({
				components: [notice(`${emoji('error')} 보관함 사용 시간이 지났어요. /플레이리스트 목록 또는 /즐겨찾기 목록으로 다시 열어 주세요.`)],
				flags: [MessageFlags.IsComponentsV2]
			})
			.catch(() => undefined);
	});
}
