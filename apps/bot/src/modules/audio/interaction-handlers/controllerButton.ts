import { QUEUE_VIEW_MESSAGES } from '../utils/queueViewId.ts';
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
import { errorView } from '../../../lib/errorView.ts';
import { GUARD_MESSAGES, guardPlayerAccess, replyGuardError } from '../utils/interactionGuards.ts';
import { actorFromMember } from '../../../features/music/application/actor.ts';
import { MUSIC_VOLUME_MAX, MUSIC_VOLUME_MIN } from '@sirubot/utils/playerLimits';

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
	/** 인가를 `container.music` 유스케이스가 맡는 명령 — 어댑터는 `guardPlayerAccess`를 거치지 않아요. */
	private static readonly MUSIC_USE_CASE_COMMANDS = new Set(['pause', 'resume', 'repeat', 'stop', 'volume', 'next', 'prev']);

	public async run(interaction: ButtonInteraction<'cached'>, { command, subcommand }: { command: string; subcommand: string | null }) {
		const existing = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		let player: CustomPlayer;
		if (ControllerButtonHandler.MUSIC_USE_CASE_COMMANDS.has(command)) {
			// 음성 채널·DJ 인가는 유스케이스가 검사해요. 여기서는 컨트롤러 갱신에 쓸 플레이어만 확인해요.
			if (!existing) {
				await replyGuardError(interaction, GUARD_MESSAGES.noPlayer);
				return;
			}
			player = existing;
		} else {
			const needsDJ = ControllerButtonHandler.DJ_COMMANDS.has(command);
			const guarded = await guardPlayerAccess(interaction, existing, needsDJ ? GUARD_MESSAGES.djOnlyControl : undefined);
			if (!guarded) return;
			player = guarded;
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
				await this.handleStop(interaction);
				break;
			case 'prev':
				await this.handlePrev(interaction);
				break;
			case 'next':
				await this.handleNext(interaction);
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
					components: [errorView(`${emoji('error')} 알 수 없는 버튼 명령어예요. (${command})`)]
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
		await this.container.music.pause(actorFromMember(interaction.member));
		await this.updateControllerOrFail(interaction, player);
	}

	private async handleResume(interaction: ButtonInteraction<'cached'>, player: CustomPlayer) {
		await interaction.deferUpdate();
		await this.container.music.resume(actorFromMember(interaction.member));
		await this.updateControllerOrFail(interaction, player);
	}

	private async handleRepeat(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, mode: string | null) {
		await interaction.deferUpdate();
		const toSet: RepeatMode = mode === 'track' ? 'track' : mode === 'queue' ? 'queue' : 'off';
		await this.container.music.setRepeat(actorFromMember(interaction.member), toSet);
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
				components: [errorView(`${emoji('info')} 이 곡에는 챕터가 없어요.`)]
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
				components: [errorView(`${emoji('info')} 건너뛸 챕터가 더 없어요.`)]
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
		const next = Math.max(MUSIC_VOLUME_MIN, Math.min(MUSIC_VOLUME_MAX, current + (direction === 'up' ? VOLUME_STEP : -VOLUME_STEP)));
		if (next === current) {
			await interaction
				.reply({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView(`${emoji('error')} 볼륨은 **${MUSIC_VOLUME_MIN}**부터 **${MUSIC_VOLUME_MAX}**까지 설정할 수 있어요.`)]
				})
				.catch(() => null);
			return;
		}

		await interaction.deferUpdate();
		await this.container.music.setVolume(actorFromMember(interaction.member), next);
		await this.updateControllerOrFail(interaction, player);
	}

	private async handleStop(interaction: ButtonInteraction<'cached'>) {
		await interaction.deferUpdate();
		// 인가·컨트롤러 삭제·정지는 유스케이스가 맡아요. 여기서는 눌린 메시지를 정지 화면으로 바꿔요.
		await this.container.music.stop(actorFromMember(interaction.member));
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
	}

	private async handlePrev(interaction: ButtonInteraction<'cached'>) {
		await interaction.deferUpdate();
		// 인가·재생 기록 확인과 이전곡 재생은 유스케이스가 맡아요. 곧 trackStart가 새 컨트롤러를 보내므로 edit는 생략해요 (edit→삭제 churn 방지).
		await this.container.music.previous(actorFromMember(interaction.member));
	}

	private async handleNext(interaction: ButtonInteraction<'cached'>) {
		await interaction.deferUpdate();
		// 인가·현재 곡 확인과 건너뛰기는 유스케이스가 맡아요. 다음 곡이 있으면 곧 trackStart가 새 컨트롤러를 보내고, 없으면 mixer가 컨트롤러를 갱신하므로 edit는 생략해요.
		await this.container.music.skipNow(actorFromMember(interaction.member));
	}

	private async handleQueue(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, subcommand: string | null) {
		switch (subcommand) {
			case 'view':
				await this.handleQueueView(interaction, player);
				break;
			default:
				// 개편 전 대기열 목록의 prev/next/remove/jumpTo 버튼 — 새로 열도록 안내한다.
				await interaction.reply({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView(QUEUE_VIEW_MESSAGES.expired)]
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
}
