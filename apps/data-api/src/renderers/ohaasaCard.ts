/**
 * 오늘의 운세 카드 렌더러 — skia-canvas로 별자리 운세를 투명 배경 PNG로 그려요.
 * Discord 컨테이너 위에 그대로 얹히도록 배경·별밭·테두리 박스 없이 텍스트와 구분선만 써요(글자색은 다크 테마 기준).
 * 카드는 시각 요약(별자리·순위·행운의 아이템/열쇠·날짜)만 담아요. 날씨 카드와 같은 폭·헤더·구분선 규칙을 따라요. 운세 설명 전문과
 * 럭키 컬러 같은 정보성 본문은 봇이 텍스트로 내려요 — 같은 /v1/ohaasa 한 건에서
 * 이미지와 텍스트가 갈라져서 중복·불일치가 생기지 않아요.
 * 별자리 기호는 lucide 스타일 stroke 아이콘(canvas/icons.ts)을 별자리 테마색으로 그려요.
 * 별자리 테마(12별자리 팔레트) ZODIAC_THEMES는 이 파일이 소유해요(구 profileCard.ts에서 이전).
 */
import type { Canvas, CanvasRenderingContext2D } from 'skia-canvas';
import { drawIcon, ensureKoreanFont, truncate, type IconName } from './canvasUtils.ts';
import { ZODIAC_MAP } from '../providers/types.ts';

interface ZodiacTheme {
	primary: string;
	soft: string;
}

const ZODIAC_THEMES: Record<string, ZodiacTheme> = {
	'01': { primary: '#fb7185', soft: '#fda4af' }, // 양자리 — 로즈
	'02': { primary: '#e8a87c', soft: '#f4c9a5' }, // 황소자리 — 살구
	'03': { primary: '#f0abfc', soft: '#f5e0ff' }, // 쌍둥이자리 — 라일락
	'04': { primary: '#93c5fd', soft: '#dbeafe' }, // 게자리 — 스카이
	'05': { primary: '#fbbf24', soft: '#fde68a' }, // 사자자리 — 골드
	'06': { primary: '#a3e635', soft: '#ecfccb' }, // 처녀자리 — 라임
	'07': { primary: '#f9a8d4', soft: '#fce7f3' }, // 천칭자리 — 블룸(브랜드 톤)
	'08': { primary: '#e879f9', soft: '#fae8ff' }, // 전갈자리 — 푸시아
	'09': { primary: '#fb923c', soft: '#ffedd5' }, // 사수자리 — 오렌지
	'10': { primary: '#d4a574', soft: '#f0e2cf' }, // 염소자리 — 세컨더리 톤
	'11': { primary: '#67e8f9', soft: '#cffafe' }, // 물병자리 — 아쿠아
	'12': { primary: '#c084fc', soft: '#f3e8ff' } // 물고기자리 — 바이올렛
};

export interface OhaasaCardInput {
	/** '01'~'12' — ZODIAC_MAP 코드 */
	zodiacCode: string;
	/** 1~12위 */
	rank: number;
	/** 행운의 아이템 — 없으면 칸 생략. 럭키 컬러는 카드에 넣지 않아요(텍스트 본문 전용). */
	luckyItem?: string;
	/** 행운의 열쇠 — 없으면 칸 생략 */
	luckyKey?: string;
	/** "10월 5일" 같은 표시용 날짜 (없으면 생략) */
	date?: string;
}

export interface OhaasaTopCardInput {
	/** 1~3위 순서대로 — 최대 3건 */
	items: Array<{ zodiacCode: string; rank: number }>;
	date?: string;
}

const FONT = '"Pretendard JP", "Twemoji Mozilla", sans-serif';
const TEXT = '#f2f3f5';
const MUTED = '#949ba4';
const LINE = 'rgba(255,255,255,0.1)';

const W = 960;
const PAD = 16;

