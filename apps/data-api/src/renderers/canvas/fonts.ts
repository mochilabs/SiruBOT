/**
 * 카드 폰트 등록 + skia Path2D 생성자 싱글턴 — canvasUtils의 폰트 side effect 몸체예요.
 */
import { getLogger } from '../../utils/logger.ts';

/** 로거 채널은 분할 전과 같게 'canvasUtils'를 써요 (로그 계약 유지). */
const logger = getLogger('canvasUtils');

/** skia Path2D 생성자 싱글턴 — ensureKoreanFont()에서 세팅돼요. */
let pathCtorRef: (new (d: string) => unknown) | null = null;

/** Path2D 생성자 — lucide 아이콘은 이 싱글턴으로 경로를 만들어요. ensureKoreanFont() 호출 전엔 null이에요. */
export function getPath2DConstructor(): (new (d: string) => unknown) | null {
	return pathCtorRef;
}

/** 카드 폰트(한·영·일 Pretendard JP + 색 이모지 Twemoji) 1회 등록 (Dockerfile에 resources/fonts 포함). + lucide Path2D 워밍업. */
export async function ensureKoreanFont(): Promise<void> {
	const { FontLibrary, Path2D } = await import('skia-canvas');
	pathCtorRef = Path2D as unknown as new (d: string) => unknown;
	try {
		if (!FontLibrary.has('Pretendard JP')) {
			const { existsSync } = await import('node:fs');
			const { join } = await import('node:path');
			// 런타임 CWD는 프로덕션(/app)·dev(apps/data-api)로 달라요 — repo 루트 resources도 후보로 탐색해요.
			const fontDirs = [join(process.cwd(), 'resources/fonts'), join(process.cwd(), '../../resources/fonts')];
			const resolveFontFile = (fileName: string): string | null => {
				for (const dir of fontDirs) {
					const fontPath = join(dir, fileName);
					if (existsSync(fontPath)) return fontPath;
				}
				return null;
			};

			// 한·영·일본어 — 가변 가중치(45~920). Pretendard 본체에는 일본어 한자가 없어 JP 변형이 맞아요.
			const pretendardPath = resolveFontFile('PretendardJPVariable.ttf');
			if (pretendardPath) {
				FontLibrary.use('Pretendard JP', [pretendardPath]);
			} else {
				logger.warn('PretendardJPVariable.ttf를 찾지 못했어요. 카드 텍스트가 시스템 폰트로 폴백해요.');
			}

			// 색 이모지(COLR/CPAL) — 곡 제목·닉네임의 이모지를 카드에 렌더 (CC-BY 4.0, 대시보드 /licenses에 고지)
			const twemojiPath = resolveFontFile('TwemojiMozilla.ttf');
			if (twemojiPath) {
				FontLibrary.use('Twemoji Mozilla', [twemojiPath]);
			} else {
				logger.warn('TwemojiMozilla.ttf를 찾지 못했어요. 카드 이모지가 tofu로 그려질 수 있어요.');
			}
		}
	} catch (error) {
		logger.error(`font load failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}
