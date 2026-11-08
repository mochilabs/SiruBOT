/**
 * 날씨 카드 렌더러 — skia-canvas로 현재·오늘·내일 날씨(큰 기온 + 지표 박스)와 이번 주 예보(7칸 스트립)를 그려요.
 * 스키마는 routes/weatherCardSchema.ts가 소유하고, 봇은 이미지와 함께 위치·관측 시각 푸터를 텍스트로 붙여요.
 */
import type { Canvas, CanvasRenderingContext2D } from 'skia-canvas';
import type { WeatherCardInput } from '../routes/weatherCardSchema.ts';
import { ensureKoreanFont, hexToRgba, truncate } from './canvasUtils.ts';

type DailyDay = WeatherCardInput['daily'][number];

const FONT = '"Pretendard JP", "Twemoji Mozilla", sans-serif';
const EMOJI_FONT = '"Twemoji Mozilla", sans-serif';

const W = 960;
const PAD = 48;
const BASE = '#1a0e12';
const TEXT = '#fce7f3';
const MUTED = '#c9a8b5';
const LINE = '#3d2328';

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

function drawBackground(ctx: CanvasRenderingContext2D, h: number, accent: string): void {
	ctx.fillStyle = BASE;
	ctx.fillRect(0, 0, W, h);
	const glow = ctx.createLinearGradient(0, 0, 0, h * 0.7);
	glow.addColorStop(0, hexToRgba(accent, 0.16));
	glow.addColorStop(1, 'rgba(26,14,18,0)');
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, W, h * 0.7);
	ctx.fillStyle = accent;
	ctx.fillRect(0, 0, W, 5);
}

function drawHeader(ctx: CanvasRenderingContext2D, input: WeatherCardInput, accent: string): void {
	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'left';
	ctx.fillStyle = TEXT;
	ctx.font = `800 30px ${FONT}`;
	const label = truncate(ctx, input.locationLabel, 520);
	ctx.fillText(label, PAD, 66);
	const labelW = ctx.measureText(label).width;

	// 범위 뱃지
	ctx.font = `800 18px ${FONT}`;
	const scopeText = SCOPE_LABELS[input.scope];
	const pillW = ctx.measureText(scopeText).width + 34;
	const pillX = PAD + labelW + 18;
	ctx.beginPath();
	ctx.roundRect(pillX, 40, pillW, 36, 18);
	ctx.fillStyle = hexToRgba(accent, 0.18);
	ctx.fill();
	ctx.strokeStyle = hexToRgba(accent, 0.6);
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.fillStyle = TEXT;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(scopeText, pillX + pillW / 2, 59);

	ctx.textAlign = 'right';
	ctx.textBaseline = 'alphabetic';
	if (input.observedAt) {
		ctx.fillStyle = MUTED;
		ctx.font = `500 17px ${FONT}`;
		ctx.fillText(input.observedAt, W - PAD, 64);
	}
	ctx.textAlign = 'left';

	ctx.strokeStyle = LINE;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(PAD, 96);
	ctx.lineTo(W - PAD, 96);
	ctx.stroke();
}

function drawFooter(ctx: CanvasRenderingContext2D, h: number, accent: string): void {
	ctx.textAlign = 'right';
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = MUTED;
	ctx.font = `700 14px ${FONT}`;
	ctx.fillText('SiruBOT', W - PAD, h - 22);
	const sigW = ctx.measureText('SiruBOT').width;
	ctx.beginPath();
	ctx.arc(W - PAD - sigW - 12, h - 27, 4.5, 0, Math.PI * 2);
	ctx.fillStyle = accent;
	ctx.fill();
	ctx.textAlign = 'left';
}

