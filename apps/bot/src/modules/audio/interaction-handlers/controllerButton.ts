import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { controllerView } from '../view/controller.ts';
import { RepeatMode } from 'lavalink-client';
import { stop } from '../view/stop.ts';
import { chunkArray } from '@sirubot/utils';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { checkDJOrAlone } from '../utils/permissionCheck.ts';
import { errorView } from '../view/error.ts';

export default class ControllerButtonHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (interaction.customId.startsWith('controller:')) {
			const parts = interaction.customId.replace('controller:', '').split(':');
			return this.some({
				command: parts[0],
				subcommand: parts[1] ?? null
			});
		}
		return this.none();
	}

	private static readonly DJ_COMMANDS = new Set(['pause', 'resume', 'stop', 'prev', 'next', 'repeat']);
	private static readonly DJ_QUEUE_SUBS = new Set(['remove', 'jumpTo']);

	public async run(interaction: ButtonInteraction<'cached'>, { command, subcommand }: { command: string; subcommand: string | null }) {
		// 음성 채널 참여 체크
		const memberVoice = interaction.member.voice.channel;
		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;

		if (!memberVoice || (player && memberVoice.id !== player.voiceChannelId)) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('🔇 봇과 같은 음성 채널에 있어야 사용할 수 있어요.')]
			});
			return;
		}

		// DJ/Alone 권한 체크 (재생 제어 버튼만)
		const needsDJ =
			ControllerButtonHandler.DJ_COMMANDS.has(command) || (command === 'queue' && ControllerButtonHandler.DJ_QUEUE_SUBS.has(subcommand ?? ''));

		if (needsDJ) {
			const allowed = await checkDJOrAlone(interaction.guildId, interaction.member);
			if (!allowed) {
				await interaction.reply({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView('🔇 이 버튼은 DJ 역할이 있거나 채널에 혼자 있을 때만 사용 가능해요.')]
				});
				return;
			}
		}

		if (!player) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 현재 재생 중인 플레이어가 없어요.')]
			});
			return;
		}

		switch (command) {
			case 'pause':
				await this.handlePause(interaction, player);
				break;
			case 'resume':
				await this.handleResume(interaction, player);
				break;
			case 'repeat':
				await this.handleRepeat(interaction, player, subcommand);
				break;
			case 'stop':
				await this.handleStop(interaction, player);
				break;
			case 'prev':
				await this.handlePrev(interaction, player);
				break;
			case 'next':
				await this.handleNext(interaction, player);
				break;
			case 'queue':
				await this.handleQueue(interaction, player, subcommand);
				break;
			default:
				this.container.logger.warn(`Unknown controller command: ${command}:${subcommand ?? ''}`);
				await interaction.reply({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView(`🛠️ 알 수 없는 버튼 명령어입니다. (${command})`)]
				});
				break;
		}
	}

	private buildControllerPayload(player: CustomPlayer) {
		return {
			components: [controllerView({ player, volume: player.volume, page: player.queuePage })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		} as const;
	}

	private async handlePause(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		await player.pause();
		await interaction.update(this.buildControllerPayload(player));
	}

	private async handleResume(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		await player.resume();
		await interaction.update(this.buildControllerPayload(player));
	}

	private async handleRepeat(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, mode: string | null) {
		const toSet: RepeatMode = mode === 'track' ? 'track' : mode === 'queue' ? 'queue' : 'off';
		await player.setRepeatMode(toSet);
		await interaction.update(this.buildControllerPayload(player));
	}

	private async handleStop(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		await player.stopPlaying();
		await player.disconnect();
		await interaction.reply({
			components: [stop()],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handlePrev(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		if (player.queue.previous.length === 0) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 이전에 재생한 곡이 없어요.')]
			});
			return;
		}

		const previousTrack = player.queue.previous[player.queue.previous.length - 1];
		if (player.queue.current) {
			player.queue.tracks.unshift(player.queue.current);
		}
		await player.play({ clientTrack: previousTrack });
		player.queue.previous.pop();

		player.queuePage = 1;
		await interaction.update(this.buildControllerPayload(player));
	}

	private async handleNext(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		if (player.queue.tracks.length === 0) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 대기열에 곡이 없어요.')]
			});
			return;
		}

		await player.skip();
		player.queuePage = 1;
		await interaction.update(this.buildControllerPayload(player));
	}

	private async handleQueue(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, subcommand: string | null) {
		switch (subcommand) {
			case 'prev':
				await this.handleQueuePrev(interaction, player);
				break;
			case 'next':
				await this.handleQueueNext(interaction, player);
				break;
			case 'remove':
				await this.handleQueueRemove(interaction, player);
				break;
			case 'jumpTo':
				await this.handleQueueJumpTo(interaction, player);
				break;
			default:
				await interaction.reply({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView('❌ 알 수 없는 큐 명령어입니다.')]
				});
				break;
		}
	}

	private async handleQueuePrev(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		const currentPage = player.queuePage;
		if (currentPage <= 1) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 이미 첫 번째 페이지에요.')]
			});
			return;
		}
		player.queuePage = currentPage - 1;
		await interaction.update(this.buildControllerPayload(player));
	}

	private async handleQueueNext(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		const totalPages = Math.ceil(player.queue.tracks.length / 5);
		const currentPage = player.queuePage;
		if (currentPage >= totalPages) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 이미 마지막 페이지에요.')]
			});
			return;
		}
		player.queuePage = currentPage + 1;
		await interaction.update(this.buildControllerPayload(player));
	}

	private async handleQueueRemove(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		// Remove is based on the currently selected track in the select menu
		// The select menu state isn't accessible from a button click, so use first item on current page
		const currentPage = player.queuePage;
		const QUEUE_PAGE_CHUNK_SIZE = 5;
		const queueChunks = chunkArray(player.queue.tracks, QUEUE_PAGE_CHUNK_SIZE);
		const pageIndex = Math.min(currentPage - 1, queueChunks.length - 1);

		if (pageIndex < 0 || player.queue.tracks.length === 0) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 제거할 곡이 없어요.')]
			});
			return;
		}

		// Remove the first track on the current page
		const trackIndex = pageIndex * QUEUE_PAGE_CHUNK_SIZE;
		const removed = player.queue.splice(trackIndex, 1);
		if (removed.length > 0) {
			// Adjust page if needed
			const newTotalPages = Math.ceil(player.queue.tracks.length / QUEUE_PAGE_CHUNK_SIZE);
			if (currentPage > newTotalPages && newTotalPages > 0) {
				player.queuePage = newTotalPages;
			}
		}

		await interaction.update(this.buildControllerPayload(player));
	}

	private async handleQueueJumpTo(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		// Jump to the first track on the current page
		const currentPage = player.queuePage;
		const QUEUE_PAGE_CHUNK_SIZE = 5;
		const trackIndex = (currentPage - 1) * QUEUE_PAGE_CHUNK_SIZE;

		if (trackIndex >= player.queue.tracks.length) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 이동할 곡이 없어요.')]
			});
			return;
		}

		// Skip to the specified position (remove tracks before it and play it)
		await player.skip(trackIndex + 1);
		player.queuePage = 1;
		await interaction.update(this.buildControllerPayload(player));
	}
}
