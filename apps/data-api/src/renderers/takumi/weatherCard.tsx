/**
 * 날씨 카드 렌더러(Takumi) — 현재·오늘·내일 날씨(큰 기온 + 지표 열)와 이번 주 예보(7열)를 투명 배경 PNG로 그려요.
 * 스키마는 routes/weatherCardSchema.ts가 소유하고, 봇은 이미지 아래에 출처 푸터를 텍스트로 붙여요.
 */
import type { CSSProperties, ReactNode } from 'react';
import { CARD_FONT } from '@sirubot/cards';
import type { WeatherCardInput } from '../../routes/weatherCardSchema.ts';
import { Box, renderCardPng } from './takumiKit.tsx';

type DailyDay = WeatherCardInput['daily'][number];

const W = 960;
/** 라이트 테마에서도 글자가 읽히도록 옅은 그림자를 깔아요(다크에서는 거의 보이지 않아요). */
const SHADOW = '0 1px 4px rgba(0, 0, 0, 0.85)';
const ellipsis = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const satisfies CSSProperties;
const PAD = 16;
// 배경을 칠하지 않는 투명 PNG예요 — Discord 컨테이너 위에 그대로 얹혀 면이 섞여 보여요. 색은 Discord 다크 테마의 텍스트 톤을 따라요.
const TEXT = '#f2f3f5';
const MUTED = '#949ba4';
const LINE = 'rgba(255,255,255,0.1)';

type Tone = 'clear' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog';

const TONE_COLORS: Record<Tone, string> = {
	clear: '#fbbf24',
	cloud: '#93c5fd',
	rain: '#67e8f9',
	snow: '#dbeafe',
	storm: '#c084fc',
	fog: '#d4a574'
};

const SCOPE_LABELS: Record<WeatherCardInput['scope'], string> = { now: '현재', today: '오늘', tomorrow: '내일', week: '이번 주' };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** WMO weather_code → 색조. 코드 의미는 Open-Meteo 문서 기준이에요. */
export function toneForCode(code: number | null): Tone {
	if (code == null) return 'cloud';
	if (code === 0 || code === 1) return 'clear';
	if (code === 2 || code === 3) return 'cloud';
	if (code === 45 || code === 48) return 'fog';
	if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
	if (code >= 95) return 'storm';
	return 'cloud';
}

/** WMO weather_code → 이모지. 밤(isDay=false)에는 맑음을 달로 바꿔요. */
export function emojiForCode(code: number | null, isDay: boolean | null = true): string {
	switch (toneForCode(code)) {
		case 'clear':
			if (isDay === false) return '🌙';
			return code === 0 ? '☀️' : '🌤️';
		case 'cloud':
			return code === 3 ? '☁️' : '⛅';
		case 'fog':
			return '🌫️';
		case 'rain':
			// 이슬비·소나기는 해가 비치는 🌦️, 그 외 비는 🌧️
			return code != null && (code <= 57 || code >= 80) ? '🌦️' : '🌧️';
		case 'snow':
			return '🌨️';
		case 'storm':
			return '⛈️';
	}
}

const fmtTemp = (value: number | null) => (value == null ? '-' : `${Math.round(value)}°`);

/** 'YYYY-MM-DD' → 요일(월)과 'M/D'. 타임존 영향 없이 UTC로 계산해요. */
export function dayLabel(date: string): { weekday: string; md: string } {
	const parsed = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) return { weekday: '', md: date.slice(5) };
	return { weekday: WEEKDAYS[parsed.getUTCDay()]!, md: `${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}` };
}

interface Metric {
	emoji: string;
	label: string;
	value: string;
}

