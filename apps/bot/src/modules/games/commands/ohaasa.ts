import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { fetchOhaasaKo } from '../../../services/dataApiClient.ts';
import { getUserProfile } from '../../general/utils/userProfile.ts';
import { getZodiacFromDate, ZODIAC_CHOICES, ZODIAC_MAP, type DailyHoroscope, type HoroscopeData } from '../utils/ohaasaService.ts';

function formatDate(raw: string): string {
	const compact = raw.replace(/\//g, '');
	if (/^\d{8}$/.test(compact)) return `${compact.slice(0, 4)}/${compact.slice(4, 6)}/${compact.slice(6, 8)}`;
	return raw;
}

function buildSingleLines(daily: DailyHoroscope, target: HoroscopeData): string[] {
	return [
		`### 🔮 오늘의 오하아사 — ${formatDate(daily.date)}`,
		'',
		`**${target.rank}위 · ${target.zodiac.ko} (${target.zodiac.jp})**`,
		target.content || '오늘의 운세 정보가 없어요.',
		`🍀 ${target.lucky || '럭키 정보 없음'}`,
		'',
		`-# 출처: ${daily.source === 'ohaasa' ? '아사히 방송 오하아사' : 'TV 아사히'} · ${
			daily.translated ? 'AI 한국어 번역본이에요.' : '일본어 원문이에요. `/채팅`으로 한국어로 물어보면 번역해 드려요.'
		}`
	];
}

function buildTopLines(daily: DailyHoroscope): string[] {
	const top = daily.horoscopes.slice(0, 3);
	const lines = [`### 🔮 오늘의 오하아사 TOP 3 — ${formatDate(daily.date)}`, ''];
	for (const item of top) {
		lines.push(`**${item.rank}위 ${item.zodiac.ko}** — ${item.content || '정보 없음'}`);
	}
	lines.push(
		'',
		'-# 생일이나 별자리를 지정하면 내 운세만 볼 수 있어요. 예: `/오하아사 별자리:양자리` · `/프로필 생일설정`에 등록하면 지정 없이도 자동으로 보여줘요.'
	);
	return lines;
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'ohaasa',
	description: '일본 아사히 방송의 오늘 별자리 운세를 확인해요.',
	fullCategory: ['게임']
})
export class OhaasaCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '오하아사' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '일본 아사히 방송의 오늘 별자리 운세를 확인해요.' })
				.addStringOption((option) =>
					option
						.setName('zodiac')
						.setNameLocalizations({ ko: '별자리' })
						.setDescription('Zodiac sign')
						.setDescriptionLocalizations({ ko: '조회할 별자리 (미지정 시 오늘의 TOP 3)' })
						.setChoices(ZODIAC_CHOICES.map((item) => ({ name: `${item.ko} (${item.jp})`, value: item.code })))
				)
				.addIntegerOption((option) =>
					option
						.setName('birth_month')
						.setNameLocalizations({ ko: '생일월' })
						.setDescription('Birth month')
						.setDescriptionLocalizations({ ko: '생일 월 (1~12) — 별자리 지정 시 무시돼요.' })
						.setMinValue(1)
						.setMaxValue(12)
				)
				.addIntegerOption((option) =>
					option
						.setName('birth_day')
						.setNameLocalizations({ ko: '생일일' })
						.setDescription('Birth day')
						.setDescriptionLocalizations({ ko: '생일 일 (1~31) — 별자리 지정 시 무시돼요.' })
						.setMinValue(1)
						.setMaxValue(31)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const zodiacOption = interaction.options.getString('zodiac');
		const birthMonth = interaction.options.getInteger('birth_month');
		const birthDay = interaction.options.getInteger('birth_day');

		await interaction.deferReply();

		let daily: DailyHoroscope;
		try {
			daily = await fetchOhaasaKo();
		} catch (e) {
			throw new UserError({
				identifier: 'ohaasa_fetch_failed',
				message: `❌ 운세 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요. (${e instanceof Error ? e.message : String(e)})`,
				context: { ephemeral: true }
			});
		}

		let targetZodiacCode = zodiacOption;
		let autoNote: string | null = null;
		if (!targetZodiacCode && birthMonth != null && birthDay != null) {
			targetZodiacCode = getZodiacFromDate(birthMonth, birthDay);
			if (!targetZodiacCode) {
				throw new UserError({
					identifier: 'ohaasa_invalid_birthdate',
					message: '❌ 해당 생일에 맞는 별자리를 찾을 수 없어요.',
					context: { ephemeral: true }
				});
			}
		}
		// 지정이 없으면 프로필에 저장된 생일로 자동 조회해요
		if (!targetZodiacCode) {
			const profile = await getUserProfile(interaction.user.id);
			if (profile?.birthMonth != null && profile?.birthDay != null) {
				const code = getZodiacFromDate(profile.birthMonth, profile.birthDay);
				if (code) {
					targetZodiacCode = code;
					autoNote = `-# 📌 등록된 생일(${profile.birthMonth}/${profile.birthDay}) 기준 **${ZODIAC_MAP[code]?.ko ?? ''}** 운세예요.`;
				}
			}
		}

		const lines = targetZodiacCode ? buildSingleLines(daily, this.resolveTarget(daily, targetZodiacCode)) : buildTopLines(daily);
		if (autoNote) lines.push('', autoNote);
		const container = createContainer();
		container.addTextDisplayComponents((t) => t.setContent(lines.join('\n')));

		await interaction.editReply({
			components: [container],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private resolveTarget(daily: DailyHoroscope, zodiacCode: string): HoroscopeData {
		const target = daily.horoscopes.find((item) => item.zodiacCode === zodiacCode);
		if (!target) {
			throw new UserError({
				identifier: 'ohaasa_horoscope_not_found',
				message: `❌ ${ZODIAC_MAP[zodiacCode]?.ko ?? '해당 별자리'}의 오늘 운세를 찾을 수 없어요.`,
				context: { ephemeral: true }
			});
		}
		return target;
	}
}
