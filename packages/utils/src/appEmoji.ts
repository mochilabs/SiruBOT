import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 앱 이모지 매니저 — 이름·폴백 관리를 한 곳에서 해요.
 *
 * 로드 순서:
 * 1. `scripts/upload-emojis.ts`가 미리 생성한
 *    `resources/emoji_replacement/emoji-ids.json` (이름→ID 매핑)을 읽어요.
 * 2. 봇 `appEmojiManager`가 부팅 후 Discord API에서 조회한 매핑을
 *    `setAppEmojiIdMap()`으로 주입해요 — 파일 로드 이후의 단일 보충 경로예요.
 *
 * - 앱 이모지는 봇이 보내는 메시지에서 USE_EXTERNAL_EMOJIS 없이 사용 가능
 * - 로드가 빈 결과면 유니코드 폴백 문자열을 반환해요 (재시도 계약은 ensureAppEmojisLoaded 문서 참조)
 *
 * 사용 규칙:
 * - `emoji('name')` — 등록된 이름이면 `<:name:id>`, 아니면 표준 유니코드 폴백.
 *   같은 이름에 폴백이 여러 번 다르게 쓰이지 않게, 표준 폴백은 APP_EMOJI_FALLBACKS 표 한 곳에서만
 *   관리해요. 표에 없는 이름만 `emoji('name', fallback)`으로 직접 폴백을 넣어요.
 */

type EmojiIdMap = Record<string, string>;

/**
 * 유니코드 폴백 표 — 키 = resources/emoji_replacement/ png 파일명(=앱 이모지 이름).
 * 폴백 문자열의 단일 진실 공급원. 새 이모지 추가 시 이 표에 한 줄만 넣으면
 * `emoji('이름')` 어디서든 동일 폴백을 써요.
 */
const APP_EMOJI_FALLBACKS = {
	arrow_back: '⏮️',
	arrow_down: '⬇️',
	arrow_forward: '⏭️',
	arrow_up: '⬆️',
	artist: '💿',
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
	chapter: '🎬',
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
	heart: '❤️',
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
	repeat_off: '🔁̸',
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
	volume_down: '🔉',
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
/** 30초 예약 재시도가 이미 있는지 표시하는 플래그 */
let retryScheduled = false;

/** JSON 매핑 파일 후보 경로 — 커밋된 canonical(레포 루트)과 런타임 각 CWD 기준 */
function candidatePaths(): string[] {
	return [
		join(process.cwd(), 'resources', 'emoji_replacement', 'emoji-ids.json'), // monorepo 루트 실행 / Docker builder
		join(process.cwd(), '..', '..', 'resources', 'emoji_replacement', 'emoji-ids.json'), // apps/bot CWD
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
 * 외부(봇 AppEmojiManager)에서 조회한 이름→ID 매핑을 주입한다.
 * API 응답이 부분적이어도 기존 ID를 보존하고, 새로 확인한 ID는 우선 적용해요.
 */
export function setAppEmojiIdMap(map: EmojiIdMap): void {
	if (map && Object.keys(map).length) cachedMap = { ...cachedMap, ...map };
}

/** 매핑 로드 (성공 시 최초 1회, 이후 캐시). 빈 결과는 캐시하지 않고 30초 뒤 한 번만 재시도해요. */
export async function ensureAppEmojisLoaded(): Promise<void> {
	if (cachedMap) return;
	loadPromise ??= loadEmojiIdMap();

	const map = await loadPromise;
	if (Object.keys(map).length) {
		cachedMap = map;
		return;
	}
	// 캐시하지 않으므로 다음 호출이 다시 읽도록 loadPromise만 리셋해요
	loadPromise = null;
	// 다음 호출이 없을 수 있어 30초 뒤 재시도를 예약해요, retryScheduled 플래그로 중복 예약을 막아요
	if (!retryScheduled) {
		retryScheduled = true;
		setTimeout(() => void ensureAppEmojisLoaded(), 30_000).unref?.();
	}
}
