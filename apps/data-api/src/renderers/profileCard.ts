/**
 * 프로필 카드 렌더러 — skia-canvas로 유저 프로필을 이미지 카드로 그려요.
 * 별자리 배경(별자리별 시그니처 컬러+별자리 실제 별자리 무늬) + 배너(있으면) + 프로필사진.
 * 생일 표기는 payload에 있을 때만 — 봇이 본인 조회 때만 넣어요.
 */
import type { Canvas, CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';

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
	/** 회원가입일 ISO 또는 unix초 */
	accountCreated: string | null;
	/** 길드 참가일 — 있으면 표시 */
	guildJoinedAt?: string | null;
	/** 서버 이름 (표시용) */
	guildName?: string | null;
}

/** 별자리 시그니처 컬러 + 별자리 무늬 (대략적 실제 자리 형태) */
interface ZodiacTheme {
	accent: string;
	bg1: string;
	bg2: string;
	/** 정규화 좌표(0~1) 별들 — polyline으로 이어서 그려요. 빈 배열이면 산개 별만 */
	starLine: [number, number][];
}

const ZODIAC_THEMES: Record<string, ZodiacTheme> = {
	'01': {
		accent: '#ff6b6b',
		bg1: '#2a1530',
		bg2: '#0e0b14',
		starLine: [
			[0.2, 0.62],
			[0.3, 0.58],
			[0.4, 0.52],
			[0.5, 0.56]
		]
	}, // 양자리
	'02': {
		accent: '#ffb347',
		bg1: '#4a1d1d',
		bg2: '#140b0c',
		starLine: [
			[0.3, 0.55],
			[0.38, 0.48],
			[0.45, 0.52],
			[0.5, 0.6],
			[0.42, 0.66],
			[0.34, 0.64],
			[0.28, 0.6]
		]
	}, // 황소 V자
	'03': {
		accent: '#4dc9ff',
		bg1: '#1a2a4a',
		bg2: '#0b0e18',
		starLine: [
			[0.35, 0.4],
			[0.35, 0.5],
			[0.38, 0.6],
			[0.4, 0.7],
			[0.45, 0.75],
			[0.44, 0.64],
			[0.46, 0.55],
			[0.55, 0.42],
			[0.56, 0.52],
			[0.58, 0.62],
			[0.6, 0.72],
			[0.65, 0.76],
			[0.63, 0.66],
			[0.62, 0.54],
			[0.6, 0.44]
		]
	}, // 쌍둥이(두 기둥)
	'04': {
		accent: '#7ddeff',
		bg1: '#12283a',
		bg2: '#080d12',
		starLine: [
			[0.38, 0.45],
			[0.42, 0.55],
			[0.5, 0.6],
			[0.52, 0.7],
			[0.56, 0.74],
			[0.6, 0.68],
			[0.58, 0.58],
			[0.56, 0.5]
		]
	}, // 게자리 Y
	'05': {
		accent: '#ffd75e',
		bg1: '#3a2a10',
		bg2: '#100c07',
		starLine: [
			[0.32, 0.42],
			[0.36, 0.34],
			[0.44, 0.3],
			[0.48, 0.36],
			[0.44, 0.42],
			[0.38, 0.44],
			[0.34, 0.48],
			[0.4, 0.55],
			[0.5, 0.58],
			[0.58, 0.62],
			[0.64, 0.56],
			[0.68, 0.6]
		]
	}, // 사자 낫+삼각
	'06': {
		accent: '#b7ff7d',
		bg1: '#22330f',
		bg2: '#0a0f06',
		starLine: [
			[0.28, 0.5],
			[0.34, 0.44],
			[0.4, 0.46],
			[0.46, 0.4],
			[0.52, 0.44],
			[0.56, 0.52],
			[0.52, 0.6],
			[0.56, 0.68],
			[0.62, 0.72]
		]
	}, // 처녀
	'07': {
		accent: '#d1a3ff',
		bg1: '#301a3a',
		bg2: '#0f0914',
		starLine: [
			[0.3, 0.6],
			[0.36, 0.52],
			[0.5, 0.5],
			[0.64, 0.52],
			[0.7, 0.6]
		]
	}, // 천칭
	'08': {
		accent: '#ff9a76',
		bg1: '#3a1a10',
		bg2: '#120a07',
		starLine: [
			[0.3, 0.4],
			[0.34, 0.34],
			[0.42, 0.36],
			[0.46, 0.44],
			[0.54, 0.5],
			[0.58, 0.58],
			[0.64, 0.62],
			[0.7, 0.56],
			[0.72, 0.62],
			[0.66, 0.64]
		]
	}, // 전갈 갈고리
	'09': {
		accent: '#ffd1dc',
		bg1: '#33152a',
		bg2: '#100711',
		starLine: [
			[0.28, 0.7],
			[0.36, 0.66],
			[0.44, 0.62],
			[0.5, 0.56],
			[0.54, 0.5],
			[0.58, 0.56],
			[0.6, 0.64],
			[0.62, 0.72],
			[0.58, 0.5],
			[0.55, 0.42],
			[0.58, 0.36],
			[0.64, 0.3]
		]
	}, // 궁수 찻주전자
	'10': {
		accent: '#a5ffdd',
		bg1: '#0f332a',
		bg2: '#071110',
		starLine: [
			[0.25, 0.45],
			[0.35, 0.5],
			[0.45, 0.55],
			[0.55, 0.58],
			[0.65, 0.62],
			[0.72, 0.66],
			[0.7, 0.72],
			[0.6, 0.7],
			[0.5, 0.66],
			[0.4, 0.62],
			[0.3, 0.56],
			[0.24, 0.5],
			[0.22, 0.46]
		]
	}, // 염소 웃는 대곡선
	'11': {
		accent: '#8ff0ff',
		bg1: '#0f2e38',
		bg2: '#070f12',
		starLine: [
			[0.28, 0.38],
			[0.34, 0.44],
			[0.42, 0.42],
			[0.48, 0.48],
			[0.56, 0.46],
			[0.62, 0.52],
			[0.68, 0.5],
			[0.7, 0.56],
			[0.64, 0.6],
			[0.58, 0.56],
			[0.5, 0.6],
			[0.44, 0.64],
			[0.38, 0.6],
			[0.3, 0.56]
		]
	}, // 물병 지그재그
	'12': {
		accent: '#a3b3ff',
		bg1: '#181530',
		bg2: '#0a0814',
		starLine: [
			[0.3, 0.36],
			[0.34, 0.44],
			[0.32, 0.5],
			[0.28, 0.58],
			[0.32, 0.66],
			[0.4, 0.7],
			[0.5, 0.68],
			[0.6, 0.7],
			[0.68, 0.66],
			[0.72, 0.58],
			[0.7, 0.5],
			[0.72, 0.42],
			[0.7, 0.34]
		]
	} // 물고기 두 V
};

