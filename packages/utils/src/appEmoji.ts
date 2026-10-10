import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 앱 이모지 매니저 — 이름·폴백 관리를 한 곳에서 해요.
 *
 * 로드 순서:
 * 1. `scripts/upload-emojis.ts`가 미리 생성한
 *    `resources/emoji_replacement/emoji-ids.json` (이름→ID 매핑)을 읽어요.
 * 2. 파일이 없거나 부분적으로 비어 있으면 Discord API
 *    (`GET /applications/{app.id}/emojis`)에서 앱 이모지 목록을 직접
 *    가져와 메모리에 적재해요 — 이모지 유지는 application 소유라
 *    토큰·매핑 파일과 무관하게 언제든 재구성 가능해요.
 *
 * - 앱 이모지는 봇이 보내는 메시지에서 USE_EXTERNAL_EMOJIS 없이 사용 가능
 * - API 조회도 실패하면(네트워크·권한) 유니코드 폴백 문자열을 반환
 *   (빈 결과는 캐시하지 않아요 — 부팅 시점의 일시 장애가 프로세스 생애
 *   전체를 폴백으로 고정하지 않게 다음 호출이 재시도하고, 30초 뒤 한 번만 예약 재시도해요)
 *
 * 사용 규칙:
 * - `e('name', fallback)` — 등록된 이름이면 `<:name:id>`, 아니면 폴백 유니코드.
 *   같은 이름에 폴백이 여러 번 다르게 쓰이지 않게, 표준 폴백은 EMOTIONS 표 한 곳에서만
 *   관리해요. 직접 폴백을 넣는 건 표에 없는 이름뿐이에요.
 */

type EmojiIdMap = Record<string, string>;

/**
 * 유니코드 폴백 표 — 키 = resources/emoji_replacement/ png 파일명(=앱 이모지 이름).
 * 폴백 문자열의 단일 진실 공급원. 새 이모지 추가 시 이 표에 한 줄만 넣으면
 * `e('이름')` 어디서든 동일 폴백을 써요.
 */
export const APP_EMOJI_FALLBACKS = {
	arrow_back: '⏮️',
	arrow_down: '⬇️',
	arrow_forward: '⏭️',
	arrow_up: '⬆️',
	bag: '👜',
	bell: '🔔',
	boom: '💥',
	box: '📦',
	pause: '⏸️',
	broken_heart: '💔',
	bulb: '💡',
	cake: '🍰',
	calendar: '📅',
	cat: '🐱',
	cd: '💿',
	chart: '📊',
	clipboard: '📋',
	clock: '🕐',
	cloudy: '☁️',
	clover: '🍀',
	coin: '🪙',
	crown: '👑',
	crystal_ball: '🔮',
	dice: '🎲',
	disk: '💾',
	drop: '💧',
	error: '❌',
	eye: '👁️',
	fire: '🔥',
	fist: '✊',
	fist_bump: '👊',
	flash: '⚡',
	folder: '📁',
	frame: '🖼️',
	gamepad: '🎮',
	gem: '💎',
	globe: '🌐',
	headphone: '🎧',
	hourglass: '⏳',
	house: '🏠',
	id: '🆔',
	inbox_tray: '📥',
	info: 'ℹ️',
	key: '🔑',
	link: '🔗',
	lock: '🔒',
	magnet: '🔎',
	mask: '🎭',
	music_note: '🎵',
	music_notes: '🎶',
	palette: '🎨',
	party: '🎉',
	people: '👥',
	pin: '📌',
	play: '▶️',
	plus: '➕',
	radio_wave: '📡',
	rain: '🌧️',
	repeat: '🔁',
	repeat_one: '🔂',
	robot: '🤖',
	scissors: '✂️',
	scroll: '📄',
	shield: '🛡️',
	shuffle: '🔀',
	stop: '⏹️',
	sleep: '😴',
	smile: '😀',
	sparkle: '✨',
	spectrum: '📊',
	speech: '💬',
	sprout: '🌱',
	star: '⭐',
	success: '✅',
	sun_cloud: '⛅',
	thermo: '🌡️',
	tools: '🛠️',
	trash: '🗑️',
	trophy: '🏆',
	user: '👤',
	volume_muted: '🔇',
	volume_up: '🔊',
	warning: '⚠️',
	wave: '👋',
	windy: '🌬️'
} as const;

export type AppEmojiFallbackKey = keyof typeof APP_EMOJI_FALLBACKS;

