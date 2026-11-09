import { notice } from '../view/notice.ts';
import { channelToggleView, settingResultView, settingWarningView } from '../view/settingResult.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { collectOtherTextChannelIds } from '../utils/channels.ts';
import { buildTtsPanel } from '../view/ttsView.ts';
import { TtsError } from '../../../services/ttsService.ts';
import { TTS_PRONUNCIATION_MAX_ENTRIES, TTS_PRONUNCIATION_READING_MAX, TTS_PRONUNCIATION_TERM_MAX } from '../../../services/ttsPronunciation.ts';
import * as guildChatPolicy from '../../../services/guildSettings/chatPolicy.ts';

/** `/tts 말하기` 문장 상한 — 채팅 낭독 클립 상한과 같은 값으로 맞춰요 */
const MAX_SAY_LENGTH = 200;

/**
 * /tts — 채널 낭독 on/off + 입장 알림 + 사용자 TTS 설정 패널 + 즉석 발화.
 * - 켜기/끄기: 현재 채널의 낭독 정책(길드 ttsMode)을 바꿔요. 채널 전체에 영향을 주므로
 *   서버 관리 권한이 필요해요. 켜기는 실행한 본인의 낭독 opt-in도 함께 켜요.
 * - 설정: 낭독 on/off·음성·위치(왼쪽/가운데/오른쪽) 패널(Components V2 ephemeral). 자기 자신 설정이라
 *   권한이 필요 없어요.
 * - 말하기: 재생 중인 곡 위에(없으면 단독으로) 입력한 문장을 읽어요. /음악 음성 서브커맨드를
 *   TTS 도메인으로 옮긴 것이고, 채팅 낭독과 같은 siru_tts·사용자 프리셋을 씁니다.
 */
