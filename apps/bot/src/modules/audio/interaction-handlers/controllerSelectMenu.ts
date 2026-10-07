import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { appEmoji } from '@sirubot/utils';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { queueList, queueSelectCustomId } from '../view/queue.ts';
import { getUserQueuedTracks } from '../lavalink/autoPlayRelated.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { errorView } from '../view/error.ts';
import { checkDJOrAlone } from '../utils/permissionCheck.ts';

const QUEUE_PAGE_SIZE = 10;

export default class ControllerSelectMenuHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.SelectMenu
		});
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (interaction.customId === queueSelectCustomId) {
			return this.some({ selectedValue: interaction.values[0] });
		}
		return this.none();
	}

	public async run(interaction: StringSelectMenuInteraction<'cached'>, { selectedValue }: { selectedValue: string }) {
		// 음성 채널 참여 체크
		const memberVoice = interaction.member.voice.channel;
		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;

		if (!memberVoice || (player && memberVoice.id !== player.voiceChannelId)) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${appEmoji('volume_muted', '🔇')} 봇과 같은 음성 채널에 있어야 사용할 수 있어요.`)]
			});
			return;
		}

		// DJ/Alone 권한 체크
		if (!(await checkDJOrAlone(interaction.guildId, interaction.member))) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${appEmoji('volume_muted', '🔇')} 이 버튼은 DJ 역할이 있거나 채널에 혼자 있을 때만 사용 가능해요.`)]
			});
			return;
		}

		if (!player) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${appEmoji('error', '❌')} 현재 재생 중인 플레이어가 없어요.`)]
			});
			return;
		}

		const trackIndex = parseInt(selectedValue, 10) - 1;
		if (isNaN(trackIndex) || trackIndex < 0 || trackIndex >= getUserQueuedTracks(player).length) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${appEmoji('error', '❌')} 해당 번호의 곡이 대기열에 없어요.`)]
			});
			return;
		}

		player.queueSelectedIndex = trackIndex;

		// 셀렉트 메뉴가 있는 대기열 목록(ephemeral) 메시지를 선택 상태로 다시 렌더한다.
		// 선택된 곡이 속한 페이지로 queuePage도 맞춰 둔다 (점프/삭제 버튼의 기본 인덱스 동기화).
		const tracks = getUserQueuedTracks(player);
		const totalPages = Math.max(1, Math.ceil(tracks.length / QUEUE_PAGE_SIZE));
		const page = Math.min(Math.floor(trackIndex / QUEUE_PAGE_SIZE) + 1, totalPages);
		player.queuePage = page;

		await interaction.update({
			components: [queueList({ player, page, totalPages, authorId: interaction.user.id, selectedIndex: trackIndex })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
