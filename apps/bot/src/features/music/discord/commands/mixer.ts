import { isTransitionMode, TRANSITION_LABELS } from '@sirubot/utils/mixerTransition';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError, container } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	type ContainerBuilder,
	MessageFlags,
	type SlashCommandSubcommandGroupBuilder,
	type SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';
import { CustomPlayer } from '../../lavalink/player/customPlayer.ts';
import * as view from '../views/mixer.ts';
import { normalizeAnnounceMode, type TtsAnnounceMode } from '../../../../services/guildSettings/playback.ts';
import * as guildMixer from '../../../../services/guildSettings/mixer.ts';
import * as guildPlayback from '../../../../services/guildSettings/playback.ts';
import { memberPermissionPort } from '../../../../lib/discordPorts.ts';

/** 안내 방식 문구 — 커맨드 응답과 뷰가 같은 말을 써요 */
const ANNOUNCE_MODE_LABELS: Record<TtsAnnounceMode, string> = {
	sequential: '음성 안내를 순서대로 재생해요.',
	parallel: '음성 안내를 겹쳐서 재생해요.',
	interrupt: '새 안내가 오면 대기 중인 안내를 버리고 최신 안내만 재생해요.'
};

/**
 * 믹서 서브커맨드 정의 — `/믹서`와 `/설정 audio`가 같은 옵션을 써야 해서 한 곳에 둬요.
 */
