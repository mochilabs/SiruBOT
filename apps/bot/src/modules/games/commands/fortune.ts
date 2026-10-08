import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { appEmoji, createContainer } from '@sirubot/utils';
import { createHash } from 'node:crypto';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';

const FORTUNES = [
	'오늘은 작은 시도가 큰 결과로 돌아오는 날이에요. 주저말고 밀어붙여 보세요!',
	'생각보다 일이 술술 풀리는 날! 평소 미루던 일을 하나 처리해 보면 좋아요.',
	'주변 사람 한 명이 오늘의 키플레이어예요. 먼저 다가가 보세요.',
	'잠깐의 멈움이 오히려 좋은 방향을 알려줄 거예요. 속도를 늦춰 보세요.',
	'오늘은 실수해도 괜찮은 날. 새로운 것을 시도하기 최적의 타이밍이에요.',
	'기다리던 소식이 올 수 있어요. 알림을 한 번 확인해 보세요.',
	'금전운이 상승 중이에요. 다만 충동구매는 잠시만 참아 주세요.',
	'에너지가 넘치는 날이니 중요한 일을 오전에 밀어 끝내 보세요.',
	'오래된 문제가 스스로 풀리는 날이에요. 답을 너무 쥐고 있지 않아도 돼요.',
	'웃음이 행운을 부르는 날! 주변에 웃음꽃을 활짝 피워 보세요.'
];

// 모듈 평가 시점엔 이모지 매핑이 로드 전일 수 있어 렌더 시점 함수로 만든다
function getGrades(): string[] {
	return [
		`${appEmoji('star', '🌟')} 최고예요`,
		'🙂 좋아요',
		'😐 무난해요',
		`${appEmoji('rain', '🌧️')} 조금 흐려요`,
		`${appEmoji('warning', '⚠️')} 조심하세요`
	];
}

function getLuckyEmojis(): string[] {
	return [appEmoji('clover', '🍀'), appEmoji('gamepad', '🎡'), appEmoji('dice', '🎲'), appEmoji('coin', '🪙'), appEmoji('cat', '🐈')];
}

const COLORS = ['🔴 빨강', '🟠 주황', '🟡 노랑', '🟢 초록', '🔵 파랑', '🟣 보라', '🩷 분홍'];

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'fortune',
	description: '오늘의 운세를 봐요. 하루에 한 번 같은 결과!',
	fullCategory: ['게임']
})
export class FortuneCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '운세' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '오늘의 운세를 봐요. 같은 날엔 항상 같은 결과!' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const today = new Date();
		const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
		const hash = createHash('sha256').update(`${interaction.user.id}:${dateKey}`).digest('hex');

		const fortune = FORTUNES[parseInt(hash.slice(0, 8), 16) % FORTUNES.length];
		const grade = getGrades()[parseInt(hash.slice(8, 16), 16) % 5];
		const color = COLORS[parseInt(hash.slice(16, 24), 16) % COLORS.length];
		const luckyNumber = (parseInt(hash.slice(24, 32), 16) % 99) + 1;
		const luckyEmoji = getLuckyEmojis()[parseInt(hash.slice(32, 40), 16) % 5];

		await interaction.deferReply();

		const container = createContainer();
		container.addTextDisplayComponents((t) =>
			t.setContent(
				[
					`### ${appEmoji('crystal_ball', '🔮')} ${interaction.user.displayName} 님의 오늘 운세`,
					'',
					`**${grade}**`,
					fortune,
					'',
					`${appEmoji('clover', '🍀')} 럭키 넘버: **${luckyNumber}** · ${appEmoji('palette', '🎨')} 럭키 컬러: **${color}** · ${luckyEmoji}`,
					`-# ${dateKey} 기준 — 내일 다시 오면 새로운 운세가 기다려요.`
				].join('\n')
			)
		);

		await interaction.editReply({
			components: [container],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