function buildMetrics(input: WeatherCardInput, day: DailyDay | undefined): Metric[] {
	const metrics: Metric[] = [];
	if (input.scope === 'now') {
		if (input.humidityPercent != null) metrics.push({ emoji: '💧', label: '습도', value: `${Math.round(input.humidityPercent)}%` });
		if (input.windSpeedKmh != null) metrics.push({ emoji: '💨', label: '풍속', value: `${input.windSpeedKmh.toFixed(1)} km/h` });
		if (input.cloudCoverPercent != null) metrics.push({ emoji: '☁️', label: '구름', value: `${Math.round(input.cloudCoverPercent)}%` });
		if (input.airQuality?.pm25 != null) {
			metrics.push({ emoji: '😷', label: '초미세먼지', value: `${Math.round(input.airQuality.pm25)} ${input.airQuality.pm25GradeKo}`.trim() });
		} else if (input.precipitationMm != null && input.precipitationMm > 0) {
			metrics.push({ emoji: '☔', label: '강수', value: `${input.precipitationMm} mm` });
		}
	} else if (day) {
		if (day.precipitationProbabilityMaxPct != null) {
			metrics.push({ emoji: '☔', label: '강수확률', value: `${Math.round(day.precipitationProbabilityMaxPct)}%` });
		}
		if (day.precipitationSumMm != null) metrics.push({ emoji: '💧', label: '강수량', value: `${day.precipitationSumMm} mm` });
		if (day.windSpeedMaxKmh != null) metrics.push({ emoji: '💨', label: '최대풍속', value: `${day.windSpeedMaxKmh.toFixed(1)} km/h` });
	}
	return metrics.slice(0, 4);
}

function Header({ input }: { input: WeatherCardInput }): ReactNode {
	return (
		<Box style={{ alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
			<Box
				style={{ fontSize: 20, fontWeight: 700, color: MUTED, maxWidth: 620, ...ellipsis }}
			>{`${input.locationLabel} · ${SCOPE_LABELS[input.scope]}`}</Box>
			{input.observedAt ? <Box style={{ fontSize: 17, fontWeight: 500, color: MUTED }}>{input.observedAt}</Box> : null}
		</Box>
	);
}

/** 현재·오늘·내일 — 큰 이모지와 기온, 아래에 구분선으로 나눈 지표 열 */
function Single({ input, accent }: { input: WeatherCardInput; accent: string }): ReactNode {
	const day = input.scope === 'now' ? undefined : input.daily[0];
	const code = input.scope === 'now' ? input.weatherCode : (day?.weatherCode ?? input.weatherCode);
	const text = input.scope === 'now' ? input.weatherText : (day?.weatherText ?? input.weatherText);
	const metrics = buildMetrics(input, day);
	const showFeels =
		input.scope === 'now' && input.feelsLikeC != null && input.temperatureC != null && Math.abs(input.feelsLikeC - input.temperatureC) >= 0.5;

	return (
		<>
			<Box style={{ alignItems: 'center', height: 164, marginTop: 4 }}>
				<Box style={{ width: 150, flexShrink: 0, fontSize: 104, lineHeight: 1 }}>
					{emojiForCode(code, input.scope === 'now' ? input.isDay : true)}
				</Box>
				<Box style={{ flexDirection: 'column', flex: 1, minWidth: 0 }}>
					{input.scope === 'now' ? (
						<Box style={{ fontSize: 108, fontWeight: 800, color: TEXT, lineHeight: 1 }}>{fmtTemp(input.temperatureC)}</Box>
					) : (
						<Box style={{ alignItems: 'baseline' }}>
							<Box style={{ fontSize: 92, fontWeight: 800, color: TEXT, lineHeight: 1 }}>{fmtTemp(day?.tempMax ?? null)}</Box>
							<Box style={{ fontSize: 48, fontWeight: 600, color: MUTED, marginLeft: 16 }}>{`/ ${fmtTemp(day?.tempMin ?? null)}`}</Box>
						</Box>
					)}
					<Box style={{ alignItems: 'baseline', marginTop: 10 }}>
						<Box style={{ fontSize: 28, fontWeight: 800, color: accent, maxWidth: W - PAD * 2 - 150 - 160, ...ellipsis }}>
							{text || '-'}
						</Box>
						{showFeels ? (
							<Box style={{ fontSize: 21, fontWeight: 500, color: MUTED, marginLeft: 16 }}>{`체감 ${fmtTemp(input.feelsLikeC)}`}</Box>
						) : null}
					</Box>
				</Box>
			</Box>
			{metrics.length > 0 ? (
				<Box style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, height: 96, paddingTop: 18 }}>
					{metrics.map((metric, i) => (
						<Box
							key={metric.label}
							style={{
								flex: 1,
								minWidth: 0,
								flexDirection: 'column',
								paddingLeft: i === 0 ? 0 : 24,
								borderLeft: i === 0 ? undefined : `1px solid ${LINE}`
							}}
						>
							<Box style={{ fontSize: 16, fontWeight: 600, color: MUTED }}>{`${metric.emoji} ${metric.label}`}</Box>
							<Box style={{ fontSize: 28, fontWeight: 800, color: TEXT, marginTop: 12, ...ellipsis }}>{metric.value}</Box>
						</Box>
					))}
				</Box>
			) : null}
		</>
	);
}

