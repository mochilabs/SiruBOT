import { CARD_FONT, greetingAnimationCss, greetingCard } from "@sirubot/cards";
import {
  GREETING_CARD_H,
  GREETING_CARD_W,
  type GreetingImage,
} from "@sirubot/utils/memberGreeting";

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
const extraWeights = new Map<number, Promise<void>>();

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
  timeMs?: number;
  scale?: number;
}

const SAMPLE = { displayName: "유저", memberCount: 1 } as const;

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
    css: [greetingAnimationCss(image)],
    timeMs: options.timeMs ?? 0,
  });
}
