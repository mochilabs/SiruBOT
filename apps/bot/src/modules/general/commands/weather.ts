import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { emoji, createContainer } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { fetchWeather, WeatherError, GatewayDomainError, type WeatherResult, type WeatherScope } from '../../../services/dataApiClient.ts';

const SCOPE_LABELS: Record<WeatherScope, string> = {
	now: '지금 날씨',
	today: '오늘 예보',
	tomorrow: '내일 예보',
	week: '이번 주 예보'
};

function formatTempRange(day: WeatherResult['daily'][number]): string {
	if (day.tempMin != null && day.tempMax != null) return `${day.tempMin}~${day.tempMax}°C`;
	if (day.tempMax != null) return `최고 ${day.tempMax}°C`;
	if (day.tempMin != null) return `최저 ${day.tempMin}°C`;
	return '온도 정보 없음';
}

function buildNowLines(result: WeatherResult): string[] {
	const lines: string[] = [`**${result.weatherTextKo}**`];
	if (result.temperatureC != null) {
		const feels =
			result.feelsLikeC != null && Math.abs(result.feelsLikeC - result.temperatureC) >= 0.05 ? ` (체감 ${result.feelsLikeC.toFixed(1)}°C)` : '';
		lines.push(`${emoji('thermo')} 기온 **${result.temperatureC.toFixed(1)}°C**${feels}`);
	}
	const extra: string[] = [];
	if (result.humidityPercent != null) extra.push(`${emoji('drop')} 습도 ${Math.round(result.humidityPercent)}%`);
	if (result.windSpeedKmh != null) extra.push(`${emoji('windy')} 풍속 ${result.windSpeedKmh.toFixed(1)} km/h`);
	if (result.cloudCoverPercent != null) extra.push(`${emoji('cloudy')} 구름 ${Math.round(result.cloudCoverPercent)}%`);
	if (result.precipitationMm != null && result.precipitationMm > 0) extra.push(`${emoji('rain')} 강수 ${result.precipitationMm} mm`);
	if (extra.length > 0) lines.push(extra.join(' · '));

	if (result.airQuality) {
		const { pm25, pm25GradeKo, pm10GradeKo } = result.airQuality;
		const pm25Part = pm25 != null ? `PM2.5 ${pm25.toFixed(1)}µg/m³ (${pm25GradeKo})` : 'PM2.5 정보 없음';
		const pm10Part = result.airQuality.pm10 != null ? `PM10 ${result.airQuality.pm10.toFixed(1)}µg/m³ (${pm10GradeKo})` : null;
		lines.push(`${emoji('warning')} 미세먼지 ${pm25Part}${pm10Part ? ` · ${pm10Part}` : ''}`);
	}
	return lines;
}

function buildForecastLines(result: WeatherResult): string[] {
	const day = result.daily[0];
	if (!day) return ['예보 정보를 가져올 수 없어요.'];
	const lines: string[] = [`**${day.weatherTextKo}** · ${formatTempRange(day)}`];
	const extra: string[] = [];
	if (day.precipitationProbabilityMaxPct != null) extra.push(`${emoji('rain')} 강수확률 ${Math.round(day.precipitationProbabilityMaxPct)}%`);
	if (day.precipitationSumMm != null && day.precipitationSumMm > 0) extra.push(`강수량 ${day.precipitationSumMm} mm`);
	if (day.windSpeedMaxKmh != null) extra.push(`최대풍속 ${day.windSpeedMaxKmh.toFixed(1)} km/h`);
	if (extra.length > 0) lines.push(extra.join(' · '));
	return lines;
}

function buildWeekLines(result: WeatherResult): string[] {
	if (result.daily.length === 0) return ['예보 정보를 가져올 수 없어요.'];
	return result.daily.map(
		(day) =>
			`${day.date.slice(5)} (${day.date.slice(0, 4)}): ${day.weatherTextKo} · ${formatTempRange(day)}${day.precipitationProbabilityMaxPct != null ? ` · 강수 ${Math.round(day.precipitationProbabilityMaxPct)}%` : ''}`
	);
}

function buildContainer(result: WeatherResult) {
	const locationLine = [result.localityName, result.country].filter(Boolean).join(', ');
	const lines = [`### ${emoji('sun_cloud')} ${locationLine} · ${SCOPE_LABELS[result.scope]}`, ''];
	lines.push(...(result.scope === 'now' ? buildNowLines(result) : result.scope === 'week' ? buildWeekLines(result) : buildForecastLines(result)));
	lines.push('');
	lines.push(`-# Open-Meteo 기준 · 관측 시각 ${result.observedAt || '알 수 없음'}${result.timezone ? ` (${result.timezone})` : ''}`);

	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(lines.join('\n')));
	return container;
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'weather',
	description: '현재 날씨와 예보를 확인해요.',
	fullCategory: ['일반']
})
export class WeatherCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '날씨' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '현재 날씨와 예보를 확인해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('now')
						.setNameLocalizations({ ko: '지금' })
						.setDescription('Get current weather')
						.setDescriptionLocalizations({ ko: '현재 날씨를 확인해요.' })
						.addStringOption((option) =>
							option
								.setName('location')
								.setNameLocalizations({ ko: '위치' })
								.setDescription('Location name')
								.setDescriptionLocalizations({ ko: '날씨를 확인할 위치' })
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('today')
						.setNameLocalizations({ ko: '오늘' })
						.setDescription("Get today's forecast")
						.setDescriptionLocalizations({ ko: '오늘 예보를 확인해요.' })
						.addStringOption((option) =>
							option
								.setName('location')
								.setNameLocalizations({ ko: '위치' })
								.setDescription('Location name')
								.setDescriptionLocalizations({ ko: '날씨를 확인할 위치' })
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('tomorrow')
						.setNameLocalizations({ ko: '내일' })
						.setDescription("Get tomorrow's forecast")
						.setDescriptionLocalizations({ ko: '내일 예보를 확인해요.' })
						.addStringOption((option) =>
							option
								.setName('location')
								.setNameLocalizations({ ko: '위치' })
								.setDescription('Location name')
								.setDescriptionLocalizations({ ko: '날씨를 확인할 위치' })
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('week')
						.setNameLocalizations({ ko: '이번주' })
						.setDescription('Get this week forecast')
						.setDescriptionLocalizations({ ko: '이번 주 예보를 확인해요.' })
						.addStringOption((option) =>
							option
								.setName('location')
								.setNameLocalizations({ ko: '위치' })
								.setDescription('Location name')
								.setDescriptionLocalizations({ ko: '날씨를 확인할 위치' })
								.setRequired(true)
						)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const sub = interaction.options.getSubcommand();
		const location = interaction.options.getString('location', true);
		const scope: WeatherScope = sub === 'today' ? 'today' : sub === 'tomorrow' ? 'tomorrow' : sub === 'week' ? 'week' : 'now';

		await interaction.deferReply();

		let result: WeatherResult;
		try {
			result = await fetchWeather(location, scope);
		} catch (error) {
			if (error instanceof WeatherError || error instanceof GatewayDomainError) {
				throw new UserError({
					identifier: error.identifier,
					message: `${emoji('error')} ${error.message}`,
					context: { ephemeral: true }
				});
			}
			throw error;
		}

		await interaction.editReply({
			components: [buildContainer(result)],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
