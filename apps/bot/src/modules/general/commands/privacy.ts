import { notice } from '../view/notice.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { purgeUserData, summarizeUserData } from '../../../services/userDataService.ts';
import { confirmAction } from '../../../lib/confirmation.ts';

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
			'-# 채널 기록은 서버 관리자에게 /채팅설정 초기화를 요청해 주세요.',
			'-# 플레이리스트·즐겨찾기·음악 이용 기록은 이 삭제에 포함되지 않아요. 개인 설정(AI 기억·생일·소개·TTS 설정·게임 전적)을 지우려면 /개인정보 삭제를 실행해 주세요.'
		];

		await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] }, components: [notice(lines.join('\n'))] });
	}

	public async chatInputForget(interaction: ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const summary = await summarizeUserData(interaction.user.id);
		if (
			!(await confirmAction(
				interaction,
				'내 개인 설정을 삭제할까요?',
				`AI 장기 기억 ${summary.memoryFacts}개 · 단기 기억 ${summary.shortTermTurns}개\n생일·소개 · TTS 설정 ${summary.ttsSettings}개 서버 · 게임 전적 ${summary.gameRecords}건\n\n모든 서버에 걸친 위 데이터를 삭제하며 되돌릴 수 없어요.\n채널 AI 기록·플레이리스트·즐겨찾기·음악 이용 기록은 유지돼요.`
			))
		)
			return;
		const result = await purgeUserData(interaction.user.id);

		await interaction.editReply({
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { parse: [] },
			components: [
				notice(
					[
						`${emoji('trash')} 확인한 개인 설정과 AI 기억·게임 전적을 지웠어요.`,
						`-# AI 기억 ${result.memoryRows} · 프로필 ${result.profileRows} · TTS 설정 ${result.ttsRows} · 게임 전적 ${result.gameRecords}건 삭제`
					].join('\n')
				)
			]
		});
	}
}