@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'tts',
	description: 'Toggle channel reading and manage your TTS settings.',
	fullCategory: ['일반']
})
export class TtsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: 'tts' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '채널 낭독 on/off와 내 TTS 설정을 관리해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('on')
						.setNameLocalizations({ ko: '켜기' })
						.setDescription('Enable TTS reading for this channel.')
						.setDescriptionLocalizations({ ko: '현재 채널에서 보낸 메시지를 읽어드려요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('off')
						.setNameLocalizations({ ko: '끄기' })
						.setDescription('Disable TTS reading for this channel.')
						.setDescriptionLocalizations({ ko: '현재 채널의 채팅 낭독을 꺼요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('say')
						.setNameLocalizations({ ko: '말하기' })
						.setDescription('Speak a sentence in the voice channel.')
						.setDescriptionLocalizations({ ko: '음성 채널에 문장을 읽어줘요. 음악이 재생 중이면 곡 위에 겹쳐요.' })
						.addStringOption((option) =>
							option
								.setName('text')
								.setNameLocalizations({ ko: '내용' })
								.setDescription('Text to speak (up to 200 characters).')
								.setDescriptionLocalizations({ ko: '음성으로 읽을 문장이에요. (200자 이내)' })
								.setMinLength(1)
								.setMaxLength(MAX_SAY_LENGTH)
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('join')
						.setNameLocalizations({ ko: '입장알림' })
						.setDescription('Announce members who join the bot voice channel.')
						.setDescriptionLocalizations({ ko: '음성 채널에 누군가 입장하면 이름을 읽어줘요.' })
						.addBooleanOption((option) =>
							option
								.setName('enabled')
								.setNameLocalizations({ ko: '사용' })
								.setDescription('Turn join announcements on or off.')
								.setDescriptionLocalizations({ ko: '입장 알림을 켤지 꺼요.' })
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('leave')
						.setNameLocalizations({ ko: '퇴장알림' })
						.setDescription('Announce members who leave the bot voice channel.')
						.setDescriptionLocalizations({ ko: '음성 채널에서 누군가 나가면 이름을 읽어줘요.' })
						.addBooleanOption((option) =>
							option
								.setName('enabled')
								.setNameLocalizations({ ko: '사용' })
								.setDescription('Turn leave announcements on or off.')
								.setDescriptionLocalizations({ ko: '퇴장 알림을 켤지 꺼요.' })
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('pronounce-add')
						.setNameLocalizations({ ko: '발음추가' })
						.setDescription('Teach the bot how to read a word in this server.')
						.setDescriptionLocalizations({ ko: '서버에서 특정 단어를 어떻게 읽을지 알려줘요.' })
						.addStringOption((option) =>
							option
								.setName('word')
								.setNameLocalizations({ ko: '단어' })
								.setDescription('Word as written in chat.')
								.setDescriptionLocalizations({ ko: '채팅에 나오는 표기예요.' })
								.setMinLength(1)
								.setMaxLength(TTS_PRONUNCIATION_TERM_MAX)
								.setRequired(true)
						)
						.addStringOption((option) =>
							option
								.setName('reading')
								.setNameLocalizations({ ko: '읽기' })
								.setDescription('How it should sound.')
								.setDescriptionLocalizations({ ko: '실제로 읽을 소리예요.' })
								.setMinLength(1)
								.setMaxLength(TTS_PRONUNCIATION_READING_MAX)
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('pronounce-remove')
						.setNameLocalizations({ ko: '발음삭제' })
						.setDescription('Remove a pronunciation entry.')
						.setDescriptionLocalizations({ ko: '등록한 발음을 지워요.' })
						.addStringOption((option) =>
							option
								.setName('word')
								.setNameLocalizations({ ko: '단어' })
								.setDescription('Registered word to remove.')
								.setDescriptionLocalizations({ ko: '지울 단어예요.' })
								.setMinLength(1)
								.setMaxLength(TTS_PRONUNCIATION_TERM_MAX)
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('pronounce-list')
						.setNameLocalizations({ ko: '발음목록' })
						.setDescription('List the pronunciation entries of this server.')
						.setDescriptionLocalizations({ ko: '이 서버에 등록된 발음을 보여줘요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('settings')
						.setNameLocalizations({ ko: '설정' })
						.setDescription('Open your personal TTS settings panel.')
						.setDescriptionLocalizations({ ko: '내 낭독 on/off·음성·위치 패널을 열어요.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'tts_no_guild',
				message: `${emoji('error')} 서버 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		const subcommand = interaction.options.getSubcommand(true);
		// 켜기/끄기는 채널 전체에 영향을 주는 길드 정책이라 서버 관리 권한이 필요해요.
		// 설정 패널과 즉석 발화는 자기 행동이라 누구나 쓸 수 있어요.
		if (subcommand !== 'settings' && subcommand !== 'say' && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
			throw new UserError({
				identifier: 'tts_channel_permission',
				message: `${emoji('error')} 채널 낭독 on/off는 서버 관리 권한이 필요해요. 개인 설정은 \`/tts 설정\`을 사용해 주세요.`,
				context: { ephemeral: true }
			});
		}
		if (subcommand === 'on' && !this.container.ttsService.isEnabled()) {
			throw new UserError({
				identifier: 'tts_service_disabled',
				message: `${emoji('error')} TTS 서버가 연결되어 있지 않아서 낭독을 켤 수 없어요. 잠시 후 다시 시도해 주세요.`,
				context: { ephemeral: true }
			});
		}

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		if (subcommand === 'say') {
			await this.speak(interaction);
			return;
		}

		if (subcommand === 'join' || subcommand === 'leave') {
			const enabled = interaction.options.getBoolean('enabled', true);
			const label = subcommand === 'join' ? '입장' : '퇴장';
			if (enabled && !this.container.ttsService.isEnabled()) {
				throw new UserError({
					identifier: 'tts_service_disabled',
					message: `${emoji('error')} TTS 서버가 연결되어 있지 않아서 ${label} 알림을 켤 수 없어요.`,
					context: { ephemeral: true }
				});
			}
			if (subcommand === 'join') await guildChatPolicy.setTtsJoinAnnounce(this.container.guildService, interaction.guildId, enabled);
			else await guildChatPolicy.setTtsLeaveAnnounce(this.container.guildService, interaction.guildId, enabled);
			await interaction.editReply({
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { parse: [] },
				components: [
					settingResultView({
						icon: 'speech',
						title: `음성 채널 ${label} 알림 ${enabled ? '켜짐' : '꺼짐'}`,
						details: enabled ? [`봇이 있는 음성 채널에서 누군가 ${subcommand === 'join' ? '들어오면' : '나가면'} 이름을 읽어드려요.`] : []
					})
				]
			});
			return;
		}

		if (subcommand === 'pronounce-add' || subcommand === 'pronounce-remove' || subcommand === 'pronounce-list') {
			await this.pronunciation(interaction, subcommand);
			return;
		}

		if (subcommand === 'settings') {
			await interaction.editReply({
				components: [await buildTtsPanel(this.container, interaction.guildId, interaction.user.id, interaction.channelId)],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { parse: [] }
			});
			return;
		}

		// 끄기로 all → channels를 만들 때 남길 목록을 위해 서버의 나머지 텍스트 채널을 모아요.
		const otherTextChannelIds = collectOtherTextChannelIds(interaction.guild, interaction.channelId);
		const enabled = subcommand === 'on';
		const result = await guildChatPolicy.setChannelTtsEnabled(
			this.container.guildService,
			interaction.guildId,
			interaction.channelId,
			enabled,
			otherTextChannelIds
		);

		if (!enabled) {
			await interaction.editReply({
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { parse: [] },
				components: [
					channelToggleView({
						icon: 'speech',
						label: '채팅 낭독',
						enabled: false,
						channelId: interaction.channelId,
						mode: result.mode,
						channelCount: result.channelIds.length
					})
				]
			});
			return;
		}

		// 낭독은 채널 정책과 사용자 opt-in이 둘 다 켜져야 해요 — 켜기를 실행한 본인의
		// opt-in도 함께 켜서 "켰는데 왜 안 읽어요?"가 생기지 않게 해요.
		const saved = await this.container.ttsUserSettings.set(interaction.guildId, interaction.user.id, { enabled: true });
		const components = saved
			? [
					channelToggleView({
						icon: 'speech',
						label: '채팅 낭독',
						enabled: true,
						channelId: interaction.channelId,
						mode: result.mode,
						channelCount: result.channelIds.length,
						hint: '다른 분들의 메시지도 읽으려면 각자 `/tts 설정`에서 낭독을 켜 주세요.'
					})
				]
			: [
					settingWarningView('채팅 낭독은 켰지만 내 설정을 저장하지 못했어요', [
						`<#${interaction.channelId}> 채널의 낭독은 켜졌어요.`,
						'`/tts 설정`에서 내 낭독을 직접 켜 주세요.'
					])
				];
		await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] }, components });
	}

	/** 발음 사전 — 길드 전체에 적용되므로 서버 관리 권한 검사를 이미 통과한 상태로 들어와요. */
	private async pronunciation(
		interaction: ChatInputCommandInteraction<'cached'>,
		subcommand: 'pronounce-add' | 'pronounce-remove' | 'pronounce-list'
	): Promise<void> {
		const service = this.container.ttsPronunciation;
		const reply = (content: string) =>
			interaction.editReply({ flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] }, components: [notice(content)] });

		if (subcommand === 'pronounce-list') {
			const entries = await service.list(interaction.guildId);
			await reply(
				entries.length === 0
					? `${emoji('speech')} 등록된 발음이 없어요. \`/tts 발음추가\`로 알려주세요.`
					: `${emoji('speech')} **발음 사전** (${entries.length}/${TTS_PRONUNCIATION_MAX_ENTRIES})\n${entries.map((entry) => `• ${entry.term} → ${entry.reading}`).join('\n')}`
			);
			return;
		}

		const term = interaction.options.getString('word', true).trim();
		if (subcommand === 'pronounce-remove') {
			await reply(
				(await service.remove(interaction.guildId, term))
					? `${emoji('speech')} \`${term}\` 발음을 지웠어요.`
					: `${emoji('error')} 등록되지 않은 단어예요.`
			);
			return;
		}

		const reading = interaction.options.getString('reading', true).trim();
		if (!term || !reading) {
			await reply(`${emoji('error')} 단어와 읽기를 모두 입력해 주세요.`);
			return;
		}
		const result = await service.set(interaction.guildId, term, reading);
		await reply(
			result === 'ok'
				? `${emoji('speech')} 앞으로 \`${term}\`은(는) "${reading}"(으)로 읽을게요.`
				: result === 'limit'
					? `${emoji('error')} 발음은 서버당 ${TTS_PRONUNCIATION_MAX_ENTRIES}개까지 등록할 수 있어요. 안 쓰는 항목을 먼저 지워 주세요.`
					: `${emoji('error')} 발음을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.`
		);
	}

	/**
	 * 즉석 발화 — 봇이 음성 채널에 있어야 해요(자동 조인 없음). 음악이 있으면 오버레이, 없으면 단독 재생.
	 * TTS 서버 미설정·합성 실패는 원인별로 안내해요(채팅 낭독과 달리 사용자가 직접 요청한 동작이라 조용히 넘기지 않아요).
	 */
	private async speak(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
		const text = interaction.options.getString('text', true).trim();
		if (!text) {
			throw new UserError({
				identifier: 'tts_say_empty',
				message: `${emoji('error')} 읽을 문장을 입력해 주세요.`,
				context: { ephemeral: true }
			});
		}

		if (!this.container.ttsService.isEnabled()) {
			throw new UserError({
				identifier: 'tts_say_not_configured',
				message: `${emoji('error')} 음성 낭독을 아직 사용할 수 없어요. 봇 운영자에게 문의해 주세요.`,
				context: { ephemeral: true }
			});
		}

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player?.voiceChannelId || !player.connected) {
			throw new UserError({
				identifier: 'tts_say_not_in_voice',
				message: `${emoji('error')} 음성 채널에 연결되어 있을 때만 읽을 수 있어요. \`/재생\`으로 먼저 입장해 주세요.`,
				context: { ephemeral: true }
			});
		}

		const preset = await this.container.ttsUserSettings.get(interaction.guildId, interaction.user.id);
		if (interaction.member.voice.channelId !== player.voiceChannelId) {
			throw new UserError({
				identifier: 'tts_say_wrong_channel',
				message: `${emoji('error')} 봇과 같은 음성 채널에 들어온 뒤 말하기를 실행해 주세요.`,
				context: { ephemeral: true }
			});
		}
		try {
			const mode = await this.container.chatTtsService.speakNow(player, text, preset);
			await interaction.editReply({
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { parse: [] },
				components: [
					notice(
						mode === 'overlay'
							? `${emoji('volume_up')} 재생 중인 곡 위에 문장을 읽어드려요.`
							: `${emoji('volume_up')} 읽어드릴게요. (음악이 시작되면 남은 문장은 곡 위로 옮겨 읽어요.)`
					)
				]
			});
		} catch (error) {
			if (error instanceof TtsError) {
				throw new UserError({
					identifier: `tts_say_${error.code}`,
					message: `${emoji('error')} ${error.code === 'queue_full' || error.code === 'playback_failed' ? error.message : '음성을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'}`,
					context: { ephemeral: true }
				});
			}
			throw error;
		}
	}
}
