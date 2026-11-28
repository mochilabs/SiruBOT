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
	'01': { primary: '#fb7185', soft: '#fda4af' },
	'02': { primary: '#e8a87c', soft: '#f4c9a5' },
	'03': { primary: '#f0abfc', soft: '#f5e0ff' },
	'04': { primary: '#93c5fd', soft: '#dbeafe' },
	'05': { primary: '#fbbf24', soft: '#fde68a' },
	'06': { primary: '#a3e635', soft: '#ecfccb' },
	'07': { primary: '#f9a8d4', soft: '#fce7f3' },
	'08': { primary: '#e879f9', soft: '#fae8ff' },
	'09': { primary: '#fb923c', soft: '#ffedd5' },
	'10': { primary: '#d4a574', soft: '#f0e2cf' },
	'11': { primary: '#67e8f9', soft: '#cffafe' },
	'12': { primary: '#c084fc', soft: '#f3e8ff' }
};

export interface OhaasaCardInput {
	zodiacCode: string;
	rank: number;
	luckyItem?: string;
	luckyKey?: string;
	date?: string;
}

export interface OhaasaTopCardInput {
	items: Array<{ zodiacCode: string; rank: number }>;
	date?: string;
}

const TEXT = '#f2f3f5';
const MUTED = '#949ba4';
const LINE = 'rgba(255,255,255,0.1)';

const W = 960;
const PAD = 16;

const SHADOW = '0 1px 4px rgba(0, 0, 0, 0.85)';
const ellipsis = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const satisfies CSSProperties;

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