function hashString(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** 결정적 의사난수 (같은 유저는 같은 별밭) */
function makeRng(seed: number): () => number {
	let s = seed || 1;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

function hexToRgba(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	const r = (n >> 16) & 255;
	const g = (n >> 8) & 255;
	const b = n & 255;
	return `rgba(${r},${g},${b},${alpha})`;
}

async function loadImage(url: string): Promise<CanvasDrawable | null> {
	try {
		const { loadImage } = await import('skia-canvas');
		const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) return null;
		const buf = Buffer.from(await res.arrayBuffer());
		return (await loadImage(buf)) as unknown as CanvasDrawable;
	} catch {
		return null;
	}
}

/** 별 그리기 — 크기별로 4각 반짝 또는 원 */
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, color: string, spark: boolean): void {
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.fillStyle = color;
	if (spark && r > 1.6) {
		ctx.beginPath();
		for (let i = 0; i < 4; i++) {
			const a = (Math.PI / 2) * i;
			ctx.lineTo(x + Math.cos(a) * r * 2.2, y + Math.sin(a) * r * 2.2);
			ctx.lineTo(x + Math.cos(a + Math.PI / 4) * r * 0.5, y + Math.sin(a + Math.PI / 4) * r * 0.5);
		}
		ctx.closePath();
		ctx.fill();
	}
	ctx.beginPath();
	ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

export async function renderProfileCard(input: ProfileCardInput): Promise<Buffer> {
	const { Canvas, FontLibrary } = await import('skia-canvas');
	// 가변폰트 등록(1회). 시스템 폰트가 망가진 환경(프로덕션 slim 컨테이너) 대비.
	try {
		if (!FontLibrary.has('Noto Sans KR')) {
			const { join } = await import('node:path');
			FontLibrary.use('Noto Sans KR', [join(process.cwd(), 'resources/fonts/NotoSansKR.ttf')]);
		}
	} catch {
		// 시스템 폰트 폴백
	}

	const W = 920;
	const H = 480;
	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');

	const theme = (input.zodiacCode && ZODIAC_THEMES[input.zodiacCode]) || ZODIAC_THEMES['12'];
	const rng = makeRng(hashString(`${input.userId ?? input.username}:${input.zodiacCode ?? ''}`));

	// ── 배경: 배너가 있으면 커버+어둡게, 없으면 별자리 그라디언트 ──
	let bannerUsed = false;
	if (input.bannerUrl) {
		const img = await loadImage(input.bannerUrl);
		if (img) {
			const scale = Math.max(W / img.width, H / img.height);
			const dw = img.width * scale;
			const dh = img.height * scale;
			ctx.save();
			ctx.globalAlpha = 0.85;
			ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
			ctx.restore();
			bannerUsed = true;
		}
	}
	if (!bannerUsed) {
		const g = ctx.createLinearGradient(0, 0, W, H);
		g.addColorStop(0, theme.bg1);
		g.addColorStop(1, theme.bg2);
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, W, H);
	}

	// 가독성 오버레이 (배너 위/그라디언트 위 공통)
	const fog = ctx.createLinearGradient(0, 0, 0, H);
	fog.addColorStop(0, hexToRgba(bannerUsed ? theme.bg2 : theme.bg2, 0.35));
	fog.addColorStop(1, hexToRgba('#06070b', 0.92));
	ctx.fillStyle = fog;
	ctx.fillRect(0, 0, W, H);

	// ── 별밭 + 별자리 무늬 ──
	for (let i = 0; i < 70; i++) {
		const x = rng() * W;
		const y = rng() * H;
		const r = rng() * 1.8 + 0.4;
		drawStar(ctx, x, y, r, 0.12 + rng() * 0.35, '#ffffff', rng() > 0.82);
	}
	// 별자리 실제 형태 (우상단, 은은하게)
	if (theme.starLine.length > 0) {
		const mapX = (nx: number) => W * 0.52 + nx * W * 0.42;
		const mapY = (ny: number) => H * 0.08 + ny * H * 0.52;
		ctx.save();
		ctx.globalAlpha = 0.5;
		ctx.strokeStyle = hexToRgba(theme.accent, 0.55);
		ctx.lineWidth = 1.4;
		ctx.setLineDash([5, 7]);
		ctx.beginPath();
		theme.starLine.forEach(([nx, ny], i) => (i === 0 ? ctx.moveTo(mapX(nx), mapY(ny)) : ctx.lineTo(mapX(nx), mapY(ny))));
		ctx.stroke();
		ctx.setLineDash([]);
		theme.starLine.forEach(([nx, ny], i) => {
			const r = i === 0 || i === theme.starLine.length - 1 ? 2.6 : 1.9;
			drawStar(ctx, mapX(nx), mapY(ny), r, 0.85, theme.accent, true);
		});
		ctx.restore();
	}

	// ── 카드 반투명 본문 패널 (좌측) ──
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(36, 36, 560, H - 72, 22);
	ctx.fillStyle = hexToRgba('#0a0c12', 0.62);
	ctx.fill();
	ctx.strokeStyle = hexToRgba(theme.accent, 0.35);
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.restore();

	// ── 아바타 (원형 크롭 + 링) ──
	const AV = 118;
	const ax = 36 + 30 + AV / 2;
	const ay = 36 + 34 + AV / 2;
	ctx.save();
	if (input.avatarUrl) {
		const img = await loadImage(input.avatarUrl);
		if (img) {
			ctx.beginPath();
			ctx.arc(ax, ay, AV / 2, 0, Math.PI * 2);
			ctx.clip();
			const s = Math.max(AV / img.width, AV / img.height);
			ctx.drawImage(img, ax - (img.width * s) / 2, ay - (img.height * s) / 2, img.width * s, img.height * s);
		} else {
			ctx.beginPath();
			ctx.arc(ax, ay, AV / 2, 0, Math.PI * 2);
			ctx.fillStyle = '#262a38';
			ctx.fill();
		}
	} else {
		ctx.beginPath();
		ctx.arc(ax, ay, AV / 2, 0, Math.PI * 2);
		ctx.fillStyle = '#262a38';
		ctx.fill();
	}
	ctx.restore();
	ctx.beginPath();
	ctx.arc(ax, ay, AV / 2 + 4, 0, Math.PI * 2);
	ctx.strokeStyle = theme.accent;
	ctx.lineWidth = 3;
	ctx.stroke();

	// ── 이름/유저네임 ──
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = '#ffffff';
	ctx.font = '700 36px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
	ctx.fillText(clip(input.displayName, 16), 232, 96);
	ctx.fillStyle = 'rgba(255,255,255,0.55)';
	ctx.font = '400 20px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
	ctx.fillText(`@${input.username}`, 232, 128);

	// ── 별자리 라인 ──
	const zodiacLineY = 172;
	ctx.fillStyle = theme.accent;
	ctx.beginPath();
	ctx.arc(242, zodiacLineY - 7, 5, 0, Math.PI * 2);
	ctx.fill();
	ctx.font = '700 24px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
	const zodiacText = `${input.zodiacKo}${input.zodiacJp ? ` · ${input.zodiacJp}` : ''}`;
	const zodiacWidth = ctx.measureText(zodiacText).width;
	ctx.fillStyle = theme.accent;
	ctx.fillText(zodiacText, 258, zodiacLineY);
	if (input.birthMonth != null && input.birthDay != null) {
		ctx.fillStyle = 'rgba(255,255,255,0.85)';
		ctx.font = '500 20px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
		ctx.fillText(`${input.birthMonth}월 ${input.birthDay}일 생`, 258 + zodiacWidth + 12, zodiacLineY + 1);
	}

	// ── 구분선 ──
	ctx.strokeStyle = 'rgba(255,255,255,0.14)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(68, 216);
	ctx.lineTo(564, 216);
	ctx.stroke();

	// ── 통계 3열 ──
	const stats = [
		{ label: '플레이리스트', value: `${input.playlistCount}개` },
		{ label: '신청한 곡', value: `${input.requestedCount}곡` },
		{ label: '총 청취', value: listenShort(input.listenText) }
	];
	stats.forEach((s, i) => {
		const x = 68 + i * 170;
		ctx.fillStyle = 'rgba(255,255,255,0.5)';
		ctx.font = '400 15px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
		ctx.fillText(s.label, x, 254);
		ctx.fillStyle = '#ffffff';
		ctx.font = '700 28px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
		ctx.fillText(s.value, x, 288);
	});

	// ── 계정/참가일 ──
	ctx.fillStyle = 'rgba(255,255,255,0.5)';
	ctx.font = '400 15px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
	const created = input.accountCreated ? dateShort(input.accountCreated) : '알 수 없음';
	const joined = input.guildJoinedAt ? `서버 참가 ${dateShort(input.guildJoinedAt)}` : '';
	ctx.fillText(`계정 ${created}${joined ? ' · ' + joined : ''}`, 68, 330);

	// ── 우측 대형 별자리 워터마크 ──
	ctx.save();
	ctx.globalAlpha = 0.09;
	ctx.fillStyle = '#ffffff';
	ctx.font = '800 150px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
	const wl = input.zodiacCode ? String(input.zodiacCode) : '?';
	ctx.textAlign = 'center';
	ctx.fillText(wl, W - 150, H - 120);
	ctx.restore();

	// ── 하단 브랜딩 ──
	ctx.textAlign = 'right';
	ctx.fillStyle = hexToRgba(theme.accent, 0.9);
	ctx.font = '700 17px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
	ctx.fillText('SiruBOT', W - 46, H - 40);
	ctx.fillStyle = 'rgba(255,255,255,0.35)';
	ctx.font = '400 13px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
	ctx.fillText('프로필 카드', W - 46, H - 20);

	return (await canvas.toBuffer('png')) as Buffer;
}

function clip(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function listenShort(text: string): string {
	return text.replace(/\s/g, ' ').length > 12 ? `${text.split(' ').slice(0, 2).join(' ')}+` : text;
}

function dateShort(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
	return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