/** 별자리 코드('01'~'12') 순서의 lucide 스타일 벡터 아이콘 이름 */
const ZODIAC_ICON_NAMES = [
	'aries',
	'taurus',
	'gemini',
	'cancer',
	'leo',
	'virgo',
	'libra',
	'scorpio',
	'sagittarius',
	'capricorn',
	'aquarius',
	'pisces'
] as const;

function zodiacIcon(code: string): IconName {
	return `zodiac-${ZODIAC_ICON_NAMES[Number.parseInt(code, 10) - 1] ?? 'pisces'}`;
}

/** 순위 → 별 개수(1~5). 상위일수록 꽉 찬 별을 보여줘요. */
export function starsForRank(rank: number): number {
	if (rank <= 2) return 5;
	if (rank <= 4) return 4;
	if (rank <= 8) return 3;
	if (rank <= 10) return 2;
	return 1;
}

function setupContext(canvas: Canvas) {
	const ctx = canvas.getContext('2d');
	// 라이트 테마에서도 글자가 읽히도록 옅은 그림자를 깔아요(다크에서는 거의 보이지 않아요).
	ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 1;
	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'left';
	return ctx;
}

function drawHeader(ctx: CanvasRenderingContext2D, title: string, date?: string): void {
	ctx.textAlign = 'left';
	ctx.fillStyle = MUTED;
	ctx.font = `700 20px ${FONT}`;
	ctx.fillText(title, PAD, 34);
	if (date) {
		ctx.textAlign = 'right';
		ctx.font = `500 17px ${FONT}`;
		ctx.fillText(date, W - PAD, 34);
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

function drawStars(ctx: CanvasRenderingContext2D, x: number, y: number, filled: number, color: string): void {
	for (let i = 0; i < 5; i += 1) {
		const sx = x + i * 28;
		if (i < filled) drawIcon(ctx, 'star', sx, y, 22, color, { fill: true });
		else drawIcon(ctx, 'star', sx, y, 22, 'rgba(255,255,255,0.22)', { strokeWidth: 1.6 });
	}
}

interface LuckyBox {
	icon: 'gift' | 'key';
	label: string;
	value: string;
}

/** 별자리 한 개 — 큰 별자리 기호·이름·별점, 오른쪽에 큰 순위, 아래에 럭키 열 */
export async function renderOhaasaCard(input: OhaasaCardInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();

	const theme = ZODIAC_THEMES[input.zodiacCode] ?? ZODIAC_THEMES['12']!;
	const zodiac = ZODIAC_MAP[input.zodiacCode] ?? ZODIAC_MAP['12']!;

	const item = (input.luckyItem ?? '').trim();
	const key = (input.luckyKey ?? '').trim();
	const boxes: LuckyBox[] = [];
	if (item) boxes.push({ icon: 'gift', label: '행운의 아이템', value: item });
	if (key) boxes.push({ icon: 'key', label: '행운의 열쇠', value: key });

	const H = boxes.length > 0 ? 304 : 210;
	const canvas: Canvas = new Canvas(W, H);
	const ctx = setupContext(canvas);

	drawHeader(ctx, '오늘의 운세', input.date);

	// 왼쪽: 별자리 기호 + 이름(한/일) + 별점
	drawIcon(ctx, zodiacIcon(input.zodiacCode), PAD + 8, 62, 104, theme.primary, { strokeWidth: 1.7 });

	// 오른쪽: 큰 순위 — '위'를 먼저 오른쪽 끝에 붙이고 숫자를 그 왼쪽에 놓아요
	ctx.textAlign = 'right';
	ctx.fillStyle = MUTED;
	ctx.font = `800 40px ${FONT}`;
	ctx.fillText('위', W - PAD, 150);
	const unitW = ctx.measureText('위').width;
	ctx.fillStyle = theme.primary;
	ctx.font = `800 112px ${FONT}`;
	const rankText = String(input.rank);
	ctx.fillText(rankText, W - PAD - unitW - 8, 150);
	const rankW = ctx.measureText(rankText).width + unitW + 8;
	ctx.textAlign = 'left';

	const nameX = PAD + 150;
	const nameMax = W - PAD * 2 - 150 - rankW - 24;
	ctx.fillStyle = TEXT;
	ctx.font = `800 46px ${FONT}`;
	ctx.fillText(truncate(ctx, zodiac.ko, nameMax), nameX, 112);
	ctx.fillStyle = MUTED;
	ctx.font = `600 22px ${FONT}`;
	ctx.fillText(truncate(ctx, zodiac.jp, nameMax), nameX, 144);
	drawStars(ctx, nameX, 160, starsForRank(input.rank), theme.primary);

	if (boxes.length === 0) return (await canvas.toBuffer('png')) as Buffer;

	// 구분선 + 럭키 열: 구분선으로 나누고 박스는 쓰지 않아요
	const top = 204;
	ctx.strokeStyle = LINE;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(PAD, top);
	ctx.lineTo(W - PAD, top);
	ctx.stroke();
	const colW = (W - PAD * 2) / boxes.length;
	for (const [i, box] of boxes.entries()) {
		const x = PAD + i * colW + (i === 0 ? 0 : 24);
		if (i > 0) vLine(ctx, PAD + i * colW, top + 18, top + 84);
		drawIcon(ctx, box.icon, x, top + 24, 18, theme.primary);
		ctx.fillStyle = MUTED;
		ctx.font = `600 16px ${FONT}`;
		ctx.fillText(box.label, x + 26, top + 40);
		ctx.fillStyle = TEXT;
		ctx.font = `800 28px ${FONT}`;
		ctx.fillText(truncate(ctx, box.value, colW - 48), x, top + 80);
	}

	return (await canvas.toBuffer('png')) as Buffer;
}

/** TOP 3 — 순위·별자리 기호·이름을 3열로 나란히 보여줘요 */
export async function renderOhaasaTopCard(input: OhaasaTopCardInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();

	const items = input.items.slice(0, 3);
	const H = 290;
	const canvas: Canvas = new Canvas(W, H);
	const ctx = setupContext(canvas);

	drawHeader(ctx, '오늘의 운세 TOP 3', input.date);

	const top = 56;
	const colW = (W - PAD * 2) / Math.max(items.length, 1);
	for (const [i, entry] of items.entries()) {
		const theme = ZODIAC_THEMES[entry.zodiacCode] ?? ZODIAC_THEMES['12']!;
		const zodiac = ZODIAC_MAP[entry.zodiacCode] ?? ZODIAC_MAP['12']!;
		const cx = PAD + i * colW + colW / 2;
		if (i > 0) vLine(ctx, PAD + i * colW, top + 4, top + 226);

		ctx.textAlign = 'center';
		// 순위 — 1위에는 왕관을 얹어요
		ctx.fillStyle = theme.primary;
		ctx.font = `800 60px ${FONT}`;
		ctx.fillText(`${entry.rank}`, cx - 14, top + 62);
		ctx.fillStyle = MUTED;
		ctx.font = `800 26px ${FONT}`;
		ctx.fillText('위', cx + ctx.measureText(`${entry.rank}`).width / 2 + 6, top + 62);
		if (entry.rank === 1) drawIcon(ctx, 'crown', cx - 26, top - 2, 24, theme.primary, { fill: true });

		drawIcon(ctx, zodiacIcon(entry.zodiacCode), cx - 36, top + 84, 72, theme.primary, { strokeWidth: 1.7 });

		ctx.fillStyle = TEXT;
		ctx.font = `800 30px ${FONT}`;
		ctx.fillText(truncate(ctx, zodiac.ko, colW - 48), cx, top + 188);
		ctx.fillStyle = MUTED;
		ctx.font = `600 18px ${FONT}`;
		ctx.fillText(truncate(ctx, zodiac.jp, colW - 48), cx, top + 218);
	}
	ctx.textAlign = 'left';

	return (await canvas.toBuffer('png')) as Buffer;
}
