import { controllerId } from '../customIds.ts';
import { InteractionHandler, InteractionHandlerTypes, container } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { MessageFlags, type ButtonInteraction, type Message } from 'discord.js';
import { queueEmpty, queueList, QUEUE_PAGE_SIZE } from '../views/queue.ts';
import { RepeatMode } from 'lavalink-client';
import { stop } from '../views/stop.ts';
import { getUserQueuedTracks } from '../../lavalink/autoPlayRelated.ts';
import { CustomPlayer } from '../../lavalink/player/customPlayer.ts';
import { buildControllerCardPayload } from '../../lavalink/player/controllerPayload.ts';
import { currentChapterIndex } from '../../lavalink/player/chapters.ts';
import { errorView } from '../../../../lib/errorView.ts';
import { GUARD_MESSAGES, guardPlayerAccess, replyGuardError } from '../utils/interactionGuards.ts';
import { actorFromMember } from '../../application/actor.ts';
import { MUSIC_VOLUME_MAX, MUSIC_VOLUME_MIN } from '@sirubot/utils/playerLimits';

type ControllerButtonId = NonNullable<ReturnType<typeof controllerId.decode>>;

export default class ControllerButtonHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		const decoded = controllerId.decode(interaction.customId);
		return decoded ? this.some(decoded) : this.none();
	}

	private static readonly DJ_COMMANDS = new Set(['pause', 'resume', 'stop', 'prev', 'next', 'repeat', 'chapter', 'volume']);
	private static readonly MUSIC_USE_CASE_COMMANDS = new Set(['pause', 'resume', 'repeat', 'stop', 'volume', 'next', 'prev']);

	public async run(interaction: ButtonInteraction<'cached'>, decoded: ControllerButtonId) {
		const command = decoded.action;
		const existing = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		let player: CustomPlayer;
		if (ControllerButtonHandler.MUSIC_USE_CASE_COMMANDS.has(command)) {
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
				await this.handleRepeat(interaction, player, decoded.mode);
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
			case 'queueView':
				await this.handleQueueView(interaction, player);
				break;
			case 'chapter':
				await this.handleChapter(interaction, player, decoded.direction);
				break;
			case 'volume':
				await this.handleVolume(interaction, player, decoded.direction);
				break;
		}
	}

	private async buildControllerPayload(player: CustomPlayer, message: Message) {
		const { components, attachments, files } = await buildControllerCardPayload(container.lavalink, player, {
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
			if (error.code === 10008 || error.code === 10062 || error.code === 40060) return false;
			throw error;
		}
	}

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

	private async handleRepeat(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, mode: RepeatMode) {
		await interaction.deferUpdate();
		await this.container.music.setRepeat(actorFromMember(interaction.member), mode);
		await this.updateControllerOrFail(interaction, player);
	}

	private async handleChapter(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, direction: 'prev' | 'next') {
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
		if (direction === 'prev') {
			if (index !== null && position - chapters[index]!.start > 5_000) {
				target = chapters[index]!.start;
			} else if (index !== null && index > 0) {
				target = chapters[index - 1]!.start;
			} else if (index === null) {
				target = [...chapters].reverse().find((chapter) => chapter.start < position)?.start ?? chapters[0]!.start;
			}
		} else if (direction === 'next') {
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

	private async handleVolume(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, direction: 'up' | 'down') {
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
		// trackStart가 새 컨트롤러를 보내므로 edit는 생략한다.
		await this.container.music.previous(actorFromMember(interaction.member));
	}

	private async handleNext(interaction: ButtonInteraction<'cached'>) {
		await interaction.deferUpdate();
		// trackStart 또는 mixer가 컨트롤러를 갱신하므로 edit는 생략한다.
		await this.container.music.skipNow(actorFromMember(interaction.member));
	}

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
