/**
 * 프로필 카드 렌더러 — skia-canvas로 유저 프로필을 현대적인 카드 이미지로 그려요.
 * 배너 기반 레이아웃: 배너 크기만큼 채우고, 아래 섹션에 아바타/태그/통계/자주 듣는 곡.
 * 컬러는 웹 대시보드 디자인 토큰(globals.css 다크 테마)과 동일한 팔레트를 써요.
 */
import type { Canvas, CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';

export interface TopTrackSnippet {
	title: string;
	artist: string;
	/** 썸네일 URL — data-api가 fetch해요 */
	thumbnailUrl: string | null;
}

export interface ProfileCardInput {
	userId: string;
	displayName: string;
	username: string;
	avatarUrl: string | null;
	/** 유저 배너 (있을 때만) */
	bannerUrl: string | null;
	zodiacCode: string | null;
	zodiacKo: string;
	zodiacJp?: string | null;
	/** 본인 조회 때만 채워요 (타인에게는 생일 비공개) */
	birthMonth?: number | null;
	birthDay?: number | null;
	playlistCount: number;
	requestedCount: number;
	/** "12시간 34분" 같은 포맷된 문자열 — 봇이 만들어요 */
	listenText: string;
	/** 계정 생성일 ISO */
	accountCreated: string | null;
	/** 서버 참가일 — 있으면 표시 */
	guildJoinedAt?: string | null;
	/** 자주 듣는 곡 상위 3 — 썸네일 포함 */
	topTracks: TopTrackSnippet[];
}

// ── 대시보드 디자인 토큰 (apps/dashboard/src/app/globals.css 다크 테마 기준) ──
const TOKEN = {
	/** --background (dark) */
	page: '#1a0e12',
	/** --card (dark) */
	card: '#2d1b1e',
	/** --surface-1 (dark): 패널 베이스 */
	surface1: '#231317',
	/** --surface-3 (dark): 플로팅 오버레이 */
	surface3: '#35212a',
	/** --primary: 브랜드 핑크 */
	primary: '#ff85c1',
	/** --secondary: 따뜻한 보조 톤 */
	secondary: '#d4a574',
	/** --foreground (dark) */
	text: '#fce7f3',
	/** --muted-foreground (dark) */
	textMuted: '#c9a8b5',
	/** --border (dark) */
	border: '#3d2328',
	/** --border-subtle (dark) */
	borderSubtle: '#2f1a1f'
} as const;

// ── 별자리 테마 (12별자리 — 브랜드 팔레트와 조화된 컬러) ─────────────────────
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

function hexToRgba(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function hashString(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}

function makeRng(seed: number): () => number {
	let s = seed || 1;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/** 별자리 실제 형태 — 정규화 좌표(0~1). 우측 영역에 크게 그려요 */
const ZODIAC_SHAPES: Record<string, [number, number][]> = {
	'01': [
		[0.1, 0.75],
		[0.3, 0.6],
		[0.55, 0.55],
		[0.8, 0.65]
	], // 양자리
	'02': [
		[0.15, 0.7],
		[0.3, 0.55],
		[0.45, 0.5],
		[0.55, 0.6],
		[0.45, 0.75],
		[0.3, 0.78],
		[0.18, 0.75]
	], // 황소 V
	'03': [
		[0.25, 0.3],
		[0.25, 0.5],
		[0.3, 0.7],
		[0.35, 0.85],
		[0.45, 0.82],
		[0.42, 0.65],
		[0.4, 0.5],
		[0.6, 0.35],
		[0.6, 0.55],
		[0.65, 0.75],
		[0.7, 0.88],
		[0.8, 0.83],
		[0.75, 0.67],
		[0.72, 0.5],
		[0.68, 0.38]
	], // 쌍둥이
	'04': [
		[0.2, 0.4],
		[0.3, 0.55],
		[0.45, 0.6],
		[0.5, 0.75],
		[0.6, 0.8],
		[0.65, 0.7],
		[0.6, 0.55],
		[0.55, 0.45]
	], // 게자리
	'05': [
		[0.2, 0.35],
		[0.28, 0.2],
		[0.45, 0.15],
		[0.52, 0.25],
		[0.45, 0.35],
		[0.32, 0.4],
		[0.25, 0.45],
		[0.35, 0.6],
		[0.5, 0.65],
		[0.65, 0.7],
		[0.75, 0.6],
		[0.82, 0.68]
	], // 사자
	'06': [
		[0.15, 0.55],
		[0.25, 0.45],
		[0.35, 0.5],
		[0.45, 0.38],
		[0.55, 0.45],
		[0.6, 0.55],
		[0.55, 0.68],
		[0.6, 0.8],
		[0.7, 0.85]
	], // 처녀
	'07': [
		[0.15, 0.65],
		[0.25, 0.5],
		[0.5, 0.45],
		[0.75, 0.5],
		[0.85, 0.65]
	], // 천칭
	'08': [
		[0.15, 0.3],
		[0.22, 0.18],
		[0.38, 0.2],
		[0.44, 0.32],
		[0.55, 0.42],
		[0.62, 0.55],
		[0.72, 0.6],
		[0.82, 0.5],
		[0.85, 0.62],
		[0.75, 0.65]
	], // 전갈
	'09': [
		[0.15, 0.75],
		[0.28, 0.68],
		[0.42, 0.62],
		[0.5, 0.52],
		[0.55, 0.42],
		[0.6, 0.5],
		[0.62, 0.62],
		[0.65, 0.75],
		[0.56, 0.42],
		[0.52, 0.3],
		[0.58, 0.2],
		[0.68, 0.12]
	], // 사수(찻주전자)
	'10': [
		[0.1, 0.4],
		[0.25, 0.48],
		[0.4, 0.55],
		[0.55, 0.6],
		[0.7, 0.65],
		[0.82, 0.7],
		[0.8, 0.8],
		[0.68, 0.78],
		[0.55, 0.74],
		[0.42, 0.68],
		[0.28, 0.6],
		[0.16, 0.5],
		[0.12, 0.42]
	], // 염소
	'11': [
		[0.12, 0.32],
		[0.2, 0.4],
		[0.32, 0.36],
		[0.4, 0.44],
		[0.52, 0.4],
		[0.6, 0.48],
		[0.72, 0.44],
		[0.76, 0.52],
		[0.68, 0.58],
		[0.6, 0.52],
		[0.5, 0.58],
		[0.42, 0.62],
		[0.34, 0.56],
		[0.24, 0.5]
	], // 물병
	'12': [
		[0.15, 0.28],
		[0.22, 0.4],
		[0.18, 0.5],
		[0.12, 0.62],
		[0.2, 0.75],
		[0.32, 0.8],
		[0.45, 0.78],
		[0.58, 0.8],
		[0.7, 0.75],
		[0.78, 0.62],
		[0.75, 0.5],
		[0.8, 0.38],
		[0.76, 0.26]
	] // 물고기
};

async function loadImage(url: string): Promise<CanvasDrawable | null> {
	try {
		const { loadImage } = await import('skia-canvas');
		const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
		if (!res.ok) return null;
		const buf = Buffer.from(await res.arrayBuffer());
		return (await loadImage(buf)) as unknown as CanvasDrawable;
	} catch {
		return null;
	}
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.fillStyle = '#ffffff';
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fill();
	if (r > 1.2) {
		// 반짝임 효과
		ctx.globalAlpha = alpha * 0.5;
		ctx.beginPath();
		ctx.moveTo(x, y - r * 3);
		ctx.lineTo(x + r * 0.7, y - r * 0.7);
		ctx.lineTo(x + r * 3, y);
		ctx.lineTo(x + r * 0.7, y + r * 0.7);
		ctx.lineTo(x, y + r * 3);
		ctx.lineTo(x - r * 0.7, y + r * 0.7);
		ctx.lineTo(x - r * 3, y);
		ctx.lineTo(x - r * 0.7, y - r * 0.7);
		ctx.closePath();
		ctx.fill();
	}
	ctx.restore();
}

/** 원형 이미지 그리기 */
function drawCircleImage(ctx: CanvasRenderingContext2D, img: CanvasDrawable, cx: number, cy: number, radius: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.clip();
	const iw = (img as { width: number }).width;
	const ih = (img as { height: number }).height;
	const scale = Math.max((radius * 2) / iw, (radius * 2) / ih);
	ctx.drawImage(img, cx - (iw * scale) / 2, cy - (ih * scale) / 2, iw * scale, ih * scale);
	ctx.restore();
}

/** 카드 본체 + 보더 (공용 모양) */
function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
	ctx.fillStyle = TOKEN.card;
	ctx.fill();
	ctx.strokeStyle = TOKEN.border;
	ctx.lineWidth = 1.5;
	ctx.stroke();
}

/** 텍스트 생략 */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let s = text;
	while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
	return s + '…';
}

/** 총 청취 시간을 카드에 맞게 축약해요 */
function formatListenCompact(text: string): string {
	const match = text.match(/(\d+)시간/);
	if (match) return `${match[1]}시간`;
	const minMatch = text.match(/(\d+)분/);
	if (minMatch) return `${minMatch[1]}분`;
	return text.replace(/\s/g, ' ').split(' ')[0] ?? '0';
}

export async function renderProfileCard(input: ProfileCardInput): Promise<Buffer> {
	const { Canvas, FontLibrary } = await import('skia-canvas');
	try {
		if (!FontLibrary.has('Noto Sans KR')) {
			const { join } = await import('node:path');
			const fontPath = join(process.cwd(), 'resources/fonts/NotoSansKR.ttf');
			FontLibrary.use('Noto Sans KR', [fontPath]);
		}
	} catch (error) {
		console.error(`[data-api] profile-card font load failed: ${error instanceof Error ? error.message : String(error)}`);
	}

	const zodiacCode = input.zodiacCode ?? '12';
	const theme = ZODIAC_THEMES[zodiacCode] ?? ZODIAC_THEMES['12'];
	const rng = makeRng(hashString(input.userId));

	// ── 레이아웃 상수 (세로 높이는 콘텐츠에 맞춰 계산) ──
	const W = 920;
	const PAD = 40;
	const BANNER_H = 176; // 배너/헤더 높이
	const AVATAR_R = 56;
	const AVATAR_CX = PAD + AVATAR_R; // 96
	const AVATAR_CY = BANNER_H + 14; // 헤더 경계에 걸치게

	const statY = AVATAR_CY + AVATAR_R + 36;
	const statH = 92;
	const statR = 16;
	const statGap = 14;
	const statW = (W - PAD * 2 - statGap * 2) / 3;

	const panelY = statY + statH + 18;
	const rows = Math.min(3, input.topTracks.length);
	const THUMB = 46;
	const ROW_GAP = 12;
	// 패널 헤더(48) + 행들 + 하단 여백(20), 비었으면 헤더+안내 문구
	const panelH = rows > 0 ? 48 + rows * THUMB + (rows - 1) * ROW_GAP + 20 : 48 + 30 + 20;
	const H = panelY + panelH + 44; // 하단 시그니처 여백

	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');

	// ── 배경: page 토큰 단색 + 상단 헤더 틴트 ──
	ctx.fillStyle = TOKEN.page;
	ctx.fillRect(0, 0, W, H);

	// 헤더 배경 (배너 없으면 별자리 틴트, 있으면 어두운 베이스)
	const headGrad = ctx.createLinearGradient(0, 0, 0, BANNER_H + 30);
	if (input.bannerUrl) {
		headGrad.addColorStop(0, TOKEN.surface1);
		headGrad.addColorStop(1, TOKEN.page);
	} else {
		headGrad.addColorStop(0, hexToRgba(theme.primary, 0.14));
		headGrad.addColorStop(0.6, hexToRgba(theme.primary, 0.04));
		headGrad.addColorStop(1, TOKEN.page);
	}
	ctx.fillStyle = headGrad;
	ctx.fillRect(0, 0, W, BANNER_H + 30);

	// 배너 없을 때: 별자리 컨스텔레이션 (헤더 오른쪽 — 이름 영역과 분리)
	if (!input.bannerUrl) {
		const mapX = (nx: number) => W * 0.64 + nx * W * 0.27;
		const mapY = (ny: number) => 32 + ny * 110;

		for (let i = 0; i < 36; i++) {
			const x = W * 0.58 + rng() * W * 0.4;
			const y = rng() * (BANNER_H - 10);
			drawStar(ctx, x, y, rng() * 1.5 + 0.3, 0.12 + rng() * 0.35);
		}
		const shape = ZODIAC_SHAPES[zodiacCode] ?? ZODIAC_SHAPES['12'];
		ctx.save();
		ctx.globalAlpha = 0.85;
		ctx.strokeStyle = hexToRgba(theme.primary, 0.55);
		ctx.lineWidth = 1.6;
		ctx.setLineDash([5, 9]);
		ctx.beginPath();
		shape.forEach(([nx, ny], i) => (i === 0 ? ctx.moveTo(mapX(nx), mapY(ny)) : ctx.lineTo(mapX(nx), mapY(ny))));
		ctx.stroke();
		ctx.setLineDash([]);
		shape.forEach(([nx, ny], i) => drawStar(ctx, mapX(nx), mapY(ny), i === 0 || i === shape.length - 1 ? 2.6 : 1.9, 0.9));
		ctx.restore();
	}

	// ── 배너 이미지 (있을 때) ──
	if (input.bannerUrl) {
		const bannerImg = await loadImage(input.bannerUrl);
		if (bannerImg) {
			const bw = (bannerImg as { width: number }).width;
			const bh = (bannerImg as { height: number }).height;
			const scale = Math.max(W / bw, BANNER_H / bh);
			const dw = bw * scale;
			const dh = bh * scale;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, W, BANNER_H);
			ctx.clip();
			ctx.drawImage(bannerImg, (W - dw) / 2, (BANNER_H - dh) / 2, dw, dh);
			// 톤 정합: 배너 위 어두운 스크림
			ctx.fillStyle = 'rgba(26,14,18,0.32)';
			ctx.fillRect(0, 0, W, BANNER_H);
			ctx.restore();
		}
		// 헤더 하단 페이드 — page 배경으로 자연스럽게 녹아요
		const fade = ctx.createLinearGradient(0, BANNER_H - 64, 0, BANNER_H + 26);
		fade.addColorStop(0, 'rgba(26,14,18,0)');
		fade.addColorStop(0.72, 'rgba(26,14,18,0.86)');
		fade.addColorStop(1, TOKEN.page);
		ctx.fillStyle = fade;
		ctx.fillRect(0, BANNER_H - 64, W, 90);
	} else {
		// 배너 없을 때 브랜드 액센트 상단 바
		const accent = ctx.createLinearGradient(0, 0, W, 0);
		accent.addColorStop(0, TOKEN.primary);
		accent.addColorStop(1, hexToRgba(TOKEN.secondary, 0.85));
		ctx.fillStyle = accent;
		ctx.fillRect(0, 0, W, 5);
	}

	// ── 아바타: 헤더 경계에 걸치게 + primary 링 ──
	ctx.save();
	ctx.beginPath();
	ctx.arc(AVATAR_CX, AVATAR_CY, AVATAR_R + 5, 0, Math.PI * 2);
	ctx.fillStyle = TOKEN.primary;
	ctx.fill();
	ctx.restore();

	if (input.avatarUrl) {
		const avImg = await loadImage(input.avatarUrl);
		if (avImg) {
			drawCircleImage(ctx, avImg, AVATAR_CX, AVATAR_CY, AVATAR_R);
		} else {
			ctx.save();
			ctx.beginPath();
			ctx.arc(AVATAR_CX, AVATAR_CY, AVATAR_R, 0, Math.PI * 2);
			ctx.fillStyle = TOKEN.surface3;
			ctx.fill();
			ctx.restore();
		}
	} else {
		ctx.save();
		ctx.beginPath();
		ctx.arc(AVATAR_CX, AVATAR_CY, AVATAR_R, 0, Math.PI * 2);
		ctx.fillStyle = TOKEN.surface3;
		ctx.fill();
		// 플레이스홀더 뮤직 노트
		ctx.fillStyle = hexToRgba(TOKEN.textMuted, 0.6);
		ctx.font = '600 40px "Noto Sans KR", sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('♪', AVATAR_CX, AVATAR_CY + 4);
		ctx.textBaseline = 'alphabetic';
		ctx.restore();
	}

	// ── 이름/태그 (아바타 오른쪽) ──
	const nameX = AVATAR_CX + AVATAR_R + 28;
	const nameY = AVATAR_CY - 12;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	// 이름
	ctx.fillStyle = TOKEN.text;
	ctx.font = '800 40px "Noto Sans KR", sans-serif';
	ctx.fillText(truncate(ctx, input.displayName, W - nameX - 330), nameX, nameY);

	// 유저태그 (이름 아래, muted-foreground 토큰)
	ctx.fillStyle = TOKEN.textMuted;
	ctx.font = '500 21px "Noto Sans KR", sans-serif';
	ctx.fillText(`@${input.username}`, nameX, nameY + 38);

	// ── 별자리 뱃지 (이름 아래, accent 톤 배경) ──
	const badgeY = nameY + 64;
	const badgeText = input.zodiacJp ? `${input.zodiacKo} · ${input.zodiacJp}` : input.zodiacKo;
	let badgeW = 0;
	ctx.save();
	ctx.font = '600 17px "Noto Sans KR", sans-serif';
	badgeW = ctx.measureText(badgeText).width + 32;
	ctx.beginPath();
	ctx.roundRect(nameX, badgeY, badgeW, 34, 17);
	ctx.fillStyle = hexToRgba(theme.primary, 0.15);
	ctx.fill();
	ctx.strokeStyle = hexToRgba(theme.primary, 0.45);
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.fillStyle = theme.soft;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(badgeText, nameX + badgeW / 2, badgeY + 18);
	ctx.restore();

	// 생일 (본인 조회일 때만) — 뱃지 옆
	if (input.birthMonth && input.birthDay) {
		ctx.save();
		ctx.font = '600 17px "Noto Sans KR", sans-serif';
		const birthText = `🎂 ${input.birthMonth}월 ${input.birthDay}일`;
		const bw2 = ctx.measureText(birthText).width + 32;
		ctx.beginPath();
		ctx.roundRect(nameX + badgeW + 12, badgeY, bw2, 34, 17);
		ctx.fillStyle = hexToRgba(TOKEN.secondary, 0.16);
		ctx.fill();
		ctx.strokeStyle = hexToRgba(TOKEN.secondary, 0.5);
		ctx.lineWidth = 1.5;
		ctx.stroke();
		ctx.fillStyle = TOKEN.secondary;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(birthText, nameX + badgeW + 12 + bw2 / 2, badgeY + 18);
		ctx.restore();
	}

	// ── 우측: 계정 정보 (헤더 안, 오른쪽 정렬) ──
	ctx.textAlign = 'right';
	ctx.fillStyle = TOKEN.textMuted;
	ctx.font = '500 15px "Noto Sans KR", sans-serif';
	const created = input.accountCreated
		? new Date(input.accountCreated).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
		: '';
	const joined = input.guildJoinedAt
		? new Date(input.guildJoinedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
		: '';
	if (created) ctx.fillText(`가입 ${created}`, W - PAD, BANNER_H - 30);
	if (joined) ctx.fillText(`서버 참가 ${joined}`, W - PAD, BANNER_H - 8);

	// ── 통계 카드 3개 — card 토큰 + border 토큰 + 별자리 액센트 ──
	const statIcon = ['📁', '🎵', '⏱'];
	const stats = [
		{ label: '플레이리스트', val: `${input.playlistCount}개` },
		{ label: '신청한 곡', val: `${input.requestedCount.toLocaleString('ko-KR')}곡` },
		{ label: '총 청취 시간', val: formatListenCompact(input.listenText) }
	];

	stats.forEach((st, i) => {
		const x = PAD + i * (statW + statGap);
		ctx.save();
		// 카드 본체 + 클립 (액센트 바를 라운드 안에 넣기 위해)
		ctx.beginPath();
		ctx.roundRect(x, statY, statW, statH, statR);
		ctx.fillStyle = TOKEN.card;
		ctx.fill();
		ctx.save();
		ctx.clip();
		ctx.fillStyle = hexToRgba(theme.primary, 0.75);
		ctx.fillRect(x, statY, statW, 3);
		ctx.restore();
		ctx.strokeStyle = TOKEN.border;
		ctx.lineWidth = 1.5;
		ctx.stroke();
		// 라벨 (muted 토큰)
		ctx.fillStyle = TOKEN.textMuted;
		ctx.font = '500 14px "Noto Sans KR", sans-serif';
		ctx.textAlign = 'left';
		ctx.fillText(`${statIcon[i]} ${st.label}`, x + 20, statY + 34);
		// 값 (foreground 강조)
		ctx.fillStyle = TOKEN.text;
		ctx.font = '800 27px "Noto Sans KR", sans-serif';
		ctx.fillText(st.val, x + 20, statY + 72);
		ctx.restore();
	});

	// ── 자주 신청한 곡 패널 — card 토큰 안에 리스트 ──
	ctx.save();
	drawCard(ctx, PAD, panelY, W - PAD * 2, panelH, statR);
	ctx.restore();

	// 패널 헤더
	ctx.textAlign = 'left';
	ctx.fillStyle = TOKEN.primary;
	ctx.font = '800 16px "Noto Sans KR", sans-serif';
	ctx.fillText('🏆 자주 신청한 곡', PAD + 24, panelY + 32);

	if (rows === 0) {
		ctx.fillStyle = TOKEN.textMuted;
		ctx.font = '500 15px "Noto Sans KR", sans-serif';
		ctx.fillText('아직 기록이 없어요. /재생으로 첫 곡을 신청해 보세요.', PAD + 24, panelY + 62);
	}

	const textX = PAD + 24 + THUMB + 16;
	const textW = W - textX - PAD - 24;
	for (let i = 0; i < rows; i++) {
		const track = input.topTracks[i];
		const y = panelY + 48 + i * (THUMB + ROW_GAP);
		// 썸네일
		let thumbDrawn = false;
		if (track.thumbnailUrl) {
			const img = await loadImage(track.thumbnailUrl);
			if (img) {
				ctx.save();
				ctx.beginPath();
				ctx.roundRect(PAD + 24, y, THUMB, THUMB, 10);
				ctx.clip();
				const iw = (img as { width: number }).width;
				const ih = (img as { height: number }).height;
				const s = Math.max(THUMB / iw, THUMB / ih);
				ctx.drawImage(img, PAD + 24 + THUMB / 2 - (iw * s) / 2, y + THUMB / 2 - (ih * s) / 2, iw * s, ih * s);
				ctx.restore();
				thumbDrawn = true;
			}
		}
		if (!thumbDrawn) {
			ctx.save();
			ctx.beginPath();
			ctx.roundRect(PAD + 24, y, THUMB, THUMB, 10);
			ctx.fillStyle = TOKEN.surface3;
			ctx.fill();
			ctx.fillStyle = hexToRgba(TOKEN.textMuted, 0.7);
			ctx.font = '600 20px "Noto Sans KR", sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('♪', PAD + 24 + THUMB / 2, y + THUMB / 2 + 1);
			ctx.restore();
			ctx.textBaseline = 'alphabetic';
		}
		// 순번 배지 (썸네일 좌상단)
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(PAD + 24, y, 22, 22, 7);
		ctx.fillStyle = TOKEN.primary;
		ctx.fill();
		ctx.fillStyle = TOKEN.page;
		ctx.font = '800 12px "Noto Sans KR", sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(i + 1), PAD + 24 + 11, y + 11.5);
		ctx.restore();
		ctx.textBaseline = 'alphabetic';
		// 제목/아티스트
		ctx.fillStyle = TOKEN.text;
		ctx.font = '700 17px "Noto Sans KR", sans-serif';
		ctx.fillText(truncate(ctx, track.title, textW), textX, y + 19);
		ctx.fillStyle = TOKEN.textMuted;
		ctx.font = '400 14px "Noto Sans KR", sans-serif';
		ctx.fillText(truncate(ctx, track.artist, textW), textX, y + 41);
	}

	// ── 하단: 브랜드 시그니처 ──
	ctx.textAlign = 'right';
	ctx.fillStyle = TOKEN.textMuted;
	ctx.font = '700 13px "Noto Sans KR", sans-serif';
	const sigText = 'SiruBOT';
	ctx.fillText(sigText, W - PAD, H - 18);
	// 브랜드 핑크 로고 닷
	const sigW = ctx.measureText(sigText).width;
	ctx.save();
	ctx.beginPath();
	ctx.arc(W - PAD - sigW - 10, H - 23, 4, 0, Math.PI * 2);
	ctx.fillStyle = TOKEN.primary;
	ctx.fill();
	ctx.restore();

	return (await canvas.toBuffer('png')) as Buffer;
}
