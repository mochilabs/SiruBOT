import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 봇 전용 앱 이모지(application emoji) 참조 헬퍼.
 *
 * 로드 순서:
 * 1. `scripts/upload-emojis.ts`가 미리 생성한
 *    `apps/bot/resources/emoji-ids.json` (이름→ID 매핑)을 읽어요.
 * 2. 파일이 없거나 부분적으로 비어 있으면 Discord API
 *    (`GET /applications/{app.id}/emojis`)에서 앱 이모지 목록을 직접
 *    가져와 메모리에 적재해요 — 이모지 유지는 application 소유라
 *    토큰·매핑 파일과 무관하게 언제든 재구성 가능해요.
 *
 * - 앱 이모지는 봇이 보내는 메시지에서 USE_EXTERNAL_EMOJIS 없이 사용 가능
 * - API 조회도 실패하면(네트워크·권한) 유니코드 폴백 문자열을 반환
 *
 * 참고: Discord에서 이모지를 실제로 렌더하려면 id가 유효해야 하므로
 * 매핑에 등록된 이름은 앱 이모지로 실존하는 것만 넣어야 해요.
 */

type EmojiIdMap = Record<string, string>;

let cachedMap: EmojiIdMap | null = null;
let loadPromise: Promise<EmojiIdMap> | null = null;

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
			const raw = await readFile(path, 'utf-8');
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

/** 매핑 로드 (최초 1회, 이후 캐시). 파일 실패 시 Discord API fetch로 폴백. */
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
				// API 조회 실패 — appEmoji()가 전부 유니코드 폴백으로 진행돼요
			}
		}
		return map;
	})();
	cachedMap = await loadPromise;
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
