/**
 * 오늘의 운세 카드 렌더러(Takumi) — 별자리 운세를 투명 배경 PNG로 그려요.
 * Discord 컨테이너 위에 그대로 얹히도록 배경·별밭·테두리 박스 없이 텍스트와 구분선만 써요(글자색은 다크 테마 기준).
 * 카드는 시각 요약(별자리·순위·행운의 아이템/열쇠·날짜)만 담아요. 날씨 카드와 같은 폭·헤더·구분선 규칙을 따라요. 운세 설명 전문과
 * 럭키 컬러 같은 정보성 본문은 봇이 텍스트로 내려요 — 같은 /v1/ohaasa 한 건에서
 * 이미지와 텍스트가 갈라져서 중복·불일치가 생기지 않아요.
 * 별자리 기호는 lucide 스타일 stroke 아이콘(icons.ts)을 별자리 테마색으로 그려요.
 * 별자리 테마(12별자리 팔레트) ZODIAC_THEMES는 이 파일이 소유해요.
 * 디스코드 컨테이너 위에 얹히는 카드라 대시보드 토큰 대신 디스코드 다크 텍스트 톤을 따라요.
 */
import type { CSSProperties, ReactNode } from 'react';
import { CARD_FONT } from '@sirubot/cards';
import { ZODIAC_MAP } from '../../providers/types.ts';
import type { IconName } from '../shared/icons.ts';
import { Box, Icon, renderCardPng } from '../shared/takumiKit.tsx';

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

const TEXT = '#f2f3f5';
const MUTED = '#949ba4';
const LINE = 'rgba(255,255,255,0.1)';

const W = 960;
const PAD = 16;

/** 라이트 테마에서도 글자가 읽히도록 옅은 그림자를 깔아요(다크에서는 거의 보이지 않아요). */
const SHADOW = '0 1px 4px rgba(0, 0, 0, 0.85)';
const ellipsis = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const satisfies CSSProperties;

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

