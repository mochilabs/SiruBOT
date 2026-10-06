/**
 * 오늘의 운세 카드 렌더러 — skia-canvas로 별자리 운세를 카드 이미지로 그려요.
 * 별자리 테마(12별자리 팔레트)는 profileCard.ts의 ZODIAC_THEMES를 그대로 재사용해요.
 * 데이터는 data-api의 ohaasa 프로바이더/스케줄러에서 이미 갖고 있어요 — 봇은
 * /v1/ohaasa 결과(horoscope 1건)를 그대로 POST하면 돼요. 실패하면 텍스트 카드로 폴백.
 */
import type { Canvas, CanvasRenderingContext2D } from 'skia-canvas';
import { ensureKoreanFont, hexToRgba, truncate } from './canvasUtils.ts';
import { ZODIAC_THEMES } from './profileCard.ts';
import { ZODIAC_MAP } from '../providers/types.ts';

export interface OhaasaCardInput {
	/** '01'~'12' — ZODIAC_MAP 코드 */
	zodiacCode: string;
	/** 1~12위 */
	rank: number;
	/** 번역된 운세 본문 */
	content: string;
	/** 럭키 아이템/컬러 문자열 (없으면 빈 문자열) */
	lucky: string;
	/** "10월 5일" 같은 표시용 날짜 (없으면 생략) */
	date: string;
}

