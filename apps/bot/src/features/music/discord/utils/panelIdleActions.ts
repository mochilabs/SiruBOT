import { UserError, container } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ActionRowBuilder, MessageFlags, StringSelectMenuBuilder, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { AppError } from '../../../../lib/appError.ts';
import { errorView } from '../../../../lib/errorView.ts';
import { notice } from '../../../../lib/notice.ts';
import { actorFromMember } from '../../application/actor.ts';
import { panelId } from '../customIds.ts';

/** 기본 채널 패널 대기 화면의 빠른 동작 — 최근 곡 다시 재생, 내 플레이리스트 불러오기 */
export async function openPlaylists(interaction: ButtonInteraction<'cached'>) {
	await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
	const playlists = (await container.playlistService.getUserPlaylists(interaction.user.id)).filter((playlist) => playlist._count.tracks > 0);
	if (playlists.length === 0) {
		await interaction.editReply({
			components: [errorView(`${emoji('error')} 곡이 담긴 플레이리스트가 없어요. \`/플레이리스트\`로 먼저 만들어 주세요.`)],
			flags: [MessageFlags.IsComponentsV2]
		});
		return;
	}
	const select = new StringSelectMenuBuilder()
		.setCustomId(panelId.encode('playlistPick'))
		.setPlaceholder('재생할 플레이리스트를 고르세요')
		.addOptions(
			playlists.slice(0, 25).map((playlist) => ({
				label: playlist.name.slice(0, 100),
				description: `${playlist._count.tracks}곡`,
				value: playlist.id
			}))
		);
	await interaction.editReply({
		components: [
			notice(`${emoji('scroll')} 대기열에 추가할 플레이리스트를 골라 주세요.`),
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
		],
		flags: [MessageFlags.IsComponentsV2]
	});
}

export async function playPlaylist(interaction: StringSelectMenuInteraction<'cached'>) {
	await interaction.deferUpdate();
	const playlist = await container.db.playlist.findFirst({ where: { id: interaction.values[0], userId: interaction.user.id } });
	if (!playlist) throw new UserError({ identifier: 'playlist_missing', message: `${emoji('error')} 플레이리스트를 찾을 수 없어요.` });
	const { tracks } = await container.playlistService.getPlaylistTracks(interaction.user.id, playlist.name);
	const feedback = await container.playlistPlayback.playSavedTracks(interaction, tracks);
	await interaction.editReply({ components: [notice(feedback)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

export async function playRecent(interaction: StringSelectMenuInteraction<'cached'>) {
	await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
	const track = await container.db.track.findUnique({ where: { id: interaction.values[0] } });
	if (!track) throw new UserError({ identifier: 'track_missing', message: `${emoji('error')} 곡 정보를 찾을 수 없어요.` });
	const result = await container.musicPlay.play(
		actorFromMember(interaction.member),
		{
			query: track.url,
			platform: 'ytsearch',
			requester: { id: interaction.user.id, username: interaction.member.displayName },
			textChannelId: interaction.channelId
		},
		{ kind: 'first' }
	);
	const queued = result.queued[0];
	await interaction.editReply({
		components: [
			notice(
				`${emoji('success')} **${(queued?.info.title ?? track.title).slice(0, 100)}**을(를) ${result.wasIdle ? '재생해요' : '대기열에 추가했어요'}.`
			)
		],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { parse: [] }
	});
}

/** 빠른 동작 실행 중 오류를 본인에게만 보이는 안내로 바꿔 보낸다. */
export async function replyPanelError(interaction: ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>, error: unknown) {
	const known = error instanceof AppError || error instanceof UserError;
	if (!known) container.logger.error(`[panelIdle] ${error}`);
	const message = known ? error.message : `${emoji('error')} 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.`;
	const payload = { flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] as const, components: [errorView(message)] };
	if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
	else await interaction.reply(payload).catch(() => null);
}
