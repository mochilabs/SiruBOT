import { CARD_FONT, greetingAnimationCss, greetingCard } from "@sirubot/cards";
import {
  GREETING_CARD_H,
  GREETING_CARD_W,
  type GreetingImage,
} from "@sirubot/utils/memberGreeting";

/**
 * 인사 카드 브라우저 미리보기 — data-api가 Discord로 보내는 PNG와 같은 `greetingCard` 노드를 `@takumi-rs/wasm`으로 그려요.
 * WASM 바이너리와 폰트(한글 서브셋 600·900 + TwemojiMozilla)는 처음 미리보기를 열 때 한 번만 받아요.
 */

/** 기본으로 받는 폰트 — 굵기 400·700은 텍스트 레이어가 쓸 때만 따로 받아요 (각 약 2.6MB) */
const FONT_FILES = [
  { path: "/fonts/PretendardJP-SemiBold.subset.ttf", name: CARD_FONT, weight: 600 },
  { path: "/fonts/PretendardJP-Black.subset.ttf", name: CARD_FONT, weight: 900 },
  { path: "/fonts/TwemojiMozilla.ttf", name: "Twemoji", generic: "emoji" as const },
] as const;

const EXTRA_WEIGHT_FILES = {
  400: "/fonts/PretendardJP-Regular.subset.ttf",
  700: "/fonts/PretendardJP-Bold.subset.ttf",
} as const;

type TakumiRenderer = import("@takumi-rs/wasm").Renderer;
type FromJsxFn = typeof import("@takumi-rs/helpers/jsx").fromJsx;

let runtimePromise: Promise<{ renderer: TakumiRenderer; fromJsx: FromJsxFn }> | null = null;
/** 이미 등록했거나 받는 중인 추가 굵기 */
const extraWeights = new Map<number, Promise<void>>();

/** 이미지의 텍스트 레이어가 400/700을 쓰면 해당 정적 폰트를 한 번만 받아 등록해요 (서버는 가변 폰트라 모든 굵기를 그려요) */
export function ensureTextWeights(image: GreetingImage, renderer: TakumiRenderer): Promise<unknown> {
  const needed = new Set<400 | 700>();
  for (const layer of image.layers) {
    if (layer.type === "text" && (layer.weight === 400 || layer.weight === 700)) needed.add(layer.weight);
  }
  return Promise.all(
    [...needed].map((weight) => {
      let pending = extraWeights.get(weight);
      if (!pending) {
        pending = (async () => {
          const res = await fetch(EXTRA_WEIGHT_FILES[weight]);
          if (!res.ok) throw new Error(`font ${EXTRA_WEIGHT_FILES[weight]} ${res.status}`);
          await renderer.registerFont({ name: CARD_FONT, data: await res.arrayBuffer(), weight });
        })().catch((error: unknown) => {
          extraWeights.delete(weight);
          throw error;
        });
        extraWeights.set(weight, pending);
      }
      return pending;
    }),
  );
}

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
  /** 애니메이션 타임라인 시각(ms) — 그 시점의 정지 프레임을 그려요. 움직임이 없는 카드에는 영향이 없어요 */
  timeMs?: number;
  /** 출력 배율(0~1, 기본 1) — 재생 중에는 0.5로 줄여서 프레임당 렌더 시간을 거의 반으로 줄여요 */
  scale?: number;
}

/** 미리보기 샘플 값 ({유저이름}은 "유저", {멤버수}는 1) */
const SAMPLE = { displayName: "유저", memberCount: 1 } as const;

/** 인사 카드를 PNG data URL로 그려요 (1200×675). 움직임이 있으면 `timeMs` 시점의 프레임이에요. */
export async function renderGreetingPreviewUrl(
  image: GreetingImage,
  options: GreetingSvgOptions,
): Promise<string> {
  const [{ renderer, fromJsx }, avatar] = await Promise.all([
    loadRuntime(),
    loadAvatarDataUri(options.avatarSrc),
  ]);
  await ensureTextWeights(image, renderer);
  const element = greetingCard(image, {
    ...SAMPLE,
    guildName: options.guildName,
    avatar,
  });
  const scale = options.scale && options.scale < 1 ? options.scale : 1;
  const width = Math.round(GREETING_CARD_W * scale);
  const height = Math.round(GREETING_CARD_H * scale);
  // 배율이 1보다 작으면 서버(renderCardPng)와 같은 방식으로 감싸서 줄여 그려요
  const tree =
    scale === 1
      ? element
      : {
          type: "div",
          props: {
            style: { display: "flex", width, height, overflow: "hidden" },
            children: {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  width: GREETING_CARD_W,
                  height: GREETING_CARD_H,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                },
                children: element,
              },
            },
          },
        };
  const { node } = await fromJsx(tree as unknown as Parameters<typeof fromJsx>[0]);
  return renderer.renderAsDataUrl(node, {
    width,
    height,
    format: "png",
    // 움직임 키프레임은 서버와 같은 함수(@sirubot/cards)로 만들어서 미리보기가 WebP와 같은 모양이에요
    css: [greetingAnimationCss(image)],
    timeMs: options.timeMs ?? 0,
  });
}
