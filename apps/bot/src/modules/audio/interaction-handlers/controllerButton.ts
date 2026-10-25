import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { MessageFlags, type ButtonInteraction, type Message } from 'discord.js';
import { queueEmpty, queueList, QUEUE_PAGE_SIZE } from '../view/queue.ts';
import { RepeatMode } from 'lavalink-client';
import { stop } from '../view/stop.ts';
import { getUserQueuedTracks } from '../lavalink/autoPlayRelated.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { buildControllerCardPayload } from '../lavalink/player/controllerPayload.ts';
import { currentChapterIndex } from '../lavalink/player/chapters.ts';
import { checkDJOrAlone } from '../utils/permissionCheck.ts';
import { errorView } from '../../../lib/errorView.ts';

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

	private static readonly DJ_COMMANDS = new Set(['pause', 'resume', 'stop', 'prev', 'next', 'repeat', 'chapter', 'volume']);
	private static readonly DJ_QUEUE_SUBS = new Set(['remove', 'jumpTo']);

	public async run(interaction: ButtonInteraction<'cached'>, { command, subcommand }: { command: string; subcommand: string | null }) {
		// 음성 채널 참여 체크
		const memberVoice = interaction.member.voice.channel;
		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;

		if (!memberVoice || (player && memberVoice.id !== player.voiceChannelId)) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('volume_muted')} 봇과 같은 음성 채널에 있어야 사용할 수 있어요.`)]
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
					components: [errorView(`${emoji('volume_muted')} 이 버튼은 DJ 역할이 있거나 채널에 혼자 있을 때만 사용 가능해요.`)]
				});
				return;
			}
		}

		if (!player) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 현재 재생 중인 플레이어가 없어요.`)]
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
			case 'chapter':
				await this.handleChapter(interaction, player, subcommand);
				break;
			case 'volume':
				await this.handleVolume(interaction, player, subcommand);
				break;
			default:
				this.container.logger.warn(`Unknown controller command: ${command}:${subcommand ?? ''}`);
				await interaction.reply({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView(`${emoji('tools')} 알 수 없는 버튼 명령어예요. (${command})`)]
				});
				break;
		}
	}

	private async buildControllerPayload(player: CustomPlayer, message: Message) {
		const { components, attachments, files } = await buildControllerCardPayload(player, {
			volume: player.volume,
			textChannelId: message.channelId,
			message
		});
		return {
			components: [components],
			attachments,
			files,
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		} as const;
	}

	private async safeUpdate(interaction: ButtonInteraction<'cached'>, player: CustomPlayer): Promise<boolean> {
		try {
			// 채널 설정 조회가 끝나기 전에 interaction을 ACK해 Discord의 3초 제한을 피한다.
			if (!interaction.deferred) await interaction.deferUpdate();
			const payload = await this.buildControllerPayload(player, interaction.message);
			const updated = await interaction.message.edit(payload);
			if (player.messageId === interaction.message.id) {
				player.controller = updated;
			}
			return true;
		} catch (error: any) {
			// 컨트롤러가 삭제됐거나 interaction이 만료된 경우: 호출부에서 안내한다.
			if (error.code === 10008 || error.code === 10062 || error.code === 40060) return false;
			throw error;
		}
	}

	/** 컨트롤러 갱신 — safeUpdate가 실패하면(만료) ephemeral 안내로 대체한다. 각 핸들러가 공유한다. */
	private async updateControllerOrFail(interaction: ButtonInteraction<'cached'>, player: CustomPlayer): Promise<void> {
		if (!(await this.safeUpdate(interaction, player))) {
			await interaction
				.followUp({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView(`${emoji('error')} 컨트롤러가 만료되었어요. \`/현재곡\`으로 새로 불러와주세요.`)]
				})
				.catch(() => null);
		}
	}

	private async handlePause(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		await interaction.deferUpdate();
		await player.pause();
		await this.updateControllerOrFail(interaction, player);
	}

	private async handleResume(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		await interaction.deferUpdate();
		await player.resume();
		await this.updateControllerOrFail(interaction, player);
	}

	private async handleRepeat(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, mode: string | null) {
		await interaction.deferUpdate();
		const toSet: RepeatMode = mode === 'track' ? 'track' : mode === 'queue' ? 'queue' : 'off';
		const repeatUpdated = await this.container.guildService.setRepeat(interaction.guildId, toSet);
		await player.setRepeatMode(repeatUpdated);
		if (repeatUpdated !== 'off') await this.container.mixerService.clearNext(player).catch(() => null);
		await this.updateControllerOrFail(interaction, player);
	}

	/**
	 * 챕터 건너뛰기 — 현재 위치 기준으로 이전·다음 챕터 시작으로 seek해요.
	 * '이전'은 현재 챕터를 5초 이상 들었으면 그 챕터 처음으로 되돌려요 (Discord 건너뛰기 관습).
	 */
	private async handleChapter(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, subcommand: string | null) {
		const chapters = player.chapters ?? [];
		const index = currentChapterIndex(player);
		if (chapters.length === 0) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('cd')} 이 곡에는 챕터가 없어요.`)]
			});
			return;
		}

		const position = player.position ?? 0;
		let target: number | null = null;
		if (subcommand === 'prev') {
			if (index !== null && position - chapters[index]!.start > 5_000) {
				target = chapters[index]!.start;
			} else if (index !== null && index > 0) {
				target = chapters[index - 1]!.start;
			} else if (index === null) {
				// 챕터 경계 밖(보간 지연 등) — 위치보다 앞선 마지막 챕터로 되돌려요.
				target = [...chapters].reverse().find((chapter) => chapter.start < position)?.start ?? chapters[0]!.start;
			}
		} else if (subcommand === 'next') {
			// 현재 챕터 다음 또는 경계 밖이면 위치보다 뒤인 첫 챕터로 건너뛰어요.
			target = chapters.find((chapter) => chapter.start > position)?.start ?? null;
		}

		if (target === null) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('cd')} 건너뛸 챕터가 더 없어요.`)]
			});
			return;
		}

		await interaction.deferUpdate();
		await player.seek(target);
		await this.updateControllerOrFail(interaction, player);
	}

	private async handleVolume(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, direction: string | null) {
		const VOLUME_STEP = 10;
		const current = player.volume ?? 0;
		const next = Math.max(0, Math.min(150, current + (direction === 'up' ? VOLUME_STEP : -VOLUME_STEP)));
		if (next === current) {
			await interaction
				.reply({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView(`${emoji('volume_muted')} 볼륨은 **0**부터 **150**까지 설정할 수 있어요.`)]
				})
				.catch(() => null);
			return;
		}

		await interaction.deferUpdate();
		const { volume: updated } = await this.container.guildService.updateVolume(interaction.guildId, next);
		player.setVolume(updated);
		await this.updateControllerOrFail(interaction, player);
	}

	private async handleStop(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		await interaction.deferUpdate();
		await this.container.playerNotifier.deleteController(player).catch(() => null);
		try {
			await interaction.message.edit({
				components: [stop()],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch {
			await interaction
				.followUp({
					components: [stop()],
					flags: [MessageFlags.IsComponentsV2]
				})
				.catch(() => null);
		}
		await this.container.audioService.stopPlayback(player);
	}

	private async handlePrev(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		if (player.queue.previous.length === 0) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 이전에 재생한 곡이 없어요.`)]
			});
			return;
		}

		await interaction.deferUpdate();
		await this.container.audioService.playPrevious(player);

		player.queuePage = 1;
		// 곧 trackStart가 새 컨트롤러를 보내므로 edit는 생략 (edit→삭제 churn 방지)
	}

	private async handleNext(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		if (player.queue.tracks.length === 0) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 대기열에 곡이 없어요.`)]
			});
			return;
		}

		await interaction.deferUpdate();
		player.queuePage = 1;
		await this.container.mixerService.skip(player);
	}

	private async handleQueue(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, subcommand: string | null) {
		switch (subcommand) {
			case 'view':
				await this.handleQueueView(interaction, player);
				break;
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
					components: [errorView(`${emoji('error')} 알 수 없는 큐 명령어예요.`)]
				});
				break;
		}
	}

	/** 컨트롤러의 '대기열 보기' 버튼 — 새 메시지로 queueList(10곡/쪽)를 연다. 컨트롤러는 유지한다. */
	private async handleQueueView(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		const tracks = getUserQueuedTracks(player);
		if (tracks.length === 0) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [queueEmpty()]
			});
			return;
		}

		const totalPages = Math.ceil(tracks.length / QUEUE_PAGE_SIZE);
		await interaction.reply({
			components: [queueList({ player, page: 1, totalPages, authorId: interaction.user.id })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleQueuePrev(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		const currentPage = player.queuePage;
		if (currentPage <= 1) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 이미 첫 번째 페이지에요.`)]
			});
			return;
		}
		player.queuePage = currentPage - 1;
		player.queueSelectedIndex = null;
		await this.safeUpdate(interaction, player);
	}

	private async handleQueueNext(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		const totalPages = Math.ceil(getUserQueuedTracks(player).length / QUEUE_PAGE_SIZE);
		const currentPage = player.queuePage;
		if (currentPage >= totalPages) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 이미 마지막 페이지에요.`)]
			});
			return;
		}
		player.queuePage = currentPage + 1;
		player.queueSelectedIndex = null;
		await this.safeUpdate(interaction, player);
	}

	private async handleQueueRemove(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		const currentPage = player.queuePage;
		const defaultTrackIndex = (currentPage - 1) * QUEUE_PAGE_SIZE;
		const trackIndex = player.queueSelectedIndex ?? defaultTrackIndex;

		if (trackIndex < 0 || trackIndex >= getUserQueuedTracks(player).length) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 제거할 곡이 없어요.`)]
			});
			return;
		}

		await interaction.deferUpdate();
		await player.queue.splice(trackIndex, 1);
		void this.container.mixerService.preloadUpcoming(player).catch(() => null);
		player.queueSelectedIndex = null;

		const remaining = getUserQueuedTracks(player);
		const newTotalPages = Math.max(1, Math.ceil(remaining.length / QUEUE_PAGE_SIZE));
		if (currentPage > newTotalPages) {
			player.queuePage = newTotalPages;
		}

		// 대기열 목록(ephemeral) 메시지를 갱신한다 (컨트롤러가 아님).
		await interaction
			.editReply({
				components: [
					remaining.length === 0
						? queueEmpty()
						: queueList({ player, page: player.queuePage, totalPages: newTotalPages, authorId: interaction.user.id })
				],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { roles: [], users: [] }
			})
			.catch(() => null);
	}

	private async handleQueueJumpTo(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		const currentPage = player.queuePage;
		const defaultTrackIndex = (currentPage - 1) * QUEUE_PAGE_SIZE;
		const trackIndex = player.queueSelectedIndex ?? defaultTrackIndex;

		if (trackIndex < 0 || trackIndex >= getUserQueuedTracks(player).length) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 이동할 곡이 없어요.`)]
			});
			return;
		}

		// 새 곡의 trackStart가 컨트롤러를 새로 보내므로 컨트롤러 edit는 생략하고,
		// 대기열 목록(ephemeral) 메시지만 새로고침한다.
		await interaction.deferUpdate();
		player.queuePage = 1;
		player.queueSelectedIndex = null;
		await this.container.mixerService.skip(player, trackIndex + 1);

		const remaining = getUserQueuedTracks(player);
		const totalPages = Math.max(1, Math.ceil(remaining.length / QUEUE_PAGE_SIZE));
		await interaction
			.editReply({
				components: [remaining.length === 0 ? queueEmpty() : queueList({ player, page: 1, totalPages, authorId: interaction.user.id })],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { roles: [], users: [] }
			})
			.catch(() => null);
	}
}
