import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ApplicationIntegrationType, AttachmentBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { fetchOhaasaKo, renderOhaasaCard, renderOhaasaTopCard } from '../../../../services/dataApiClient.ts';
import { getUserProfile } from '../../../../modules/general/utils/userProfile.ts';
import { getZodiacFromDate, ZODIAC_CHOICES, ZODIAC_MAP } from '../../application/ohaasaService.ts';
import { ohaasaSingleLines, ohaasaTopLines, ohaasaView, formatOhaasaDate } from '../views/ohaasa.ts';
import { buildOhaasaCardRequest, buildOhaasaTopCardRequest } from '../../application/ohaasaCardPayload.ts';
import type { DailyHoroscope, HoroscopeData } from '../../../../services/types.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'ohaasa',
	description: "Today's zodiac horoscope from TV Asahi (Ohaasa).",
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
						.setChoices(
							ZODIAC_CHOICES.map((item) => ({
								name: `${item.en} (${item.jp})`,
								name_localizations: { ko: `${item.ko} (${item.jp})` },
								value: item.code
							}))
						)
				)
				.addIntegerOption((option) =>
					option
						.setName('birth_month')
						.setNameLocalizations({ ko: '생일월' })
						.setDescription('Birth month')
						.setDescriptionLocalizations({ ko: '생일 월 (1~12). 별자리 지정 시 무시돼요.' })
						.setMinValue(1)
						.setMaxValue(12)
				)
				.addIntegerOption((option) =>
					option
						.setName('birth_day')
						.setNameLocalizations({ ko: '생일일' })
						.setDescription('Birth day')
						.setDescriptionLocalizations({ ko: '생일 일 (1~31). 별자리 지정 시 무시돼요.' })
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
				message: `${emoji('error')} 운세 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요. (${e instanceof Error ? e.message : String(e)})`,
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
					message: `${emoji('error')} 해당 생일에 맞는 별자리를 찾을 수 없어요.`,
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
					autoNote = `-# ${emoji('pin')} 등록된 별자리 **${ZODIAC_MAP[code]?.ko ?? ''}** 기준 운세예요.`;
				}
			}
		}

		let target: HoroscopeData | null = null;
		if (targetZodiacCode) {
			target = this.resolveTarget(daily, targetZodiacCode);
		}

		// 카드 이미지는 요약(별자리·순위·럭키)만 그려요. 렌더에 실패하면 전부 텍스트로 보여줘요.
		const date = formatOhaasaDate(daily.date);
		const png = target
			? await renderOhaasaCard(buildOhaasaCardRequest(target, date)).catch(() => null)
			: await renderOhaasaTopCard(buildOhaasaTopCardRequest(daily.horoscopes, date)).catch(() => null);
		const filename = target ? `ohaasa-${target.zodiacCode}.png` : 'ohaasa-top.png';

		const lines = target ? ohaasaSingleLines(daily, target, !!png) : ohaasaTopLines(daily, !!png);
		if (autoNote) lines.push('', autoNote);

		await interaction.editReply({
			components: [ohaasaView(lines, png ? filename : null)],
			...(png ? { files: [new AttachmentBuilder(png, { name: filename })] } : {}),
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private resolveTarget(daily: DailyHoroscope, zodiacCode: string): HoroscopeData {
		const target = daily.horoscopes.find((item) => item.zodiacCode === zodiacCode);
		if (!target) {
			throw new UserError({
				identifier: 'ohaasa_horoscope_not_found',
				message: `${emoji('error')} ${ZODIAC_MAP[zodiacCode]?.ko ?? '해당 별자리'}의 오늘 운세를 찾을 수 없어요.`,
				context: { ephemeral: true }
			});
		}
		return target;
	}
}
