import { container } from '@sapphire/framework';
import type { AutocompleteInteraction } from 'discord.js';
import { getUserQueuedTracks } from '../modules/audio/lavalink/autoPlayRelated.ts';

/** 자동완성 선택지 이름 길이 상한 (Discord: 100자) */
const CHOICE_NAME_MAX = 100;
/** 한 번에 내려줄 선택지 수 상한 (Discord: 25개) */
const CHOICE_LIMIT = 25;

/** 선택지 이름을 Discord 상한에 맞춰 자르고 말줄임표를 붙여요 */
function clipChoiceName(name: string): string {
	return name.length > CHOICE_NAME_MAX ? `${name.slice(0, CHOICE_NAME_MAX - 1)}…` : name;
}

/**
 * 대기열 곡 자동완성 — 1-based 번호를 선택지 값으로 내려요.
 * `/음악 건너뛰기`, `/대기열 제거·이동`이 같은 인덱스 규칙(유저 대기열, 선예열 추천곡 제외)을 공유해야
 * 사용자가 목록에서 고른 번호가 그대로 그 명령어의 인자로 먹혀요.
 * 숫자를 입력 중이면 그 번호부터 25개 창을 옮겨요 — 뒤쪽 곡도 골라질 수 있게.
 */
export async function respondQueuedTracks(interaction: AutocompleteInteraction): Promise<void> {
	if (!interaction.inCachedGuild()) return interaction.respond([]);

	const player = container.audio.getPlayer(interaction.guildId);
	const tracks = player ? getUserQueuedTracks(player) : [];

	const focused = interaction.options.getFocused(true);
	const typed = typeof focused.value === 'string' ? focused.value.trim().replace(/^#/, '') : '';
	const parsed = Number.parseInt(typed, 10);
	const offset = Number.isInteger(parsed) && parsed > 0 ? parsed - 1 : 0;

	await interaction.respond(
		tracks.slice(offset, offset + CHOICE_LIMIT).map((track, index) => ({
			name: clipChoiceName(`#${offset + index + 1} ${track.info.title}`),
			value: offset + index + 1
		}))
	);
}

/**
 * 플레이리스트 이름 자동완성 — 사용자 본인 플레이리스트만 후보예요.
 * 값은 실제 이름 그대로 내려요 (핸들러가 이름으로 조회해요).
 */
export async function respondPlaylistNames(interaction: AutocompleteInteraction): Promise<void> {
	const typed = interaction.options.getFocused().trim().toLowerCase();
	const playlists = await container.playlistService.getUserPlaylists(interaction.user.id).catch(() => []);

	await interaction.respond(
		playlists
			.filter((playlist) => playlist.name.toLowerCase().includes(typed))
			.slice(0, CHOICE_LIMIT)
			.map((playlist) => ({
				name: clipChoiceName(`${playlist.name} (${playlist._count.tracks}곡)`),
				value: playlist.name
			}))
	);
}

/** 플레이리스트 곡 번호 자동완성 — 선택한 플레이리스트의 트랙 제목을 1-based 번호로 내려요 */
export async function respondPlaylistTrackPositions(interaction: AutocompleteInteraction, playlistName: string | null): Promise<void> {
	if (!playlistName) return interaction.respond([]);

	const result = await container.playlistService.getPlaylistTracks(interaction.user.id, playlistName).catch(() => null);
	if (!result) return interaction.respond([]);

	await interaction.respond(
		result.tracks.slice(0, CHOICE_LIMIT).map((entry, index) => ({
			name: clipChoiceName(`#${index + 1} ${entry.track.title}`),
			value: index + 1
		}))
	);
}
