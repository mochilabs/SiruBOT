import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 봇 전용 앱 이모지(application emoji) 참조 헬퍼.
 *
 * `scripts/upload-emojis.ts`가 resources/emoji_replacement/ 의 PNG를
 * Discord 앱 이모지로 업로드하고, 생성된 이름→ID 매핑을
 * `apps/bot/resources/emoji-ids.json` 으로 저장해요. 봇 부팅 시 이 파일을
 * 읽어 `<:name:id>` 문자열을 만들어 주는 게 이 모듈의 역할이에요.
 *
 * - 앱 이모지는 봇이 보내는 메시지에서 USE_EXTERNAL_EMOJIS 없이 사용 가능
 * - 매핑 파일이 없거나(개발 신규 환경) 해당 이름이 없으면 유니코드 폴백 문자열을 반환
 */

type EmojiIdMap = Record<string, string>;

let cachedMap: EmojiIdMap | null = null;
let loadPromise: Promise<EmojiIdMap> | null = null;

/** JSON 매핑 파일 후보 경로 (CWD 차이 방지 — apps/bot 기준) */
function candidatePaths(): string[] {
	return [join(process.cwd(), 'resources', 'emoji-ids.json'), join(process.cwd(), 'apps', 'bot', 'resources', 'emoji-ids.json')];
}

async function loadEmojiIdMap(): Promise<EmojiIdMap> {
	for (const path of candidatePaths()) {
		try {
			const raw = await readFile(path, 'utf-8');
			const parsed = JSON.parse(raw) as EmojiIdMap;
			if (parsed && typeof parsed === 'object') return parsed;
		} catch {
			// 파일 없음/파싱 실패 → 다음 후보
		}
	}
	return {};
}

/** 매핑 로드 (최초 1회, 이후 캐시) */
export async function ensureAppEmojisLoaded(): Promise<void> {
	if (cachedMap) return;
	loadPromise ??= loadEmojiIdMap().then((map) => {
		cachedMap = map;
		return map;
	});
	await loadPromise;
}

/**
 * 앱 이모지 `<:name:id>` 문자열. 매핑에 없으면 fallback(유니코드 이모지) 반환.
 * 봇 코드에서 `${appEmoji('star', '⭐')}` 형태로 사용하세요.
 */
export function appEmoji(name: string, fallback: string): string {
	const id = cachedMap?.[name];
	if (!id) return fallback;
	// 이름에 이모지 이름 규칙 외 문자가 들어간 매핑은 방어적으로 무시
	if (!/^[a-z0-9_]{2,32}$/.test(name)) return fallback;
	return `<:${name}:${id}>`;
}

/** 매핑 파일의 이름 목록 (디버그/.help용) */
export function availableAppEmojiNames(): string[] {
	return cachedMap ? Object.keys(cachedMap) : [];
}

/** 로드된 매핑 크기 */
export function appEmojiCount(): number {
	return cachedMap ? Object.keys(cachedMap).length : 0;
}