/** 이번 주 — 요일별 7열. 최고/최저 기온과 강수확률을 한눈에 비교해요. 오늘은 요일 밑줄로 표시해요. */
function Week({ input, accent }: { input: WeatherCardInput; accent: string }): ReactNode {
	const days = input.daily.slice(0, 7);
	if (days.length === 0) {
		return (
			<Box style={{ height: 200, alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 500, color: MUTED }}>
				예보 정보를 가져올 수 없어요
			</Box>
		);
	}
	return (
		<Box style={{ height: 250, marginTop: 12 }}>
			{days.map((day, i) => {
				const { weekday, md } = dayLabel(day.date);
				return (
					<Box
						key={day.date}
						style={{
							flex: 1,
							minWidth: 0,
							flexDirection: 'column',
							alignItems: 'center',
							borderLeft: i === 0 ? undefined : `1px solid ${LINE}`
						}}
					>
						<Box style={{ fontSize: 24, fontWeight: 800, color: TEXT }}>{weekday}</Box>
						<Box style={{ width: 28, height: 3, marginTop: 4, background: i === 0 ? accent : 'transparent' }} />
						<Box style={{ fontSize: 15, fontWeight: 500, color: MUTED, marginTop: 6 }}>{md}</Box>
						<Box style={{ fontSize: 52, lineHeight: 1, marginTop: 10 }}>{emojiForCode(day.weatherCode, true)}</Box>
						<Box style={{ fontSize: 30, fontWeight: 800, color: TEXT, marginTop: 14 }}>{fmtTemp(day.tempMax)}</Box>
						<Box style={{ fontSize: 22, fontWeight: 600, color: MUTED }}>{fmtTemp(day.tempMin)}</Box>
						{day.precipitationProbabilityMaxPct != null ? (
							<Box
								style={{ fontSize: 17, fontWeight: 700, color: TONE_COLORS.rain, marginTop: 8 }}
							>{`☔ ${Math.round(day.precipitationProbabilityMaxPct)}%`}</Box>
						) : null}
					</Box>
				);
			})}
		</Box>
	);
}

export async function renderWeatherCard(input: WeatherCardInput): Promise<Buffer> {
	const accent =
		TONE_COLORS[
			toneForCode(input.scope === 'now' || input.scope === 'week' ? input.weatherCode : (input.daily[0]?.weatherCode ?? input.weatherCode))
		];
	const H = input.scope === 'week' ? 330 : 320;
	const card = (
		<Box
			style={{
				width: W,
				height: H,
				boxSizing: 'border-box',
				flexDirection: 'column',
				padding: `0 ${PAD}px`,
				fontFamily: CARD_FONT,
				color: TEXT,
				textShadow: SHADOW
			}}
		>
			<Header input={input} />
			{input.scope === 'week' ? <Week input={input} accent={accent} /> : <Single input={input} accent={accent} />}
		</Box>
	);
	return renderCardPng(card, { width: W, height: H });
}
