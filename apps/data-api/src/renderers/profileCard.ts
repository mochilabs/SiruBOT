/**
 * 프로필 카드 렌더러 — skia-canvas로 유저 프로필을 현대적인 카드 이미지로 그려요.
 * 배너 기반 레이아웃: 배너 크기만큼 채우고, 아래 섹션에 아바타/태그/통계/자주 듣는 곡.
 * 생일 표기는 payload에 있을 때만 — 봇이 본인 조회 때만 넣어요.
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

// ── 별자리 테마 (12별자리 컬러 팔레트) ─────────────────────────────────────
interface ZodiacTheme {
	primary: string;
	secondary: string;
	glow: string;
}

const ZODIAC_THEMES: Record<string, ZodiacTheme> = {
	'01': { primary: '#ff6b6b', secondary: '#ff8a5c', glow: 'rgba(255,107,107,0.4)' }, // 양자리
	'02': { primary: '#ffd166', secondary: '#f4a261', glow: 'rgba(255,209,102,0.4)' }, // 황소자리
	'03': { primary: '#4cc9f0', secondary: '#7209b7', glow: 'rgba(76,201,240,0.4)' }, // 쌍둥이자리
	'04': { primary: '#7bdff2', secondary: '#b388ff', glow: 'rgba(123,223,242,0.4)' }, // 게자리
	'05': { primary: '#ffd700', secondary: '#ff9e00', glow: 'rgba(255,215,0,0.4)' }, // 사자자리
	'06': { primary: '#8ac926', secondary: '#2a9d8f', glow: 'rgba(138,201,38,0.4)' }, // 처녀자리
	'07': { primary: '#ff70a6', secondary: '#ff9770', glow: 'rgba(255,112,166,0.4)' }, // 천칭자리
	'08': { primary: '#ff5d8f', secondary: '#8338ec', glow: 'rgba(255,93,143,0.4)' }, // 전갈자리
	'09': { primary: '#ffa630', secondary: '#ff4e00', glow: 'rgba(255,166,48,0.4)' }, // 사수자리
	'10': { primary: '#2ec4b6', secondary: '#011f4b', glow: 'rgba(46,196,182,0.4)' }, // 염소자리
	'11': { primary: '#00b4d8', secondary: '#90e0ef', glow: 'rgba(0,180,216,0.4)' }, // 물병자리
	'12': { primary: '#9d4edd', secondary: '#5a189a', glow: 'rgba(157,78,221,0.4)' } // 물고기자리
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
function drawCircleImage(ctx: CanvasRenderingContext2D, img: CanvasDrawable, x: number, y: number, radius: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
	ctx.clip();
	const iw = (img as { width: number }).width;
	const ih = (img as { height: number }).height;
	const scale = Math.max((radius * 2) / iw, (radius * 2) / ih);
	ctx.drawImage(img, x + radius - (iw * scale) / 2, y + radius - (ih * scale) / 2, iw * scale, ih * scale);
	ctx.restore();
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
			FontLibrary.use('Noto Sans KR', [join(process.cwd(), 'resources/fonts/NotoSansKR.ttf')]);
		}
	} catch {
		// fallback to system
	}

	const theme = ZODIAC_THEMES[input.zodiacCode ?? '12'] ?? ZODIAC_THEMES['12'];
	const rng = makeRng(hashString(input.userId));

	// 크기: 920 × (배너 200 + 콘텐츠 ~420)
	const W = 920;
	const BANNER_H = input.bannerUrl ? 200 : 120;
	const CONTENT_H = 420;
	const H = BANNER_H + CONTENT_H;

	// 배너 없으면 밝은 배경 → 어두운 텍스트
	const lightMode = !input.bannerUrl;
	const textPrimary = () => (lightMode ? '#2a3140' : '#ffffff');
	const textMuted = () => (lightMode ? 'rgba(42,49,64,0.6)' : 'rgba(255,255,255,0.6)');
	const textSubtle = () => (lightMode ? 'rgba(42,49,64,0.4)' : 'rgba(255,255,255,0.4)');

	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');

	// ── 배경 ──
	// 별자리 그라디언트 베이스
	const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
	bgGrad.addColorStop(0, input.bannerUrl ? '#0a0c14' : hexToRgba(theme.secondary, 0.25));
	bgGrad.addColorStop(1, '#0d1117');
	ctx.fillStyle = bgGrad;
	ctx.fillRect(0, 0, W, H);

	// 별채우기 (배너 없을 때만, 우측에 집중)
	if (!input.bannerUrl) {
		// 별자리 형태는 우측 "콘텐츠 위" 공간 — 통계/트랙 영역(좌측)과 분리
		const mapX = (nx: number) => W * 0.58 + nx * W * 0.36;
		const mapY = (ny: number) => H * 0.14 + ny * H * 0.28;

		for (let i = 0; i < 55; i++) {
			const x = W * 0.45 + rng() * W * 0.52;
			const y = rng() * H;
			drawStar(ctx, x, y, rng() * 2 + 0.3, 0.15 + rng() * 0.4);
		}
		// 별자리 실제 형태 — 크고 선명하게
		const shape = ZODIAC_SHAPES[input.zodiacCode ?? '12'] ?? ZODIAC_SHAPES['12'];
		ctx.save();
		ctx.globalAlpha = 0.75;
		ctx.strokeStyle = hexToRgba(theme.primary, 0.6);
		ctx.lineWidth = 2;
		ctx.setLineDash([7, 10]);
		ctx.beginPath();
		shape.forEach(([nx, ny], i) => (i === 0 ? ctx.moveTo(mapX(nx), mapY(ny)) : ctx.lineTo(mapX(nx), mapY(ny))));
		ctx.stroke();
		ctx.setLineDash([]);
		shape.forEach(([nx, ny], i) => drawStar(ctx, mapX(nx), mapY(ny), i === 0 || i === shape.length - 1 ? 3.4 : 2.4, 0.9));
		ctx.restore();
	}

	// ── 배너 영역 ──
	if (input.bannerUrl) {
		const bannerImg = await loadImage(input.bannerUrl);
		if (bannerImg) {
			const bw = (bannerImg as { width: number }).width;
			const bh = (bannerImg as { height: number }).height;
			const scale = Math.max(W / bw, BANNER_H / bh);
			const dw = bw * scale;
			const dh = bh * scale;
			ctx.save();
			ctx.globalAlpha = 0.9;
			ctx.drawImage(bannerImg, (W - dw) / 2, -(dh - BANNER_H) / 2, dw, dh);
			ctx.restore();
		}
		// 배너 하단 페이드 아웃
		const fade = ctx.createLinearGradient(0, BANNER_H - 60, 0, BANNER_H);
		fade.addColorStop(0, 'rgba(13,17,23,0)');
		fade.addColorStop(1, '#0d1117');
		ctx.fillStyle = fade;
		ctx.fillRect(0, BANNER_H - 80, W, 80);
	} else {
		// 배너 없을 때 별자리 액센트 상단 바
		ctx.save();
		ctx.fillStyle = theme.primary;
		ctx.globalAlpha = 0.3;
		ctx.fillRect(0, 0, W, 4);
		ctx.restore();
	}

	// ── 아바타 (배너-콘텐츠 경계에 걸치게) + 글로우 링 ──
	const avatarR = 60;
	const avatarX = 50;
	const avatarY = BANNER_H - avatarR + 10; // 배너 끝에서 살짝 아래로

	// 글로우 라이트
	const glowGrad = ctx.createRadialGradient(avatarX + avatarR, avatarY + avatarR, avatarR * 0.3, avatarX + avatarR, avatarY + avatarR, avatarR * 2);
	glowGrad.addColorStop(0, theme.glow);
	glowGrad.addColorStop(1, 'transparent');
	ctx.fillStyle = glowGrad;
	ctx.beginPath();
	ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR * 2.5, 0, Math.PI * 2);
	ctx.fill();

	// 아바타 원
	if (input.avatarUrl) {
		const avImg = await loadImage(input.avatarUrl);
		if (avImg) drawCircleImage(ctx, avImg, avatarX, avatarY, avatarR);
		else {
			ctx.fillStyle = '#262a38';
			ctx.beginPath();
			ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
			ctx.fill();
		}
	} else {
		ctx.fillStyle = '#262a38';
		ctx.beginPath();
		ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
		ctx.fill();
	}
	// 링
	ctx.strokeStyle = theme.primary;
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR + 3, 0, Math.PI * 2);
	ctx.stroke();

	// ── 이름과 태그 ──
	const nameY = avatarY + avatarR + 50;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	// 이름
	ctx.fillStyle = textPrimary();
	ctx.font = '700 42px "Noto Sans KR", sans-serif';
	ctx.fillText(truncate(ctx, input.displayName, W - 520), 190, nameY);

	// 유저태그
	ctx.fillStyle = textMuted();
	ctx.font = '400 24px "Noto Sans KR", sans-serif';
	ctx.fillText(`@${input.username}`, 190, nameY + 36);

	// 별자리 뱃지 — ko와 jp를 한 줄에 (일자 형태 보강)
	const badgeX = 190;
	const badgeY = nameY + 56;
	const badgeText = input.zodiacJp ? `${input.zodiacKo} · ${input.zodiacJp}` : input.zodiacKo;
	ctx.save();
	ctx.font = '600 17px "Noto Sans KR", sans-serif';
	const bw = ctx.measureText(badgeText).width + 36;
	ctx.beginPath();
	ctx.roundRect(badgeX, badgeY, bw, 34, 17);
	ctx.fillStyle = hexToRgba(theme.primary, 0.18);
	ctx.fill();
	ctx.strokeStyle = theme.primary;
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.fillStyle = theme.primary;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(badgeText, badgeX + bw / 2, badgeY + 18);
	ctx.restore();

	// 생일 (본인 조회일 때만) — 뱃지 옆
	if (input.birthMonth && input.birthDay) {
		ctx.save();
		ctx.fillStyle = 'rgba(255,255,255,0.7)';
		ctx.font = '500 18px "Noto Sans KR", sans-serif';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(`🎂 ${input.birthMonth}월 ${input.birthDay}일`, badgeX + bw + 16, badgeY + 18);
		ctx.restore();
	}

	// ── 통계 카드들 ──
	const statY = nameY + 110;
	const statW = 180;
	const statH = 80;
	const stats = [
		{ label: '플레이리스트', val: `${input.playlistCount}개` },
		{ label: '신청한 곡', val: `${input.requestedCount}곡` },
		{ label: '총 청취 시간', val: formatListenCompact(input.listenText) }
	];

	stats.forEach((st, i) => {
		const x = 50 + i * (statW + 20);
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(x, statY, statW, statH, 12);
		ctx.fillStyle = 'rgba(255,255,255,0.06)';
		ctx.fill();
		ctx.strokeStyle = 'rgba(255,255,255,0.1)';
		ctx.lineWidth = 1;
		ctx.stroke();
		ctx.fillStyle = textSubtle();
		ctx.font = '400 13px "Noto Sans KR", sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(st.label, x + statW / 2, statY + 22);
		ctx.fillStyle = '#ffffff';
		ctx.font = '700 28px "Noto Sans KR", sans-serif';
		ctx.fillText(st.val, x + statW / 2, statY + 56);
		ctx.restore();
	});

	// ── 자주 듣는 곡 (썸네일) ──
	if (input.topTracks.length > 0) {
		const trackY = statY + statH + 28;
		ctx.fillStyle = 'rgba(255,255,255,0.5)';
		ctx.font = '600 15px "Noto Sans KR", sans-serif';
		ctx.textAlign = 'left';
		ctx.fillText('자주 신청한 곡', 50, trackY);

		const thumbSize = 56;
		for (let i = 0; i < Math.min(3, input.topTracks.length); i++) {
			const track = input.topTracks[i];
			const y = trackY + 12 + i * (thumbSize + 10);
			// 썸네일
			let thumbDrawn = false;
			if (track.thumbnailUrl) {
				const img = await loadImage(track.thumbnailUrl);
				if (img) {
					ctx.save();
					ctx.beginPath();
					ctx.roundRect(50, y, thumbSize, thumbSize, 8);
					ctx.clip();
					const iw = (img as { width: number }).width;
					const ih = (img as { height: number }).height;
					const s = Math.max(thumbSize / iw, thumbSize / ih);
					ctx.drawImage(img, 50 + thumbSize / 2 - (iw * s) / 2, y + thumbSize / 2 - (ih * s) / 2, iw * s, ih * s);
					ctx.restore();
					// 순번 배지
					ctx.fillStyle = hexToRgba(theme.primary, 0.9);
					ctx.beginPath();
					ctx.roundRect(50, y, 24, 24, 6);
					ctx.fill();
					ctx.fillStyle = '#0d1117';
					ctx.font = '700 14px "Noto Sans KR", sans-serif';
					ctx.textAlign = 'center';
					ctx.fillText(String(i + 1), 50 + 12, y + 17);
					thumbDrawn = true;
				}
			}
			if (!thumbDrawn) {
				ctx.save();
				ctx.beginPath();
				ctx.roundRect(50, y, thumbSize, thumbSize, 8);
				ctx.fillStyle = hexToRgba(theme.primary, 0.15);
				ctx.fill();
				ctx.strokeStyle = 'rgba(255,255,255,0.12)';
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.fillStyle = theme.primary;
				ctx.font = '700 20px "Noto Sans KR", sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText(String(i + 1), 50 + thumbSize / 2, y + thumbSize / 2 + 7);
				ctx.restore();
			}
			// 텍스트
			ctx.textAlign = 'left';
			ctx.fillStyle = '#ffffff';
			ctx.font = '600 17px "Noto Sans KR", sans-serif';
			ctx.fillText(truncate(ctx, track.title, 500), 50 + thumbSize + 14, y + 24);
			ctx.fillStyle = 'rgba(255,255,255,0.5)';
			ctx.font = '400 13px "Noto Sans KR", sans-serif';
			ctx.fillText(truncate(ctx, track.artist, 500), 50 + thumbSize + 14, y + 46);
		}
	}

	// ── 하단 정보 (계정/참가일) ──
	const footerY = H - 28;
	ctx.textAlign = 'right';
	ctx.fillStyle = textMuted();
	ctx.font = '400 13px "Noto Sans KR", sans-serif';
	const created = input.accountCreated
		? new Date(input.accountCreated).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
		: '';
	const joined = input.guildJoinedAt
		? new Date(input.guildJoinedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
		: '';
	ctx.fillText(created + (joined ? ` · 서버 참가 ${joined}` : ''), W - 50, footerY);
	ctx.fillStyle = hexToRgba(theme.primary, 0.8);
	ctx.font = '700 14px "Noto Sans KR", sans-serif';
	ctx.fillText('SiruBOT', W - 50, footerY - 22);

	return (await canvas.toBuffer('png')) as Buffer;
}
