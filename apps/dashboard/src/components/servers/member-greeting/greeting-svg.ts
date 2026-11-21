import { CARD_FONT, greetingCard } from "@sirubot/cards";
import {
  GREETING_CARD_H,
  GREETING_CARD_W,
  type GreetingImage,
} from "@sirubot/utils/memberGreeting";

/**
 * 인사 카드 미리보기 SVG — data-api가 Discord로 보내는 PNG와 같은 `greetingCard` 노드를 브라우저에서 satori로 그려요.
 * satori(와 yoga wasm)는 처음 미리보기를 그릴 때 동적 import로 받고, 폰트(한글 서브셋 600·900)도 그때 한 번만 받아요.
 * 서브셋 파일은 resources/fonts의 정적 서브셋과 같은 파일이에요 (public/fonts, 약 2.6MB씩, 압축 전송 시 약 1MB).
 */

const FONT_FILES = [
  { path: "/fonts/PretendardJP-SemiBold.subset.ttf", weight: 600 },
  { path: "/fonts/PretendardJP-Black.subset.ttf", weight: 900 },
] as const;

type SatoriModule = typeof import("satori");
type SatoriFont = Parameters<SatoriModule["default"]>[1]["fonts"][number];

let runtimePromise: Promise<{ satori: SatoriModule["default"]; fonts: SatoriFont[] }> | null =
  null;

/** satori + 폰트를 처음 한 번만 받아요. 실패하면 다음 호출에서 다시 시도하도록 캐시를 비워요. */
function loadRuntime() {
  runtimePromise ??= (async () => {
    const [satoriModule, fonts] = await Promise.all([
      import("satori"),
      Promise.all(
        FONT_FILES.map(async ({ path, weight }): Promise<SatoriFont> => {
          const res = await fetch(path);
          if (!res.ok) throw new Error(`font ${path} ${res.status}`);
          return {
            name: CARD_FONT,
            data: await res.arrayBuffer(),
            weight,
            style: "normal",
          };
        }),
      ),
    ]);
    return { satori: satoriModule.default, fonts };
  })().catch((error: unknown) => {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

/** 투명한 1x1 SVG — 색 이모지 자리를 비워 두는 용도예요 (greetingCard가 이모지를 지워서 거의 쓰이지 않아요). */
const EMPTY_EMOJI = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
)}`;

/** 아바타 URL → data URI. SVG를 <img>로 보여주면 외부 리소스를 못 읽어서 이미지를 SVG 안에 넣어야 해요. 실패하면 null(자리표시자). */
const avatarCache = new Map<string, Promise<string | null>>();

export function loadAvatarDataUri(url: string | null): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  let cached = avatarCache.get(url);
  if (!cached) {
    cached = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === "string" ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })();
    avatarCache.set(url, cached);
  }
  return cached;
}

export interface GreetingSvgOptions {
  avatarSrc: string | null;
  guildName: string;
}

/** 미리보기 샘플 값 — 이전 canvas 미리보기와 같아요 ({유저이름}은 "유저", {멤버수}는 1) */
const SAMPLE = { displayName: "유저", memberCount: 1 } as const;

/** 인사 카드를 SVG 문자열로 그려요 (1200×675). */
export async function renderGreetingSvg(
  image: GreetingImage,
  options: GreetingSvgOptions,
): Promise<string> {
  const [{ satori, fonts }, avatar] = await Promise.all([
    loadRuntime(),
    loadAvatarDataUri(options.avatarSrc),
  ]);
  const node = greetingCard(image, {
    ...SAMPLE,
    guildName: options.guildName,
    avatar,
  });
  return satori(node as unknown as Parameters<typeof satori>[0], {
    width: GREETING_CARD_W,
    height: GREETING_CARD_H,
    fonts,
    // 폰트에 없는 글자(한자 등)는 600 서브셋으로 그려요 — 서버와 달리 가변 원본이 없어 빈 글리프로 남을 수 있어요.
    loadAdditionalAsset: async (code: string) =>
      code === "emoji"
        ? EMPTY_EMOJI
        : fonts.slice(0, 1).map((font) => ({ ...font, name: `${CARD_FONT}-fallback-${code}` })),
  });
}

/** `<img src>`에 쓰는 data URI */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
