/**
 * 날씨 카드 렌더러 — skia-canvas로 현재·오늘·내일 날씨(큰 기온 + 지표 열)와 이번 주 예보(7열)를 투명 배경 PNG로 그려요.
 * 스키마는 routes/weatherCardSchema.ts가 소유하고, 봇은 이미지 아래에 출처 푸터를 텍스트로 붙여요.
 */
import type { Canvas, CanvasRenderingContext2D } from 'skia-canvas';
import type { WeatherCardInput } from '../routes/weatherCardSchema.ts';
import { ensureKoreanFont, truncate } from './canvasUtils.ts';

type DailyDay = WeatherCardInput['daily'][number];

const FONT = '"Pretendard JP", "Twemoji Mozilla", sans-serif';
const EMOJI_FONT = '"Twemoji Mozilla", sans-serif';

const W = 960;
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

function drawHeader(ctx: CanvasRenderingContext2D, input: WeatherCardInput): void {
	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'left';
	ctx.fillStyle = MUTED;
	ctx.font = `700 20px ${FONT}`;
	ctx.fillText(truncate(ctx, `${input.locationLabel} · ${SCOPE_LABELS[input.scope]}`, 620), PAD, 34);
	if (input.observedAt) {
		ctx.textAlign = 'right';
		ctx.font = `500 17px ${FONT}`;
		ctx.fillText(input.observedAt, W - PAD, 34);
		ctx.textAlign = 'left';
	}
}

function vLine(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number): void {
	ctx.strokeStyle = LINE;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x, y1);
	ctx.lineTo(x, y2);
	ctx.stroke();
}

/** 현재·오늘·내일 — 큰 이모지와 기온, 아래에 구분선으로 나눈 지표 열 */
function drawSingle(ctx: CanvasRenderingContext2D, input: WeatherCardInput, accent: string): void {
	const day = input.scope === 'now' ? undefined : input.daily[0];
	const code = input.scope === 'now' ? input.weatherCode : (day?.weatherCode ?? input.weatherCode);
	const text = input.scope === 'now' ? input.weatherText : (day?.weatherText ?? input.weatherText);

	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = TEXT;
	ctx.font = `104px ${EMOJI_FONT}`;
	ctx.fillText(emojiForCode(code, input.scope === 'now' ? input.isDay : true), PAD, 160);

	const tempX = PAD + 150;
	ctx.fillStyle = TEXT;
	if (input.scope === 'now') {
		ctx.font = `800 108px ${FONT}`;
		ctx.fillText(fmtTemp(input.temperatureC), tempX, 148);
	} else {
		ctx.font = `800 92px ${FONT}`;
		const maxText = fmtTemp(day?.tempMax ?? null);
		ctx.fillText(maxText, tempX, 144);
		const maxW = ctx.measureText(maxText).width;
		ctx.fillStyle = MUTED;
		ctx.font = `600 48px ${FONT}`;
		ctx.fillText(`/ ${fmtTemp(day?.tempMin ?? null)}`, tempX + maxW + 16, 144);
	}

	const label = truncate(ctx, text || '-', W - PAD * 2 - 150);
	ctx.fillStyle = accent;
	ctx.font = `800 28px ${FONT}`;
	ctx.fillText(label, tempX, 192);
	if (input.scope === 'now' && input.feelsLikeC != null && input.temperatureC != null && Math.abs(input.feelsLikeC - input.temperatureC) >= 0.5) {
		const labelW = ctx.measureText(label).width;
		ctx.fillStyle = MUTED;
		ctx.font = `500 21px ${FONT}`;
		ctx.fillText(`체감 ${fmtTemp(input.feelsLikeC)}`, tempX + labelW + 16, 192);
	}

	const metrics = buildMetrics(input, day);
	if (metrics.length === 0) return;
	const top = 220;
	ctx.strokeStyle = LINE;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(PAD, top);
	ctx.lineTo(W - PAD, top);
	ctx.stroke();
	const colW = (W - PAD * 2) / metrics.length;
	for (const [i, metric] of metrics.entries()) {
		const x = PAD + i * colW + (i === 0 ? 0 : 24);
		if (i > 0) vLine(ctx, PAD + i * colW, top + 18, top + 84);
		ctx.fillStyle = MUTED;
		ctx.font = `600 16px ${FONT}`;
		ctx.fillText(`${metric.emoji} ${metric.label}`, x, top + 40);
		ctx.fillStyle = TEXT;
		ctx.font = `800 28px ${FONT}`;
		ctx.fillText(truncate(ctx, metric.value, colW - 40), x, top + 80);
	}
}

/** 이번 주 — 요일별 7열. 최고/최저 기온과 강수확률을 한눈에 비교해요. 오늘은 요일 밑줄로 표시해요. */
function drawWeek(ctx: CanvasRenderingContext2D, input: WeatherCardInput, accent: string): void {
	const days = input.daily.slice(0, 7);
	ctx.textBaseline = 'alphabetic';
	if (days.length === 0) {
		ctx.fillStyle = MUTED;
		ctx.font = `500 22px ${FONT}`;
		ctx.textAlign = 'center';
		ctx.fillText('예보 정보를 가져올 수 없어요', W / 2, 160);
		ctx.textAlign = 'left';
		return;
	}
	const top = 56;
	const colW = (W - PAD * 2) / days.length;
	for (const [i, day] of days.entries()) {
		const cx = PAD + i * colW + colW / 2;
		const { weekday, md } = dayLabel(day.date);
		if (i > 0) vLine(ctx, PAD + i * colW, top + 4, top + 244);

		ctx.textAlign = 'center';
		ctx.fillStyle = TEXT;
		ctx.font = `800 24px ${FONT}`;
		ctx.fillText(weekday, cx, top + 34);
		if (i === 0) {
			ctx.fillStyle = accent;
			ctx.fillRect(cx - 14, top + 44, 28, 3);
		}
		ctx.fillStyle = MUTED;
		ctx.font = `500 15px ${FONT}`;
		ctx.fillText(md, cx, top + 72);

		ctx.fillStyle = TEXT;
		ctx.font = `52px ${EMOJI_FONT}`;
		ctx.fillText(emojiForCode(day.weatherCode, true), cx, top + 140);

		ctx.fillStyle = TEXT;
		ctx.font = `800 30px ${FONT}`;
		ctx.fillText(fmtTemp(day.tempMax), cx, top + 188);
		ctx.fillStyle = MUTED;
		ctx.font = `600 22px ${FONT}`;
		ctx.fillText(fmtTemp(day.tempMin), cx, top + 218);

		if (day.precipitationProbabilityMaxPct != null) {
			ctx.fillStyle = TONE_COLORS.rain;
			ctx.font = `700 17px ${FONT}`;
			ctx.fillText(`☔ ${Math.round(day.precipitationProbabilityMaxPct)}%`, cx, top + 250);
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
	const H = input.scope === 'week' ? 330 : 320;
	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');
	// 라이트 테마에서도 글자가 읽히도록 옅은 그림자를 깔아요(다크에서는 거의 보이지 않아요).
	ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 1;

	drawHeader(ctx, input);
	if (input.scope === 'week') drawWeek(ctx, input, accent);
	else drawSingle(ctx, input, accent);

	return (await canvas.toBuffer('png')) as Buffer;
}
