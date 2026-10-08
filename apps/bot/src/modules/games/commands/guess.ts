import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { appEmoji, createContainer } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getGuessBest, recordGameResult } from '../utils/gameRecords.ts';

interface GuessSession {
	target: number;
	attempts: number;
}

const MAX_ATTEMPTS = 6;
const sessions = new Map<string, GuessSession>();

function resultContainer(lines: string[]) {
	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(lines.join('\n')));
	return container;
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'guess',
	description: '1~100 숫자를 맞히는 게임이에요. 6번 안에 맞히면 이겨요!',
	fullCategory: ['게임']
})
export class GuessCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '숫자맞히기' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '1~100 숫자를 맞히는 게임이에요. 6번 안에 맞히면 이겨요!' })
				.addStringOption((option) =>
					option
						.setName('입력')
						.setNameLocalizations({ ko: '입력', 'en-US': 'input' })
						.setDescription('«시작»으로 새 게임, 1~100 숫자로 도전해요.')
						.setDescriptionLocalizations({ ko: '«시작»으로 새 게임, 1~100 숫자로 도전해요.' })
						.setRequired(true)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'guess_not_in_guild',
				message: `${appEmoji('error', '❌')} 길드 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		const raw = interaction.options.getString('입력', true).trim();
		const userId = interaction.user.id;

		if (raw === '시작' || raw.toLowerCase() === 'start') {
			const target = Math.floor(Math.random() * 100) + 1;
			sessions.set(userId, { target, attempts: MAX_ATTEMPTS });
			await interaction.reply({
				components: [
					resultContainer([
						`### ${appEmoji('dice', '🎲')} 숫자맞히기 시작!`,
						'',
						`**${interaction.user.displayName}** 님의 게임이 열렸어요.`,
						`1~100 사이 숫자를 맞추면 돼요. 기회는 **${MAX_ATTEMPTS}번**.`,
						'',
						'-# \`/숫자맞히기 입력:42\` 형태로 도전하세요.'
					])
				],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}

		const guess = Number(raw);
		if (!Number.isInteger(guess) || guess < 1 || guess > 100) {
			throw new UserError({
				identifier: 'guess_invalid_input',
				message: `${appEmoji('error', '❌')} \`시작\` 또는 1~100 사이 숫자를 입력해 주세요.`,
				context: { ephemeral: true }
			});
		}

		const session = sessions.get(userId);
		if (!session) {
			throw new UserError({
				identifier: 'guess_no_session',
				message: `${appEmoji('error', '❌')} 진행 중인 게임이 없어요. \`시작\`으로 새로 시작해 주세요.`,
				context: { ephemeral: true }
			});
		}

		if (guess === session.target) {
			const used = MAX_ATTEMPTS - session.attempts + 1;
			sessions.delete(userId);

			const prevBest = await getGuessBest(userId);
			const isNewBest = prevBest == null || used < prevBest;
			await recordGameResult(userId, 'guess', 'win', { attempts: used });

			const recordLine = isNewBest
				? `${appEmoji('trophy', '🏆')} ${prevBest == null ? `개인 기록으로 **${used}번** 저장했어요!` : `개인 최고 기록 갱신! (${prevBest}번 → **${used}번**)`}`
				: `-# 개인 최고 기록: ${prevBest}번`;

			await interaction.reply({
				components: [
					resultContainer([
						`### ${appEmoji('party', '🎉')} 정답!`,
						`**${interaction.user.displayName}** 님의 정답: **${guess}**`,
						`**${used}번** 만에 맞혔어요${used === 1 ? ' — 한 번에?! 🤯' : '!'}`,
						'',
						recordLine
					])
				],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}

		session.attempts -= 1;
		const hint = guess < session.target ? `${appEmoji('arrow_up', '⬆️')} 더 높아요` : `${appEmoji('arrow_down', '⬇️')} 더 낮아요`;

		if (session.attempts <= 0) {
			sessions.delete(userId);
			await recordGameResult(userId, 'guess', 'loss', { target: session.target });
			await interaction.reply({
				components: [
					resultContainer([
						`### ${appEmoji('boom', '💥')} 게임 오버`,
						`**${interaction.user.displayName}** 님의 추측: **${guess}**`,
						`정답은 **${session.target}** 이었어요.`,
						`기회 ${MAX_ATTEMPTS}번을 다 썼어요 — 다시 도전해 보세요!`
					])
				],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}

		await interaction.reply({
			components: [
				resultContainer([`### ${appEmoji('eye', '🔍')} 힌트`, `추측: **${guess}** → ${hint}`, `남은 기회: **${session.attempts}번**`])
			],
			flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
		});
	}
}