/** 현재·오늘·내일 — 큰 이모지와 기온, 아래에 지표 박스 */
function drawSingle(ctx: CanvasRenderingContext2D, input: WeatherCardInput, accent: string): void {
	const day = input.scope === 'now' ? undefined : input.daily[0];
	const code = input.scope === 'now' ? input.weatherCode : (day?.weatherCode ?? input.weatherCode);
	const text = input.scope === 'now' ? input.weatherText : (day?.weatherText ?? input.weatherText);

	ctx.textBaseline = 'alphabetic';
	ctx.font = `120px ${EMOJI_FONT}`;
	ctx.fillStyle = TEXT;
	ctx.fillText(emojiForCode(code, input.scope === 'now' ? input.isDay : true), PAD, 232);

	const tempX = PAD + 170;
	ctx.fillStyle = TEXT;
	if (input.scope === 'now') {
		ctx.font = `800 118px ${FONT}`;
		ctx.fillText(fmtTemp(input.temperatureC), tempX, 224);
	} else {
		ctx.font = `800 96px ${FONT}`;
		ctx.fillText(fmtTemp(day?.tempMax ?? null), tempX, 216);
		const maxW = ctx.measureText(fmtTemp(day?.tempMax ?? null)).width;
		ctx.fillStyle = MUTED;
		ctx.font = `600 52px ${FONT}`;
		ctx.fillText(`/ ${fmtTemp(day?.tempMin ?? null)}`, tempX + maxW + 18, 216);
	}

	ctx.fillStyle = accent;
	ctx.font = `800 30px ${FONT}`;
	ctx.fillText(truncate(ctx, text || '-', W - PAD * 2 - 170), tempX, 266);
	if (input.scope === 'now' && input.feelsLikeC != null && input.temperatureC != null && Math.abs(input.feelsLikeC - input.temperatureC) >= 0.5) {
		const textW = ctx.measureText(truncate(ctx, text || '-', W - PAD * 2 - 170)).width;
		ctx.fillStyle = MUTED;
		ctx.font = `500 22px ${FONT}`;
		ctx.fillText(`체감 ${fmtTemp(input.feelsLikeC)}`, tempX + textW + 18, 266);
	}

	const metrics = buildMetrics(input, day);
	if (metrics.length === 0) return;
	const top = 296;
	const boxH = 96;
	const gap = 16;
	const boxW = (W - PAD * 2 - gap * (metrics.length - 1)) / metrics.length;
	for (const [i, metric] of metrics.entries()) {
		const x = PAD + i * (boxW + gap);
		ctx.beginPath();
		ctx.roundRect(x, top, boxW, boxH, 16);
		ctx.fillStyle = hexToRgba(accent, 0.1);
		ctx.fill();
		ctx.strokeStyle = hexToRgba(accent, 0.3);
		ctx.lineWidth = 1.5;
		ctx.stroke();
		ctx.fillStyle = MUTED;
		ctx.font = `600 16px ${FONT}`;
		ctx.fillText(`${metric.emoji} ${metric.label}`, x + 20, top + 32);
		ctx.fillStyle = TEXT;
		ctx.font = `800 28px ${FONT}`;
		ctx.fillText(truncate(ctx, metric.value, boxW - 40), x + 20, top + 72);
	}
}

/** 이번 주 — 요일별 7칸. 최고/최저 기온과 강수확률을 한눈에 비교해요. */
function drawWeek(ctx: CanvasRenderingContext2D, input: WeatherCardInput, accent: string): void {
	const days = input.daily.slice(0, 7);
	if (days.length === 0) {
		ctx.fillStyle = MUTED;
		ctx.font = `500 22px ${FONT}`;
		ctx.textAlign = 'center';
		ctx.fillText('예보 정보를 가져올 수 없어요', W / 2, 220);
		ctx.textAlign = 'left';
		return;
	}
	const top = 124;
	const boxH = 296;
	const gap = 12;
	const boxW = (W - PAD * 2 - gap * (days.length - 1)) / days.length;
	for (const [i, day] of days.entries()) {
		const x = PAD + i * (boxW + gap);
		const cx = x + boxW / 2;
		const tone = TONE_COLORS[toneForCode(day.weatherCode)];
		const { weekday, md } = dayLabel(day.date);

		ctx.beginPath();
		ctx.roundRect(x, top, boxW, boxH, 16);
		ctx.fillStyle = hexToRgba(i === 0 ? accent : tone, i === 0 ? 0.16 : 0.08);
		ctx.fill();
		ctx.strokeStyle = hexToRgba(i === 0 ? accent : tone, i === 0 ? 0.55 : 0.25);
		ctx.lineWidth = 1.5;
		ctx.stroke();

		ctx.textAlign = 'center';
		ctx.textBaseline = 'alphabetic';
		ctx.fillStyle = TEXT;
		ctx.font = `800 24px ${FONT}`;
		ctx.fillText(weekday, cx, top + 42);
		ctx.fillStyle = MUTED;
		ctx.font = `500 15px ${FONT}`;
		ctx.fillText(md, cx, top + 64);

		ctx.font = `52px ${EMOJI_FONT}`;
		ctx.fillStyle = TEXT;
		ctx.fillText(emojiForCode(day.weatherCode, true), cx, top + 140);

		ctx.fillStyle = TEXT;
		ctx.font = `800 30px ${FONT}`;
		ctx.fillText(fmtTemp(day.tempMax), cx, top + 190);
		ctx.fillStyle = MUTED;
		ctx.font = `600 22px ${FONT}`;
		ctx.fillText(fmtTemp(day.tempMin), cx, top + 220);

		if (day.precipitationProbabilityMaxPct != null) {
			ctx.fillStyle = TONE_COLORS.rain;
			ctx.font = `700 17px ${FONT}`;
			ctx.fillText(`☔ ${Math.round(day.precipitationProbabilityMaxPct)}%`, cx, top + 262);
		}
	}
	ctx.textAlign = 'left';
}

export async function renderWeatherCard(input: WeatherCardInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();

	const accent =
		TONE_COLORS[
			toneForCode(input.scope === 'now' || input.scope === 'week' ? input.weatherCode : (input.daily[0]?.weatherCode ?? input.weatherCode))
		];
	const H = input.scope === 'week' ? 470 : 440;
	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');

	drawBackground(ctx, H, accent);
	drawHeader(ctx, input, accent);
	if (input.scope === 'week') drawWeek(ctx, input, accent);
	else drawSingle(ctx, input, accent);
	drawFooter(ctx, H, accent);

	return (await canvas.toBuffer('png')) as Buffer;
}