/** 단어/문자 단위 줄바꿈 — 한국어 텍스트에 안전해요. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
	const lines: string[] = [];
	let current = '';
	const push = (line: string) => {
		if (lines.length < maxLines) lines.push(line);
	};
	for (const ch of text.replace(/\r/g, '')) {
		if (ch === '\n') {
			push(current);
			current = '';
			continue;
		}
		if (ctx.measureText(current + ch).width > maxWidth && current.length > 0) {
			const lastSpace = current.lastIndexOf(' ');
			if (lastSpace > 0) {
				push(current.slice(0, lastSpace));
				current = current.slice(lastSpace + 1) + ch;
			} else {
				push(current);
				current = ch;
			}
			if (lines.length >= maxLines) break;
		} else {
			current += ch;
		}
	}
	if (lines.length < maxLines && current.trim()) push(current);
	// 마지막 줄이 잘렸으면 말줄임
	if (lines.length === maxLines) {
		lines[maxLines - 1] = truncate(ctx, lines[maxLines - 1].trimEnd(), maxWidth);
	}
	return lines;
}

/** 밤하늘 별밭 — 시드 없이 매번 살짝 다르게 (카드별 개성용). */
function drawStarfield(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
	let s = seed || 7;
	const rnd = () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
	for (let i = 0; i < 70; i++) {
		const x = rnd() * w;
		const y = rnd() * h;
		const r = 0.4 + rnd() * 1.6;
		ctx.save();
		ctx.globalAlpha = 0.1 + rnd() * 0.4;
		ctx.fillStyle = '#ffffff';
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
}

export async function renderOhaasaCard(input: OhaasaCardInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();

	const theme = ZODIAC_THEMES[input.zodiacCode] ?? ZODIAC_THEMES['12'];
	const zodiac = ZODIAC_MAP[input.zodiacCode] ?? ZODIAC_MAP['12'];

	const W = 920;
	const PAD = 48;

	// ── 텍스트 먼저 래핑해서 높이 계산 ──
	const meas = new Canvas(1, 1).getContext('2d');
	meas.font = '400 24px "Noto Sans KR", sans-serif';
	const textW = W - PAD * 2;
	const lines = wrapText(meas, input.content, textW, 6);
	const luckyLines = input.lucky ? wrapText(meas, input.lucky, textW, 2) : [];

	const HEADER_H = 150;
	const CONTENT_H = lines.length * 38 + 24;
	const LUCKY_H = luckyLines.length > 0 ? luckyLines.length * 30 + 56 : 0;
	const H = HEADER_H + CONTENT_H + LUCKY_H + 84;

	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');

	// ── 배경: 다크 베이스 + 별자리 틴트 ──
	ctx.fillStyle = '#1a0e12';
	ctx.fillRect(0, 0, W, H);
	const headGrad = ctx.createLinearGradient(0, 0, 0, HEADER_H + 40);
	headGrad.addColorStop(0, hexToRgba(theme.primary, 0.16));
	headGrad.addColorStop(0.7, hexToRgba(theme.primary, 0.04));
	headGrad.addColorStop(1, 'rgba(26,14,18,0)');
	ctx.fillStyle = headGrad;
	ctx.fillRect(0, 0, W, HEADER_H + 40);
	drawStarfield(ctx, W, HEADER_H + 40, Number(input.zodiacCode) * 7919);

	// 상단 브랜드 액센트 바
	const accent = ctx.createLinearGradient(0, 0, W, 0);
	accent.addColorStop(0, theme.primary);
	accent.addColorStop(1, hexToRgba(theme.soft, 0.9));
	ctx.fillStyle = accent;
	ctx.fillRect(0, 0, W, 5);

	// ── 헤더: 타이틀 + 날짜 ──
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = '#fce7f3';
	ctx.font = '800 26px "Noto Sans KR", sans-serif';
	ctx.fillText('오늘의 운세', PAD, 58);
	if (input.date) {
		ctx.textAlign = 'right';
		ctx.fillStyle = '#c9a8b5';
		ctx.font = '500 19px "Noto Sans KR", sans-serif';
		ctx.fillText(input.date, W - PAD, 56);
		ctx.textAlign = 'left';
	}

	// ── 별자리 이름 + 순위 뱃지 ──
	const nameY = 118;
	ctx.fillStyle = theme.primary;
	ctx.font = '800 44px "Noto Sans KR", sans-serif';
	const zodiacText = zodiac.jp ? `${zodiac.ko} · ${zodiac.jp}` : zodiac.ko;
	ctx.fillText(zodiacText, PAD, nameY);

	// 순위 뱃지 (이름 오른쪽)
	const nameW = ctx.measureText(zodiacText).width;
	const rankText = `${input.rank}위`;
	ctx.save();
	ctx.font = '800 19px "Noto Sans KR", sans-serif';
	const rw = ctx.measureText(rankText).width + 40;
	const rx = PAD + nameW + 24;
	const ry = nameY - 34;
	ctx.beginPath();
	ctx.roundRect(rx, ry, rw, 40, 20);
	ctx.fillStyle = hexToRgba(theme.primary, 0.18);
	ctx.fill();
	ctx.strokeStyle = hexToRgba(theme.primary, 0.6);
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.fillStyle = theme.soft;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(rankText, rx + rw / 2, ry + 21);
	ctx.restore();
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	// 구분선
	ctx.strokeStyle = '#3d2328';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(PAD, HEADER_H - 8);
	ctx.lineTo(W - PAD, HEADER_H - 8);
	ctx.stroke();

	// ── 운세 본문 ──
	ctx.fillStyle = '#fce7f3';
	ctx.font = '400 24px "Noto Sans KR", sans-serif';
	lines.forEach((line, i) => {
		ctx.fillText(line, PAD, HEADER_H + 36 + i * 38);
	});

	// ── 럭키 아이템 ──
	if (luckyLines.length > 0) {
		const ly = HEADER_H + 36 + lines.length * 38 + 18;
		ctx.fillStyle = hexToRgba(theme.primary, 0.12);
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(PAD, ly - 30, W - PAD * 2, luckyLines.length * 30 + 36, 14);
		ctx.fill();
		ctx.strokeStyle = hexToRgba(theme.primary, 0.35);
		ctx.lineWidth = 1.5;
		ctx.stroke();
		ctx.restore();
		ctx.fillStyle = theme.soft;
		ctx.font = '600 20px "Noto Sans KR", sans-serif';
		luckyLines.forEach((line, i) => {
			ctx.fillText(`🍀 ${line}`, PAD + 24, ly + i * 30);
		});
	}

	// ── 하단 시그니처 ──
	ctx.textAlign = 'right';
	ctx.fillStyle = '#c9a8b5';
	ctx.font = '700 14px "Noto Sans KR", sans-serif';
	ctx.fillText('SiruBOT', W - PAD, H - 24);
	const sigW = ctx.measureText('SiruBOT').width;
	ctx.save();
	ctx.beginPath();
	ctx.arc(W - PAD - sigW - 12, H - 29, 4.5, 0, Math.PI * 2);
	ctx.fillStyle = theme.primary;
	ctx.fill();
	ctx.restore();

	return (await canvas.toBuffer('png')) as Buffer;
}