function Header({ title, date }: { title: string; date?: string }): ReactNode {
	return (
		<Box style={{ alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
			<Box style={{ fontSize: 28, fontWeight: 700, color: MUTED }}>{title}</Box>
			{date ? <Box style={{ fontSize: 24, fontWeight: 500, color: MUTED }}>{date}</Box> : null}
		</Box>
	);
}

function Stars({ filled, color }: { filled: number; color: string }): ReactNode {
	return (
		<Box style={{ alignItems: 'center' }}>
			{[0, 1, 2, 3, 4].map((i) =>
				i < filled ? (
					<Box key={i} style={{ marginRight: 6 }}>
						<Icon name="star" size={30} color={color} filled />
					</Box>
				) : (
					<Box key={i} style={{ marginRight: 6 }}>
						<Icon name="star" size={30} color="rgba(255,255,255,0.22)" strokeWidth={1.6} />
					</Box>
				)
			)}
		</Box>
	);
}

interface LuckyBox {
	icon: 'gift' | 'key';
	label: string;
	value: string;
}

/** 별자리 한 개 — 큰 별자리 기호·이름·별점, 오른쪽에 큰 순위, 아래에 럭키 열 */
export async function renderOhaasaCard(input: OhaasaCardInput): Promise<Buffer> {
	const theme = ZODIAC_THEMES[input.zodiacCode] ?? ZODIAC_THEMES['12']!;
	const zodiac = ZODIAC_MAP[input.zodiacCode] ?? ZODIAC_MAP['12']!;

	const item = (input.luckyItem ?? '').trim();
	const key = (input.luckyKey ?? '').trim();
	const boxes: LuckyBox[] = [];
	if (item) boxes.push({ icon: 'gift', label: '행운의 아이템', value: item });
	if (key) boxes.push({ icon: 'key', label: '행운의 열쇠', value: key });

	const H = boxes.length > 0 ? 366 : 244;
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
			<Header title="오늘의 운세" date={input.date} />
			{/* 왼쪽: 별자리 기호 + 이름(한/일) + 별점 / 오른쪽: 큰 순위 */}
			<Box style={{ alignItems: 'center', height: 172, marginTop: 4 }}>
				<Box style={{ width: 176, flexShrink: 0, paddingLeft: 8 }}>
					<Icon name={zodiacIcon(input.zodiacCode)} size={120} color={theme.primary} strokeWidth={1.7} />
				</Box>
				<Box style={{ flexDirection: 'column', flex: 1, minWidth: 0 }}>
					<Box style={{ fontSize: 58, fontWeight: 800, color: TEXT, ...ellipsis }}>{zodiac.ko}</Box>
					<Box style={{ fontSize: 30, fontWeight: 600, color: MUTED, marginTop: 2, ...ellipsis }}>{zodiac.jp}</Box>
					<Box style={{ marginTop: 12 }}>
						<Stars filled={starsForRank(input.rank)} color={theme.primary} />
					</Box>
				</Box>
				<Box style={{ alignItems: 'baseline', flexShrink: 0, marginLeft: 24 }}>
					<Box style={{ fontSize: 128, fontWeight: 800, color: theme.primary, lineHeight: 1 }}>{String(input.rank)}</Box>
					<Box style={{ fontSize: 48, fontWeight: 800, color: MUTED, marginLeft: 8 }}>위</Box>
				</Box>
			</Box>
			{/* 구분선 + 럭키 열: 구분선으로 나누고 박스는 쓰지 않아요 */}
			{boxes.length > 0 ? (
				<Box style={{ flexDirection: 'column', marginTop: 8, borderTop: `1px solid ${LINE}` }}>
					<Box style={{ height: 124, paddingTop: 18 }}>
						{boxes.map((box, i) => (
							<Box
								key={box.label}
								style={{
									flex: 1,
									minWidth: 0,
									flexDirection: 'column',
									paddingLeft: i === 0 ? 0 : 24,
									borderLeft: i === 0 ? undefined : `1px solid ${LINE}`
								}}
							>
								<Box style={{ alignItems: 'center' }}>
									<Icon name={box.icon} size={26} color={theme.primary} />
									<Box style={{ fontSize: 24, fontWeight: 600, color: MUTED, marginLeft: 8 }}>{box.label}</Box>
								</Box>
								<Box style={{ fontSize: 38, fontWeight: 800, color: TEXT, marginTop: 10, ...ellipsis }}>{box.value}</Box>
							</Box>
						))}
					</Box>
				</Box>
			) : null}
		</Box>
	);
	return renderCardPng(card, { width: W, height: H });
}

/** TOP 3 — 순위·별자리 기호·이름을 3열로 나란히 보여줘요 */
export async function renderOhaasaTopCard(input: OhaasaTopCardInput): Promise<Buffer> {
	const items = input.items.slice(0, 3);
	const H = 372;
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
			<Header title="오늘의 운세 TOP 3" date={input.date} />
			<Box style={{ height: 300, marginTop: 12 }}>
				{items.map((entry, i) => {
					const theme = ZODIAC_THEMES[entry.zodiacCode] ?? ZODIAC_THEMES['12']!;
					const zodiac = ZODIAC_MAP[entry.zodiacCode] ?? ZODIAC_MAP['12']!;
					return (
						<Box
							key={entry.rank}
							style={{
								flex: 1,
								minWidth: 0,
								flexDirection: 'column',
								alignItems: 'center',
								borderLeft: i === 0 ? undefined : `1px solid ${LINE}`
							}}
						>
							{/* 순위 — 1위에는 왕관을 얹어요 */}
							<Box style={{ height: 30, alignItems: 'center' }}>
								{entry.rank === 1 ? <Icon name="crown" size={30} color={theme.primary} filled /> : null}
							</Box>
							<Box style={{ alignItems: 'baseline', marginTop: 2 }}>
								<Box style={{ fontSize: 68, fontWeight: 800, color: theme.primary, lineHeight: 1 }}>{String(entry.rank)}</Box>
								<Box style={{ fontSize: 34, fontWeight: 800, color: MUTED, marginLeft: 4 }}>위</Box>
							</Box>
							<Box style={{ marginTop: 12 }}>
								<Icon name={zodiacIcon(entry.zodiacCode)} size={80} color={theme.primary} strokeWidth={1.7} />
							</Box>
							<Box style={{ fontSize: 40, fontWeight: 800, color: TEXT, marginTop: 10, maxWidth: '85%', ...ellipsis }}>{zodiac.ko}</Box>
							<Box style={{ fontSize: 26, fontWeight: 600, color: MUTED, maxWidth: '85%', ...ellipsis }}>{zodiac.jp}</Box>
						</Box>
					);
				})}
			</Box>
		</Box>
	);
	return renderCardPng(card, { width: W, height: H });
}