export function withMixerSubcommands(builder: SlashCommandSubcommandsOnlyBuilder | SlashCommandSubcommandGroupBuilder): void {
	builder
		.addSubcommand((sub) =>
			sub
				.setName('status')
				.setNameLocalizations({ ko: '상태' })
				.setDescription('Show mixer settings and state.')
				.setDescriptionLocalizations({ ko: '믹서 설정과 상태를 보여줘요.' })
		)
		.addSubcommand((sub) =>
			sub
				.setName('transition')
				.setNameLocalizations({ ko: '전환' })
				.setDescription('Choose off, crossfade, or AutoMix.')
				.setDescriptionLocalizations({ ko: '곡 전환 방식을 선택해요. 갭리스 설정은 그대로 유지해요.' })
				.addStringOption((opt) =>
					opt
						.setName('mode')
						.setNameLocalizations({ ko: '방식' })
						.setDescription('Track transition style.')
						.setDescriptionLocalizations({ ko: '곡 전환 방식을 선택해 주세요.' })
						.setRequired(true)
						.addChoices(
							{ name: '끄기', value: 'off' },
							{ name: '크로스페이드', value: 'crossfade' },
							{ name: 'AutoMix', value: 'automix' }
						)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('tuning')
				.setNameLocalizations({ ko: '고급설정' })
				.setDescription('Tune AutoMix without changing the transition mode.')
				.setDescriptionLocalizations({ ko: '오토믹스의 박자 분석 기준을 조절해요. 전환 방식은 유지해요.' })
				.addNumberOption((opt) =>
					opt
						.setName('max-tempo-change')
						.setNameLocalizations({ ko: '최대템포변경' })
						.setDescription('Maximum tempo change in percent (0-12) for AutoMix. Omit to keep the current value.')
						.setDescriptionLocalizations({ ko: 'AutoMix 허용 템포 변경 비율(0~12%). 생략하면 기존 값을 유지해요.' })
						.setMinValue(0)
						.setMaxValue(12)
				)
				.addNumberOption((opt) =>
					opt
						.setName('min-confidence')
						.setNameLocalizations({ ko: '최소신뢰도' })
						.setDescription('Minimum beat confidence (0-1) for AutoMix. Omit to keep the current value.')
						.setDescriptionLocalizations({ ko: 'AutoMix 박자 분석 최소 신뢰도(0~1). 생략하면 기존 값을 유지해요.' })
						.setMinValue(0)
						.setMaxValue(1)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('gapless')
				.setNameLocalizations({ ko: '갭리스' })
				.setDescription('Toggle gapless playback.')
				.setDescriptionLocalizations({ ko: '갭리스 재생을 켜거나 꺼요.' })
				.addBooleanOption((opt) =>
					opt
						.setName('enabled')
						.setNameLocalizations({ ko: '켜기' })
						.setDescription('Enable or disable gapless playback.')
						.setDescriptionLocalizations({ ko: '곡 사이의 무음을 없애거나 유지해요.' })
						.setRequired(true)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('crossfade')
				.setNameLocalizations({ ko: '크로스페이드' })
				.setDescription('Set the overlap duration.')
				.setDescriptionLocalizations({ ko: '겹치는 시간만 조절해요. 켜고 끄기는 /믹서 전환에서 선택해요.' })
				.addNumberOption((opt) =>
					opt
						.setName('duration')
						.setNameLocalizations({ ko: '초' })
						.setDescription('Overlap in seconds (0.5-15).')
						.setDescriptionLocalizations({ ko: '곡이 겹치는 시간(0.5~15초). 전환 방식은 바뀌지 않아요.' })
						.setMinValue(0.5)
						.setMaxValue(15)
						.setRequired(true)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('normalization')
				.setNameLocalizations({ ko: '볼륨정규화' })
				.setDescription('Toggle volume normalization.')
				.setDescriptionLocalizations({ ko: '곡 사이 볼륨 차이를 자동으로 맞춰요.' })
				.addBooleanOption((opt) =>
					opt
						.setName('enabled')
						.setNameLocalizations({ ko: '켜기' })
						.setDescription('Enable or disable volume normalization.')
						.setDescriptionLocalizations({ ko: '곡마다 다른 볼륨을 자동으로 맞춰요.' })
						.setRequired(true)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('announce-mode')
				.setNameLocalizations({ ko: '안내방식' })
				.setDescription('How TTS announcements are played.')
				.setDescriptionLocalizations({ ko: '음성 안내를 어떻게 재생할지 정해요.' })
				.addStringOption((opt) =>
					opt
						.setName('mode')
						.setNameLocalizations({ ko: '방식' })
						.setDescription('sequential, parallel, or interrupt.')
						.setDescriptionLocalizations({ ko: '순서대로 / 겹쳐서 / 최신 안내만' })
						.setRequired(true)
						.addChoices(
							{
								name: 'Sequential',
								name_localizations: { ko: '순서대로' },
								value: 'sequential'
							},
							{
								name: 'Parallel',
								name_localizations: { ko: '겹쳐서' },
								value: 'parallel'
							},
							{
								name: 'Interrupt',
								name_localizations: { ko: '최신 안내만' },
								value: 'interrupt'
							}
						)
				)
		);
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'mixer',
	description: 'Configure gapless playback and crossfade.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed']
})
export class MixerCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '믹서' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '갭리스 재생과 크로스페이드를 설정해요.' });
			withMixerSubcommands(builder);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		// 상태 조회(무인자 고급 포함)는 본인만 보면 충분해요. 설정 변경은 서버 구성원이 이유를 알 수 있게 공개로 남겨요.
		const isStatusQuery =
			interaction.options.getSubcommand(true) === 'status' ||
			(interaction.options.getSubcommand(true) === 'tuning' &&
				interaction.options.getNumber('max-tempo-change') === null &&
				interaction.options.getNumber('min-confidence') === null);
		await interaction.deferReply(isStatusQuery ? { flags: [MessageFlags.Ephemeral] } : undefined);

		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;

		const subcommand = interaction.options.getSubcommand(true);
		switch (subcommand) {
			case 'status':
				return this.handleStatus(interaction, player);
			case 'gapless':
				return this.handleGapless(interaction, player);
			case 'crossfade':
				return this.handleCrossfade(interaction, player);
			case 'tuning':
				return this.handleTuning(interaction, player);
			case 'transition':
				return this.handleTransition(interaction, player);
			case 'normalization':
				return this.handleNormalization(interaction, player);
			case 'announce-mode':
				return this.handleAnnounceMode(interaction);
			default:
				throw new UserError({
					identifier: 'mixer_unknown_subcommand',
					message: `${emoji('error')} 알 수 없는 하위 명령어예요.`,
					context: { ephemeral: true }
				});
		}
	}

	/**
	 * `/설정 audio` 같은 다른 커맨드가 같은 핸들러를 쓰도록 위임해요.
	 * 인스턴스는 서브커맨드/플레이어만 쓰므로 커맨드 컨텍스트 없이 만들어도 안전해요.
	 */
	static async runFor(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
		const command = new MixerCommand(container.client as never);
		const player = container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		const subcommand = interaction.options.getSubcommand(true);

		switch (subcommand) {
			case 'status':
				return command.handleStatus(interaction, player);
			case 'gapless':
				return command.handleGapless(interaction, player);
			case 'crossfade':
				return command.handleCrossfade(interaction, player);
			case 'tuning':
				return command.handleTuning(interaction, player);
			case 'transition':
				return command.handleTransition(interaction, player);
			case 'normalization':
				return command.handleNormalization(interaction, player);
			case 'announce-mode':
				return command.handleAnnounceMode(interaction);
			default:
				throw new UserError({
					identifier: 'mixer_unknown_subcommand',
					message: `${emoji('error')} 알 수 없는 하위 명령어예요.`,
					context: { ephemeral: true }
				});
		}
	}

	/** 플레이어가 있을 때 변경을 바로 적용해요. 실패해도 저장은 끝난 상태라 예외 대신 false를 돌려줘요. */
	private async applyToPlayer(player: CustomPlayer | undefined, apply: () => Promise<unknown>): Promise<boolean> {
		if (!player) return true;
		try {
			await apply();
			return true;
		} catch (error) {
			this.container.logger?.warn?.(`[mixer] 플레이어에 설정을 적용하지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}

	private async reply(interaction: ChatInputCommandInteraction<'cached'>, view: ContainerBuilder) {
		await interaction.editReply({
			components: [view],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}

	async handleStatus(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		const settings = await guildMixer.getMixerSettings(this.container.guildService, interaction.guildId);
		const state = player ? await this.container.mixerService.getState(player).catch(() => null) : null;
		await this.reply(interaction, view.mixerStatus({ settings, state, noPlayer: !player }));
	}

	async checkDJ(interaction: ChatInputCommandInteraction<'cached'>) {
		const allowed = await guildPlayback.hasDJRole(this.container.guildService, interaction.guildId, memberPermissionPort(interaction.member));
		if (!allowed) {
			throw new UserError({
				identifier: 'mixer_no_permission',
				message: `${emoji('error')} 믹서 설정을 바꾸려면 DJ 역할이나 관리자 권한이 필요해요.`,
				context: { ephemeral: true }
			});
		}
	}

	async handleGapless(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		await this.checkDJ(interaction);
		const enabled = interaction.options.getBoolean('enabled', true);
		await guildMixer.setGapless(this.container.guildService, interaction.guildId, enabled);
		const title = `갭리스 재생 ${enabled ? '켜짐' : '꺼짐'}`;
		const applied = await this.applyToPlayer(player, async () => {
			await this.container.mixerService.setSilence(player!, enabled);
			if (!enabled) await this.container.mixerService.clearNext(player!, { force: true });
			else await this.container.mixerService.preloadUpcoming(player!, { force: true });
		});
		if (!applied) return this.reply(interaction, view.mixerSavedNotApplied({ title }));
		const hint = !player
			? '다음에 재생할 때부터 적용돼요.'
			: enabled
				? '다음 곡부터 곡 사이 무음 없이 이어져요.'
				: '곡 사이에 기본 간격이 생겨요.';
		return this.reply(interaction, view.mixerUpdated({ title, hint }));
	}

	async handleCrossfade(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		await this.checkDJ(interaction);
		const seconds = interaction.options.getNumber('duration', true);
		const saved = await guildMixer.setCrossfadeDuration(this.container.guildService, interaction.guildId, seconds);
		const title = `크로스페이드 겹침 ${seconds}초`;
		const details = [`곡 전환 방식: **${view.transitionLabel(saved)}**`];
		const applied = await this.applyToPlayer(player, () => this.container.mixerService.setAutomix(player!, saved));
		if (!applied) return this.reply(interaction, view.mixerSavedNotApplied({ title, details }));
		return this.reply(
			interaction,
			view.mixerUpdated({
				title,
				details,
				hint: saved.crossfadeEnabled || saved.automixEnabled ? undefined : '크로스페이드를 쓰려면 `/믹서 전환`에서 방식을 골라 주세요.'
			})
		);
	}

	async handleTuning(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		await this.checkDJ(interaction);
		const current = await guildMixer.getMixerSettings(this.container.guildService, interaction.guildId);
		const tempo = interaction.options.getNumber('max-tempo-change');
		const confidence = interaction.options.getNumber('min-confidence');
		if (tempo === null && confidence === null) return this.handleStatus(interaction, player);
		const saved = await guildMixer.setAutomix(
			this.container.guildService,
			interaction.guildId,
			current.automixEnabled,
			tempo === null ? undefined : tempo / 100,
			confidence ?? undefined
		);
		const title = 'AutoMix 박자 분석 기준 저장';
		const details = [
			`최대 템포 변경 **${(saved.automixMaxTempoChange * 100).toFixed(1)}%**`,
			`최소 신뢰도 **${saved.automixMinConfidence.toFixed(2)}**`
		];
		const applied = await this.applyToPlayer(player, () => this.container.mixerService.setAutomix(player!, saved));
		if (!applied) return this.reply(interaction, view.mixerSavedNotApplied({ title, details }));
		return this.reply(
			interaction,
			view.mixerUpdated({
				title,
				details,
				hint: `곡 전환 방식(${view.transitionLabel(saved)})은 그대로예요.${player ? '' : ' 다음 재생부터 적용돼요.'}`
			})
		);
	}

	async handleTransition(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		await this.checkDJ(interaction);
		const mode = interaction.options.getString('mode', true);
		if (!isTransitionMode(mode)) {
			throw new UserError({
				identifier: 'mixer_transition_invalid',
				message: `${emoji('error')} 올바른 전환 방식을 선택해 주세요.`,
				context: { ephemeral: true }
			});
		}

		const saved = await guildMixer.setTransitionMode(this.container.guildService, interaction.guildId, mode);
		const title = `곡 전환 방식: ${TRANSITION_LABELS[mode]}`;
		const details =
			mode === 'automix'
				? [
						`최대 템포 변경 **${(saved.automixMaxTempoChange * 100).toFixed(1)}%**, 최소 신뢰도 **${saved.automixMinConfidence.toFixed(2)}**로 박자를 맞춰요.`
					]
				: [];
		const applied = await this.applyToPlayer(player, () => this.container.mixerService.setAutomix(player!, saved));
		if (!applied) return this.reply(interaction, view.mixerSavedNotApplied({ title, details }));

		const hints = [
			mode === 'automix' ? '분석이 어렵거나 템포 차이가 크면 일반 크로스페이드로 이어져요.' : '',
			'갭리스 설정은 그대로예요.'
		].filter(Boolean);
		if (!player) hints.push('다음 재생부터 적용돼요.');
		return this.reply(interaction, view.mixerUpdated({ title, details, hint: hints.join(' ') }));
	}

	async handleNormalization(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		await this.checkDJ(interaction);
		const enabled = interaction.options.getBoolean('enabled', true);
		await guildMixer.setNormalization(this.container.guildService, interaction.guildId, enabled);
		const title = `볼륨 정규화 ${enabled ? '켜짐' : '꺼짐'}`;
		const applied = await this.applyToPlayer(player, () => this.container.mixerService.setNormalization(player!, enabled));
		if (!applied) return this.reply(interaction, view.mixerSavedNotApplied({ title }));
		const hint = !player ? '다음에 재생할 때부터 적용돼요.' : enabled ? '첫 곡 기준으로 다음 곡들의 볼륨을 맞춰요.' : undefined;
		return this.reply(interaction, view.mixerUpdated({ title, hint }));
	}

	/** TTS 안내 방식 — sequential(순서) / parallel(겹침) / interrupt(최신만) */
	async handleAnnounceMode(interaction: ChatInputCommandInteraction<'cached'>) {
		await this.checkDJ(interaction);
		const mode = normalizeAnnounceMode(interaction.options.getString('mode', true));
		await guildPlayback.setTtsAnnounceMode(this.container.guildService, interaction.guildId, mode);
		return this.reply(interaction, view.mixerUpdated({ title: '음성 안내 방식', details: [ANNOUNCE_MODE_LABELS[mode]] }));
	}
}
