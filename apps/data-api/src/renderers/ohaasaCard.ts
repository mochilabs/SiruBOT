/**
 * 오늘의 운세 카드 렌더러 — skia-canvas로 별자리 운세를 투명 배경 PNG로 그려요.
 * Discord 컨테이너 위에 그대로 얹히도록 배경·별밭·테두리 박스 없이 텍스트와 구분선만 써요(글자색은 다크 테마 기준).
 * 카드는 시각 요약(별자리·순위·행운의 아이템/열쇠·날짜)만 담아요. 운세 설명 전문과
 * 럭키 컬러 같은 정보성 본문은 봇이 텍스트로 내려요 — 같은 /v1/ohaasa 한 건에서
 * 이미지와 텍스트가 갈라져서 중복·불일치가 생기지 않아요.
 * 별자리 테마(12별자리 팔레트) ZODIAC_THEMES는 이 파일이 소유해요(구 profileCard.ts에서 이전).
 */
import type { Canvas } from 'skia-canvas';
import { ensureKoreanFont, truncate } from './canvasUtils.ts';
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
}

const FONT = '"Pretendard JP", "Twemoji Mozilla", sans-serif';
const TEXT = '#f2f3f5';
const MUTED = '#949ba4';
const LINE = 'rgba(255,255,255,0.1)';

export async function renderOhaasaCard(input: OhaasaCardInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();

	const theme = ZODIAC_THEMES[input.zodiacCode] ?? ZODIAC_THEMES['12'];
	const zodiac = ZODIAC_MAP[input.zodiacCode] ?? ZODIAC_MAP['12'];

	const W = 920;
	const PAD = 16;

	// 럭키 칸 구성: 아이템/열쇠만, 컬러는 카드에서 뺐어요
	const item = (input.luckyItem ?? '').trim();
	const key = (input.luckyKey ?? '').trim();
	const boxes: LuckyBox[] = [];
	if (item) boxes.push({ label: '행운의 아이템', value: item });
	if (key) boxes.push({ label: '행운의 열쇠', value: key });

	const H = boxes.length > 0 ? 230 : 150;
	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');
	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'left';

	// 상단 줄: 타이틀 + 날짜
	ctx.fillStyle = MUTED;
	ctx.font = `700 20px ${FONT}`;
	ctx.fillText('오늘의 운세', PAD, 34);
	if (input.date) {
		ctx.textAlign = 'right';
		ctx.font = `500 17px ${FONT}`;
		ctx.fillText(input.date, W - PAD, 34);
		ctx.textAlign = 'left';
	}

	// 별자리 이름(좌) + 순위(우, 별자리 색)
	ctx.fillStyle = TEXT;
	ctx.font = `800 48px ${FONT}`;
	ctx.fillText(truncate(ctx, zodiac.jp ? `${zodiac.ko} · ${zodiac.jp}` : zodiac.ko, W - PAD * 2 - 160), PAD, 98);
	ctx.textAlign = 'right';
	ctx.fillStyle = theme.primary;
	ctx.font = `800 56px ${FONT}`;
	ctx.fillText(`${input.rank}위`, W - PAD, 98);
	ctx.textAlign = 'left';

	if (boxes.length === 0) {
		ctx.fillStyle = MUTED;
		ctx.font = `500 20px ${FONT}`;
		ctx.fillText('오늘의 럭키 정보가 없어요', PAD, 134);
		return (await canvas.toBuffer('png')) as Buffer;
	}

	// 구분선 + 럭키 열: 구분선으로 나누고 박스는 쓰지 않아요
	const top = 124;
	ctx.strokeStyle = LINE;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(PAD, top);
	ctx.lineTo(W - PAD, top);
	ctx.stroke();
	const colW = (W - PAD * 2) / boxes.length;
	for (const [i, box] of boxes.entries()) {
		const x = PAD + i * colW + (i === 0 ? 0 : 24);
		if (i > 0) {
			ctx.beginPath();
			ctx.moveTo(PAD + i * colW, top + 18);
			ctx.lineTo(PAD + i * colW, top + 88);
			ctx.stroke();
		}
		ctx.fillStyle = MUTED;
		ctx.font = `600 16px ${FONT}`;
		ctx.fillText(box.label, x, top + 42);
		ctx.fillStyle = TEXT;
		ctx.font = `800 28px ${FONT}`;
		ctx.fillText(truncate(ctx, box.value, colW - 48), x, top + 84);
	}

	return (await canvas.toBuffer('png')) as Buffer;
}