/** 등록된 앱 이모지 `<:name:id>`, 없으면 표준 유니코드 폴백. 폴백 표에 없는 이름은 직접 폴백을 넣어요. */
export function emoji(name: AppEmojiFallbackKey): string;
export function emoji(name: string, fallback: string): string;
export function emoji(name: string, fallback?: string): string {
	const id = cachedMap?.[name];
	const fallbackText = fallback ?? (name in APP_EMOJI_FALLBACKS ? APP_EMOJI_FALLBACKS[name as AppEmojiFallbackKey] : '❓');
	if (!id) return fallbackText;
	// 이름에 이모지 이름 규칙 외 문자가 들어간 매핑은 방어적으로 무시
	if (!/^[a-z0-9_]{2,32}$/.test(name)) return fallbackText;
	return `<:${name}:${id}>`;
}

let cachedMap: EmojiIdMap | null = null;
let loadPromise: Promise<EmojiIdMap> | null = null;
/** 빈 결과일 때 30초 뒤 재시도를 한 번만 예약하기 위한 플래그 */
let retryScheduled = false;

/** JSON 매핑 파일 후보 경로 — 커밋된 canonical(레포 루트)과 런타임 각 CWD 기준 */
function candidatePaths(): string[] {
	return [
		join(process.cwd(), 'resources', 'emoji_replacement', 'emoji-ids.json'), // monorepo 루트 실행 / Docker builder
		join(process.cwd(), 'resources', 'emoji-ids.json'), // apps/bot CWD (yarn workspace start)
		join(process.cwd(), 'apps', 'bot', 'resources', 'emoji-ids.json'), // monorepo 루트에서 봇만 개별 실행
		join('/app', 'resources', 'emoji_replacement', 'emoji-ids.json') // Docker 컨테이너 (/app=COPY resources)
	];
}

async function loadEmojiIdMap(): Promise<EmojiIdMap> {
	for (const path of candidatePaths()) {
		try {
			// turbopackIgnore — 런타임 CWD 의존 경로라 빌드 트레이싱에서 제외해요
			// (트레이싱되면 이 import를 거친 서버 산출물에 프로젝트 전체가 포함돼요)
			const raw = await readFile(/* turbopackIgnore: true */ path, 'utf-8');
			const parsed = JSON.parse(raw) as EmojiIdMap;
			if (parsed && typeof parsed === 'object') return parsed;
		} catch {
			// 파일 없음/파싱 실패 → 다음 후보
		}
	}
	return {};
}

/**
 * 앱 이모지 ID 등록 방법 — discord.js 애플리케이션 이모지 매니저 또는
 * REST. 패키지(utils)가 discord.js를 알 필요 없게 느슨한 인터페이스로 받아요.
 * 매핑 파일 우선 실패 시에만 호출돼요 (네트워크 비용 최소화).
 */
export type AppEmojiFetcher = () => Promise<Array<{ id: string; name: string }>>;

/**
 * 봇 부팅 시 fetcher를 등록 — clientReady에서
 * `configureAppEmojiFetcher(async () => [...client.application.emojis.fetch()...])` 형태로.
 */
let apiFetcher: AppEmojiFetcher | null = null;
export function configureAppEmojiFetcher(fetcher: AppEmojiFetcher): void {
	apiFetcher = fetcher;
}

/** 매핑 로드 (성공 시 최초 1회, 이후 캐시). 파일 실패 시 Discord API fetch로 폴백. 빈 결과는 캐시하지 않고 30초 뒤 한 번만 재시도해요. */
export async function ensureAppEmojisLoaded(): Promise<void> {
	if (cachedMap) return;
	loadPromise ??= (async () => {
		let map = await loadEmojiIdMap();
		if (!Object.keys(map).length && apiFetcher) {
			try {
				const emojis = await apiFetcher();
				map = emojis.reduce<EmojiIdMap>((acc, e) => {
					acc[e.name] = e.id;
					return acc;
				}, {});
			} catch {
				// API 조회 실패 — emoji()가 전부 유니코드 폴백으로 진행돼요
			}
		}
		return map;
	})();

	const map = await loadPromise;
	if (Object.keys(map).length) {
		cachedMap = map;
		return;
	}
	// 빈 결과는 일시 장애일 수 있어 캐시하지 않아요 — 다음 호출이 재시도하게 loadPromise만 리셋
	loadPromise = null;
	// clientReady에서 사실상 1회만 호출돼 다음 호출이 없을 수 있으니, 30초 뒤 재시도를 한 번만 예약해요
	if (!retryScheduled) {
		retryScheduled = true;
		setTimeout(() => void ensureAppEmojisLoaded(), 30_000).unref?.();
	}
}
