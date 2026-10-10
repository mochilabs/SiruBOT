/**
 * 오늘의 운세 카드 렌더러 — skia-canvas로 별자리 운세를 요약 카드 이미지로 그려요.
 * 카드는 시각 요약(별자리·순위·행운의 아이템/열쇠·날짜)만 담아요. 운세 설명 전문과
 * 럭키 컬러 같은 정보성 본문은 봇이 텍스트로 내려요 — 같은 /v1/ohaasa 한 건에서
 * 이미지와 텍스트가 갈라져서 중복·불일치가 생기지 않아요.
 * 별자리 테마(12별자리 팔레트)는 profileCard.ts의 ZODIAC_THEMES를 그대로 재사용해요.
 */
import type { Canvas, CanvasRenderingContext2D } from 'skia-canvas';
import { drawIcon, ensureKoreanFont, hexToRgba, truncate } from './canvasUtils.ts';
import { ZODIAC_THEMES } from './profileCard.ts';
import { ZODIAC_MAP } from '../providers/types.ts';

export interface OhaasaCardInput {
	/** '01'~'12' — ZODIAC_MAP 코드 */
	zodiacCode: string;
	/** 1~12위 */
	rank: number;
	/** 행운의 아이템 — 없으면 박스 생략. 럭키 컬러는 카드에 넣지 않아요(텍스트 본문 전용). */
	luckyItem?: string;
	/** 행운의 열쇠 — 없으면 박스 생략 */
	luckyKey?: string;
	/** "10월 5일" 같은 표시용 날짜 (없으면 생략) */
	date?: string;
}

interface LuckyBox {
	label: string;
	value: string;
	icon: 'sparkles' | 'star';
}

/** 밤하늘 별밭 — 시드 없이 매번 살짝 다르게 (카드별 개성용). */
function drawStarfield(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
	let s = seed || 7;
	const rnd = () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
	for (let i = 0; i < 84; i++) {
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
	const HEADER_H = 150;
	const BOX_H = 118;

	// ── 럭키 박스 구성 — 아이템/열쇠만, 컬러는 카드에서 뺐어요 ──
	const item = (input.luckyItem ?? '').trim();
	const key = (input.luckyKey ?? '').trim();
	const boxes: LuckyBox[] = [];
	if (item) boxes.push({ label: '행운의 아이템', value: item, icon: 'sparkles' });
	if (key) boxes.push({ label: '행운의 열쇠', value: key, icon: 'star' });

	const boxesTop = HEADER_H + 38;
	const H = boxes.length > 0 ? boxesTop + BOX_H + 90 : 300;

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
	// 하단 틴트 — 설명 본문이 빠진 자리를 헤더와 대칭으로 메워요
	const footGrad = ctx.createLinearGradient(0, H, 0, H - 150);
	footGrad.addColorStop(0, hexToRgba(theme.primary, 0.1));
	footGrad.addColorStop(1, 'rgba(26,14,18,0)');
	ctx.fillStyle = footGrad;
	ctx.fillRect(0, H - 150, W, 150);
	drawStarfield(ctx, W, H, Number(input.zodiacCode) * 7919);

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
	const nameY = 124;
	ctx.fillStyle = theme.primary;
	ctx.font = '800 50px "Noto Sans KR", sans-serif';
	const zodiacText = zodiac.jp ? `${zodiac.ko} · ${zodiac.jp}` : zodiac.ko;
	ctx.fillText(zodiacText, PAD, nameY);

	// 순위 뱃지 (이름 오른쪽, 이전보다 크게)
	const nameW = ctx.measureText(zodiacText).width;
	ctx.save();
	ctx.font = '800 20px "Noto Sans KR", sans-serif';
	const rankText = `${input.rank}위`;
	const rw = ctx.measureText(rankText).width + 44;
	const rx = PAD + nameW + 24;
	const ry = nameY - 40;
	ctx.beginPath();
	ctx.roundRect(rx, ry, rw, 46, 23);
	ctx.fillStyle = hexToRgba(theme.primary, 0.18);
	ctx.fill();
	ctx.strokeStyle = hexToRgba(theme.primary, 0.6);
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.fillStyle = theme.soft;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(rankText, rx + rw / 2, ry + 24);
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

	// ── 럭키 박스 (아이템/열쇠) — 2개면 나란히, 1개면 와이드 ──
	if (boxes.length > 0) {
		const gap = 20;
		const boxW = boxes.length === 2 ? (W - PAD * 2 - gap) / 2 : W - PAD * 2;
		for (const [i, box] of boxes.entries()) {
			const bx = PAD + i * (boxW + gap);

			ctx.save();
			ctx.beginPath();
			ctx.roundRect(bx, boxesTop, boxW, BOX_H, 16);
			ctx.fillStyle = hexToRgba(theme.primary, 0.12);
			ctx.fill();
			ctx.strokeStyle = hexToRgba(theme.primary, 0.35);
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.restore();

			// 라벨 + 벡터 아이콘 (이모지 폰트가 없어서 lucide 아이콘으로 그려요)
			const iconSize = 16;
			const innerX = bx + 24;
			ctx.fillStyle = '#c9a8b5';
			ctx.font = '600 15px "Noto Sans KR", sans-serif';
			const labelY = boxesTop + 34;
			drawIcon(ctx, box.icon, innerX, labelY - 5 - iconSize / 2, iconSize, theme.soft);
			ctx.fillText(box.label, innerX + iconSize + 8, labelY);

			ctx.fillStyle = theme.soft;
			ctx.font = '700 26px "Noto Sans KR", sans-serif';
			ctx.fillText(truncate(ctx, box.value, boxW - 48), innerX, boxesTop + 78);
		}
	} else {
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#c9a8b5';
		ctx.font = '500 22px "Noto Sans KR", sans-serif';
		ctx.fillText('오늘의 럭키 정보가 없어요', W / 2, (HEADER_H + H) / 2);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
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
