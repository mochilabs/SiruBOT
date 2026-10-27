import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { purgeUserData, summarizeUserData } from '../../../services/userDataService.ts';

/**
 * `/개인정보` — 내 데이터 열람·삭제 (PIPA/GDPR 삭제권 경로).
 *
 * 지금까지 프로필(생일·소개)을 빼면 사용자가 자기 데이터를 지울 방법이 없었어요.
 * 여기서 지우는 범위는 **사용자 단위** 저장소예요:
 * - AI 장기·단기 기억(`UserMemory`)
 * - 프로필(생일·소개)
 * - 채팅 TTS 사용자 설정(`TtsUserSetting`)
 * - 게임 전적(`GameRecord`)
 * 채널 대화 기록(`ChannelChatHistory`)은 여러 사용자가 섞여 있어 서버 관리자만 지울 수 있어요
 * (대시보드 서버 설정의 기록 삭제 / `/개인정보 보기` 안내로 연결).
 */
@ApplyOptions<Subcommand.Options>({
	enabled: true,
	name: 'privacy',
	description: 'View or delete the data I store about you.',
	fullCategory: ['일반'],
	subcommands: [
		{ name: 'view', chatInputRun: 'chatInputView' },
		{ name: 'forget', chatInputRun: 'chatInputForget' }
	]
})
export class PrivacyCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '개인정보' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '내 데이터를 확인하거나 지워요. (AI 기억·프로필·게임 전적)' })
				.addSubcommand((sub) =>
					sub
						.setName('view')
						.setNameLocalizations({ ko: '보기' })
						.setDescription('Show what data I store about you.')
						.setDescriptionLocalizations({ ko: '저장 중인 내 데이터 종류와 개수를 보여줘요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('forget')
						.setNameLocalizations({ ko: '삭제' })
						.setDescription('Delete my stored data.')
						.setDescriptionLocalizations({ ko: '저장된 내 데이터를 지워요. 되돌릴 수 없어요.' })
						.addBooleanOption((option) =>
							option
								.setName('confirm')
								.setNameLocalizations({ ko: '확인' })
								.setDescription('Confirm deletion (irreversible).')
								.setDescriptionLocalizations({ ko: '삭제를 확정해요. 되돌릴 수 없어요.' })
								.setRequired(true)
						)
				);
		});
	}

	public async chatInputView(interaction: ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const summary = await summarizeUserData(interaction.user.id);

		const lines = [
			`### ${emoji('lock')} 저장 중인 내 데이터`,
			'',
			`${emoji('robot')} AI 장기 기억: ${summary.memoryFacts}개`,
			`${emoji('speech')} AI 단기 기억: ${summary.shortTermTurns}개`,
			`${emoji('cake')} 프로필 생일: ${summary.hasBirthday ? '등록됨' : '없음'}`,
			`${emoji('pin')} 프로필 소개: ${summary.hasIntro ? '등록됨' : '없음'}`,
			`${emoji('music_note')} 채팅 TTS 설정: ${summary.ttsSettings}개 길드`,
			`${emoji('gamepad')} 게임 전적: ${summary.gameRecords}건`,
			'',
			'-# 채널 AI 대화 기록에는 회원님 발화가 섞여 있어요. 이 기록은 서버 단위로만 지울 수 있어요',
			'-# (서버 관리자 → 대시보드 서버 설정의 AI 기록 삭제). 지금 지우려면 `/개인정보 삭제 확인:True`.'
		];

		await interaction.editReply({ allowedMentions: { parse: [] }, content: lines.join('\n') });
	}

	public async chatInputForget(interaction: ChatInputCommandInteraction<'cached'>) {
		const confirmed = interaction.options.getBoolean('confirm', true);
		if (!confirmed) {
			await interaction.reply({
				content: `${emoji('bulb')} 삭제를 확정하려면 \`확인:True\`로 실행해 주세요. 되돌릴 수 없어요.`,
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const result = await purgeUserData(interaction.user.id);

		await interaction.editReply({
			allowedMentions: { parse: [] },
			content: [
				`${emoji('trash')} 내 데이터를 지웠어요.`,
				`-# AI 기억 ${result.memoryRows} · 프로필 ${result.profileRows} · TTS 설정 ${result.ttsRows} · 게임 전적 ${result.gameRecords}건 삭제`
			].join('\n')
		});
	}
}
