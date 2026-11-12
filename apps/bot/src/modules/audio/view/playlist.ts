import { ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, escapeMarkdown } from 'discord.js';
import { createContainer, emoji } from '@sirubot/utils';
import { libraryId } from '../customIds.ts';
import type { PlaylistService } from '../../../features/music/application/playlistService.ts';

type Playlist = Awaited<ReturnType<PlaylistService['getUserPlaylists']>>[number];
type Detail = Awaited<ReturnType<PlaylistService['getPlaylistTracks']>>;
export const PLAYLIST_PAGE_SIZE = 5;
export type LibraryState =
	| { kind: 'list'; page: number }
	| { kind: 'tracks'; playlistId: string; page: number }
	| { kind: 'remove'; playlistId: string; page: number; entryId: string }
	| { kind: 'delete'; playlistId: string; page: number };

const label = (text: string, limit = 80) => escapeMarkdown(text.slice(0, limit));
type ButtonAction = 'prev' | 'next' | 'create' | 'add' | 'home' | 'delete' | 'cancel' | 'confirm' | 'play';
const button = (sessionId: string, action: ButtonAction, text: string, style = ButtonStyle.Secondary) =>
	new ButtonBuilder().setCustomId(libraryId.encode(action, { sessionId })).setLabel(text).setStyle(style);

export function playlistLibraryView(id: string, state: LibraryState, playlists: Playlist[], detail: Detail | null, feedback = '') {
	const view = createContainer();
	if (feedback) view.addTextDisplayComponents((text) => text.setContent(feedback.slice(0, 700)));
	if (state.kind === 'list') {
		const pages = Math.max(1, Math.ceil(playlists.length / PLAYLIST_PAGE_SIZE));
		const page = Math.min(state.page, pages - 1);
		const shown = playlists.slice(page * PLAYLIST_PAGE_SIZE, (page + 1) * PLAYLIST_PAGE_SIZE);
		view.addTextDisplayComponents((text) =>
			text.setContent(
				`### ${emoji('folder')} 내 음악 보관함\n${playlists.length}개 플레이리스트 · ${page + 1}/${pages} 페이지\n목록을 선택하면 곡을 확인하고 재생하거나 정리할 수 있어요.`
			)
		);
		for (const item of shown)
			view.addSeparatorComponents((separator) => separator).addTextDisplayComponents((text) =>
				text.setContent(`**${label(item.name)}** · ${item._count.tracks}곡${item.description ? `\n${label(item.description, 160)}` : ''}`)
			);
		if (shown.length)
			view.addActionRowComponents((row) =>
				row.addComponents(
					new StringSelectMenuBuilder()
						.setCustomId(libraryId.encode('open', { sessionId: id }))
						.setPlaceholder('플레이리스트 선택')
						.addOptions(shown.map((item) => ({ label: item.name.slice(0, 100), description: `${item._count.tracks}곡`, value: item.id })))
				)
			);
		view.addActionRowComponents((row) =>
			row.addComponents(
				button(id, 'prev', '이전').setDisabled(page === 0),
				button(id, 'next', '다음').setDisabled(page + 1 >= pages),
				button(id, 'create', '새 플레이리스트', ButtonStyle.Primary)
			)
		);
		return view;
	}
	if (!detail) return view.addTextDisplayComponents((text) => text.setContent('목록을 찾을 수 없어요. /플레이리스트 목록을 다시 열어 주세요.'));
	const { playlist, tracks } = detail;
	if (state.kind === 'delete' || state.kind === 'remove') {
		const selected = state.kind === 'remove' ? tracks.find((entry) => entry.id === state.entryId) : null;
		view.addTextDisplayComponents((text) =>
			text.setContent(
				state.kind === 'delete'
					? `### 플레이리스트를 삭제할까요?\n**${label(playlist.name)}**에 담긴 ${tracks.length}곡의 목록을 삭제해요. 되돌릴 수 없어요.`
					: `### 이 곡을 목록에서 뺄까요?\n**${selected ? label(selected.track.title) : '이미 삭제된 곡'}**\n플레이리스트: ${label(playlist.name)}\n현재 재생과 서버 대기열은 바뀌지 않아요.`
			)
		);
		view.addActionRowComponents((row) =>
			row.addComponents(
				button(id, 'confirm', '삭제', ButtonStyle.Danger).setDisabled(state.kind === 'remove' && !selected),
				button(id, 'cancel', '돌아가기')
			)
		);
		return view;
	}
	const pages = Math.max(1, Math.ceil(tracks.length / PLAYLIST_PAGE_SIZE));
	const page = Math.min(state.page, pages - 1);
	const shown = tracks.slice(page * PLAYLIST_PAGE_SIZE, (page + 1) * PLAYLIST_PAGE_SIZE);
	view.addTextDisplayComponents((text) =>
		text.setContent(
			`### ${emoji('music_note')} ${label(playlist.name)}\n${tracks.length}곡 · ${page + 1}/${pages} 페이지${playlist.description ? `\n${label(playlist.description, 160)}` : ''}`
		)
	);
	for (const [index, entry] of shown.entries())
		view.addSeparatorComponents((separator) => separator).addTextDisplayComponents((text) =>
			text.setContent(`**${page * PLAYLIST_PAGE_SIZE + index + 1}. ${label(entry.track.title)}**\n-# ${label(entry.track.artist, 60)}`)
		);
	if (!shown.length) view.addTextDisplayComponents((text) => text.setContent('아직 곡이 없어요. 아래 곡 추가 버튼으로 채워 보세요.'));
	if (shown.length)
		view.addActionRowComponents((row) =>
			row.addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(libraryId.encode('remove', { sessionId: id }))
					.setPlaceholder('목록에서 뺄 곡 선택')
					.addOptions(
						shown.map((entry) => ({
							label: entry.track.title.slice(0, 100),
							description: entry.track.artist.slice(0, 100) || '아티스트 정보 없음',
							value: entry.id
						}))
					)
			)
		);
	view.addActionRowComponents((row) =>
		row.addComponents(
			button(id, 'prev', '이전').setDisabled(page === 0),
			button(id, 'next', '다음').setDisabled(page + 1 >= pages),
			button(id, 'home', '목록으로')
		)
	);
	view.addActionRowComponents((row) =>
		row.addComponents(
			button(id, 'play', '대기열에 추가', ButtonStyle.Primary).setDisabled(!tracks.length),
			button(id, 'add', '곡 추가'),
			button(id, 'delete', '목록 삭제', ButtonStyle.Danger).setDisabled(playlist.name === '즐겨찾기')
		)
	);
	return view;
}
