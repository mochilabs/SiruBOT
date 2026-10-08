import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { emoji, createContainer } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { doCheckin, streakBadge } from '../utils/gameRecords.ts';

// 모듈 평가 시점엔 이모지 매핑이 로드 전일 수 있어 렌더 시점 함수로 만든다
function getMilestones(): Record<number, string> {
	return {
		7: `일주일 연속 출석! 꾸준함이 무기예요 ${emoji('fire')}`,
		30: `한 달 연속 출석! 진짜 대단해요 ${emoji('flash')}`,
		100: `100일 연속 출석!! 전설이예요 ${emoji('crown')}`,
		365: `1년 연속 출석... 이건 인간이 아니에요 ${emoji('gem')}`
	};
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'checkin',
	description: '매일 출석 체크를 해요. 연속 출석하면 스트릭이 쌓여요.',
	fullCategory: ['게임']
})
export class CheckinCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '출석' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '매일 출석 체크를 해요. 연속 출석하면 스트릭이 쌓여요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();

		const { checkedIn, streak } = await doCheckin(interaction.user.id);
		const badge = streakBadge(streak);
		const container = createContainer();

		if (checkedIn) {
			container.addTextDisplayComponents((t) =>
				t.setContent(
					[
						`### ${emoji('calendar')} 오늘은 이미 출석했어요`,
						'',
						`**${interaction.user.displayName}** 님, ${badge} **${streak}일 연속** 출석 중이에요!`,
						'',
						'-# 내일 다시 출석하면 스트릭이 이어져요.'
					].join('\n')
				)
			);
			await interaction.editReply({ components: [container], flags: [MessageFlags.IsComponentsV2] });
			return;
		}

		const lines = [
			`### ${emoji('success')} 출석 완료!`,
			'',
			`**${interaction.user.displayName}** 님, ${badge} **${streak}일 연속** 출석 중이에요!`
		];
		const milestones = getMilestones();
		if (milestones[streak]) lines.push('', `${emoji('party')} ${milestones[streak]}`);
		if (streak === 1) lines.push('', '-# 매일 출석해서 스트릭을 쌓아보세요. `/프로필 보기`에서 확인할 수 있어요.');

		container.addTextDisplayComponents((t) => t.setContent(lines.join('\n')));
		await interaction.editReply({ components: [container], flags: [MessageFlags.IsComponentsV2] });
	}
}
