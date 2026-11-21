import { CARD_FONT, greetingCard } from "@sirubot/cards";
import {
  GREETING_CARD_H,
  GREETING_CARD_W,
  type GreetingImage,
} from "@sirubot/utils/memberGreeting";

/**
 * 인사 카드 브라우저 미리보기 — data-api가 Discord로 보내는 PNG와 같은 `greetingCard` 노드를 `@takumi-rs/wasm`으로 그려요.
 * WASM 바이너리와 폰트(한글 서브셋 600·900 + TwemojiMozilla)는 처음 미리보기를 열 때 한 번만 받아요.
 */

const FONT_FILES = [
  { path: "/fonts/PretendardJP-SemiBold.subset.ttf", name: CARD_FONT, weight: 600 },
  { path: "/fonts/PretendardJP-Black.subset.ttf", name: CARD_FONT, weight: 900 },
  { path: "/fonts/TwemojiMozilla.ttf", name: "Twemoji", generic: "emoji" as const },
] as const;

type TakumiRenderer = import("@takumi-rs/wasm").Renderer;
type FromJsxFn = typeof import("@takumi-rs/helpers/jsx").fromJsx;

let runtimePromise: Promise<{ renderer: TakumiRenderer; fromJsx: FromJsxFn }> | null = null;

/** Takumi WASM + 폰트를 처음 한 번만 초기화해요. 실패하면 다음 호출에서 다시 시도하도록 캐시를 비워요. */
function loadRuntime() {
  runtimePromise ??= (async () => {
    const [{ init, Renderer }, wasmUrl, { fromJsx }, fontBuffers] = await Promise.all([
      import("@takumi-rs/wasm"),
      import("@takumi-rs/wasm/wasm-url").then((m) => m.default),
      import("@takumi-rs/helpers/jsx"),
      Promise.all(
        FONT_FILES.map(async (entry) => {
          const res = await fetch(entry.path);
          if (!res.ok) throw new Error(`font ${entry.path} ${res.status}`);
          return { entry, data: await res.arrayBuffer() };
        }),
      ),
    ]);
    await init({ module_or_path: wasmUrl });
    const renderer = new Renderer();
    for (const { entry, data } of fontBuffers) {
      await renderer.registerFont(
        "generic" in entry
          ? { name: entry.name, data, generic: entry.generic }
          : { name: entry.name, data, weight: entry.weight },
      );
    }
    return { renderer, fromJsx };
  })().catch((error: unknown) => {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

/** 아바타 URL → data URI. 실패하면 null(자리표시자). */
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

/** 미리보기 샘플 값 ({유저이름}은 "유저", {멤버수}는 1) */
const SAMPLE = { displayName: "유저", memberCount: 1 } as const;

/** 인사 카드를 PNG data URL로 그려요 (1200×675). */
export async function renderGreetingPreviewUrl(
  image: GreetingImage,
  options: GreetingSvgOptions,
): Promise<string> {
  const [{ renderer, fromJsx }, avatar] = await Promise.all([
    loadRuntime(),
    loadAvatarDataUri(options.avatarSrc),
  ]);
  const element = greetingCard(image, {
    ...SAMPLE,
    guildName: options.guildName,
    avatar,
  });
  const { node } = await fromJsx(element as unknown as Parameters<typeof fromJsx>[0]);
  return renderer.renderAsDataUrl(node, {
    width: GREETING_CARD_W,
    height: GREETING_CARD_H,
    format: "png",
  });
}
