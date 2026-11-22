#!/usr/bin/env node
/**
 * resources/emoji_replacement 이모지 PNG를 생성하는 재사용 가능한 스크립트.
 *
 * - 정사각 이모지: lucide-react의 SVG 노드 데이터(__iconData.node)를 SVG로 만들어 Takumi(@takumi-rs/core)로 그려요.
 *   chapter.png에서 역설계한 렌더 파라미터(ink box 정규화, accent, stroke)로 전체 시각 크기를 통일해요.
 * - 프로그레스바(pb) 셀: filled/empty 색·캡 라운드를 직접 그려요 (pb_mid_end 포함 — mid에서 끝날 때 라운드).
 *
 * 사용법:
 *   node scripts/render-emojis.mjs                               # 정사각 이모지 전부 (임시 출력)
 *   node scripts/render-emojis.mjs --mode=pb                     # 프로그레스바 셀 12종만
 *   node scripts/render-emojis.mjs --mode=all                    # 둘 다
 *   node scripts/render-emojis.mjs --out resources/emoji_replacement   # 리소스에 직접 덮어쓰기
 *   node scripts/render-emojis.mjs --only play,star | --only pb_mid_end,pb_start_half
 *   node scripts/render-emojis.mjs --ink 400 --stroke 2.6        # 파라미터 재정의
 *   node scripts/render-emojis.mjs --list | --dry-run
 *   node scripts/render-emojis.mjs --mode=all --preset=blue --out resources/emoji_replacement
 *       # 서버 테마 세트: accent를 프리셋 색으로 바꾸고 파일명에 `_<프리셋>` 접미사를 붙여요 (분홍은 접미사 없는 기존 이름).
 *       # 프리셋 색·이름의 단일 소스는 packages/utils guildSettingsContract (빌드된 dist를 읽어요).
 *
 * 파라미터 (모두 CLI로 재정의 가능): PARAMS 정의 참조 — ink/accent/stroke/pbHeight/pbWidth/pbCapRadius/pbEmptyColor.
 * 의존성: @takumi-rs/core, @takumi-rs/helpers, lucide-react (repo node_modules에서 탐색).
 * 새 이모지 추가 시: EMOJI_LUCIDE_MAP에 `이름: 'lucide-아이콘'` 한 줄. pb 셀은 kind/state 조합으로 자동 생성.
 */
import { Renderer } from "@takumi-rs/core";
import { container, image } from "@takumi-rs/helpers";
import { readdir, writeFile, mkdir, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

// node_modules 탐색 — root에 없으면 실패. lucide-react가 어디에 hoist돼든 동작.
function resolveModuleDir(name) {
  return dirname(require.resolve(name + "/package.json"));
}
const ICONS_DIR = join(
  resolveModuleDir("lucide-react"),
  "dist",
  "esm",
  "icons",
);

// ── 렌더 파라미터 (chapter.png에서 역설계: ink box 449×449, #ff85c0, round cap/join) ──
// CLI로 재정의 가능해요: 아래 PARAMS 정의를 보세요.
const SIZE = 512; // PNG 캔버스

// CLI 지원 파라미터: { key: { def, desc } } — --<key>=<값> 으로 재정의해요.
const PARAMS = {
  ink: {
    def: 390,
    desc: "정사각 이모지 목표 ink box max dim px (작을수록 이모지가 작아 보여요)",
  },
  accent: { def: "#ff85c0", desc: "accent 색상(#rrggbb)" },
  stroke: { def: 2.4, desc: "lucide 24-viewbox 기준 스트로크 두께" },
  pbHeight: { def: 143, desc: "프로그레스바 세로 두께 px" },
  pbWidth: { def: 512, desc: "프로그레스바 셀 가로 px" },
  pbCapRadius: {
    def: 0,
    desc: "라운드 엔드 캡 반경 px. 0이면 자동(pbHeight/2)",
  },
  pbPad: {
    def: 0,
    desc: "셀 캔버스 여백 px — 도형은 왼쪽에 붙고 여백은 오른쪽에만 남겨요. 0이면 셀 전체가 도형(full-bleed)",
  },
  pbEmptyColor: { def: "#fbd3e7", desc: "empty 셀 색상(#rrggbb)" },
};

function parseParams(args) {
  const read = (flag) => {
    const eq = args.find((a) => a.startsWith(flag + "="));
    if (eq) return eq.slice(flag.length + 1);
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const out = {};
  for (const [k, { def }] of Object.entries(PARAMS)) {
    const v = read("--" + k);
    if (v === undefined) {
      out[k] = def;
      continue;
    }
    if (typeof def === "number") {
      if (!/^\d+$/.test(v))
        throw new Error(`--${k} 은 양의 정수(px)여야 해요: "${v}"`);
      out[k] = +v;
    } else if (String(def).startsWith("#")) {
      if (!/^#[0-9a-fA-F]{6}$/.test(v))
        throw new Error(`--${k} 은 #rrggbb여야 해요: "${v}"`);
      out[k] = v.toLowerCase();
    } else out[k] = v;
  }
  return out;
}

const FILLED = new Set(["play", "pause"]); // 면이 주인 아이콘만 fill(나머지는 stroke)

// 이모지 이름 → lucide 아이콘(kebab-case). 새 이모지 추가 시 여기 한 줄만.
const EMOJI_LUCIDE_MAP = {
  arrow_back: "skip-back",
  arrow_forward: "skip-forward",
  arrow_up: "arrow-up",
  arrow_down: "arrow-down",
  artist: "disc-3",
  artist_l: "disc-3",
  cd: "disc",
  headphone: "headphones",
  music_note: "music",
  music_notes: "music-2",
  play: "play",
  pause: "pause",
  stop: "square",
  repeat: "repeat",
  repeat_one: "repeat-1",
  repeat_off: "repeat-off",
  shuffle: "shuffle",
  volume_up: "volume-2",
  volume_down: "volume-1",
  volume_muted: "volume-x",
  radio_wave: "radio",
  mic: "mic",
  spectrum: "audio-lines",
  chapter: "clapperboard",
  chapter_l: "clapperboard",
  film: "film",
  video: "video",
  camera: "camera",
  star: "star",
  sparkle: "sparkles",
  success: "circle-check",
  error: "circle-x",
  warning: "triangle-alert",
  info: "info",
  bulb: "lightbulb",
  heart: "heart",
  broken_heart: "heart-crack",
  fire: "flame",
  boom: "sparkles",
  crown: "crown",
  gem: "gem",
  coin: "coins",
  money: "banknote",
  party: "party-popper",
  cake: "cake",
  smile: "smile",
  mask: "drama",
  robot: "bot",
  user: "user",
  people: "users",
  cat: "cat",
  wave: "hand",
  fist: "hand-fist",
  fist_bump: "hand-fist",
  sleep: "bed",
  trophy: "trophy",
  calendar: "calendar",
  clock: "clock",
  hourglass: "hourglass",
  sun: "sun",
  moon: "moon",
  cloudy: "cloud",
  rain: "cloud-rain",
  sun_cloud: "cloud-sun",
  windy: "wind",
  drop: "droplet",
  thermo: "thermometer",
  trash: "trash-2",
  folder: "folder",
  clipboard: "clipboard",
  scroll: "scroll-text",
  key: "key",
  link: "link",
  lock: "lock",
  shield: "shield",
  eye: "eye",
  tools: "wrench",
  scissors: "scissors",
  palette: "palette",
  radio: "radio",
  gamepad: "gamepad-2",
  dice: "dices",
  crystal_ball: "eye",
  clover: "clover",
  sprout: "sprout",
  bell: "bell",
  megaphone: "megaphone",
  speech: "message-circle",
  inbox_tray: "inbox",
  plus: "plus",
  pin: "pin",
  globe: "globe",
  mag: "search",
  frame: "frame",
  box: "box",
  id: "badge",
  end_flag: "flag-triangle-right",
  chart: "bar-chart-3",
  flash: "zap",
  house: "house",
  disk: "hard-drive",
  bag: "shopping-bag",
};

// lucide 아이콘 파일에서 SVG 노드 데이터를 읽어와요. 별칭(다른 파일 re-export)이면 재귀 해석.
async function loadIconNodes(icon, depth = 0) {
  if (depth > 5) throw new Error(`alias depth exceeded for ${icon}`);
  const mod = await import(join(ICONS_DIR, icon + ".mjs"));
  const data = mod.__iconData || mod.default?.__iconData;
  if (data && data.node) return data.node;
  const src = await readFile(join(ICONS_DIR, icon + ".mjs"), "utf-8");
  const alias = src.match(/from '\.\/([a-z0-9-]+)\.mjs'/);
  if (alias) return loadIconNodes(alias[1], depth + 1);
  throw new Error(`no node data for ${icon}`);
}

// lucide SVG 노드를 SVG 요소 문자열로 바꿔요. lucide가 쓰는 7종 태그(path/circle/rect/line/ellipse/polyline/polygon)를 지원해요.
// 알 수 없는 태그는 건너뛰고 { skipped }를 돌려줘요. 속성은 SVG 그대로 넘기므로 fill-rule(evenodd 등)도 유지돼요.
const SVG_TAGS = new Set(["path", "circle", "rect", "line", "ellipse", "polyline", "polygon"]);
function nodeToSvg(tag, attrs) {
  if (!SVG_TAGS.has(tag)) return { skipped: tag };
  const attrText = Object.entries(attrs)
    .filter(([k]) => k !== "key")
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
  return { svg: `<${tag} ${attrText}/>` };
}

// 이모지 이름으로 lucide 아이콘을 찾아요. `<이름>_l`(가로 좌측 정렬 변형)은 원본 `<이름>` 매핑도 함께 봐요.
function resolveLucideIcon(name) {
  return (
    EMOJI_LUCIDE_MAP[name] ??
    (name.endsWith("_l") ? EMOJI_LUCIDE_MAP[name.slice(0, -2)] : undefined)
  );
}

// Takumi 렌더러 하나를 재사용해요 (폰트가 필요 없는 도형·SVG만 그려요).
const renderer = new Renderer();

const svgDataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// 24×24 viewBox 기준 lucide 아이콘 SVG — filled면 면만, 아니면 스트로크만 그려요.
function iconSvg(shapes, filled, params, px) {
  const paint = filled
    ? `fill="${params.accent}" stroke="none"`
    : `fill="none" stroke="${params.accent}" stroke-width="${params.stroke}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${px}" height="${px}" ${paint}>${shapes.join("")}</svg>`;
}

// SVG 노드를 그리고, ink box를 params.ink에 맞춰 SIZE 캔버스에 배치한 PNG를 반환해요.
// 먼저 1024px로 그려 ink(알파 > 16) 범위를 재고, 같은 벡터를 ink 비율로 다시 그려 선명하게 배치해요.
// anchorLeft=true(`_l` 접미사)면 가로는 왼쪽 정렬(ink 좌측 = 캔버스 좌측, padLeft=0), 세로는 가운데 정렬.
async function renderIconPng(nodes, filled, params, anchorLeft = false) {
  const T = 1024; // ink 측정용 임시 캔버스
  const shapes = [];
  let skipped = null;
  for (const [tag, attrs] of nodes) {
    const r = nodeToSvg(tag, attrs);
    if (r.skipped) skipped = (skipped || []).concat(r.skipped);
    else shapes.push(r.svg);
  }
  const probe = Buffer.from(
    await renderer.render(image({ src: svgDataUri(iconSvg(shapes, filled, params, T)), style: { width: T, height: T } }), {
      width: T,
      height: T,
      format: "raw",
    }),
  );
  let minX = T,
    maxX = 0,
    minY = T,
    maxY = 0;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++)
      if (probe[(y * T + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX <= minX) return { png: null, skipped, empty: true }; // 빈 아이콘
  const iw = maxX - minX + 1,
    ih = maxY - minY + 1;
  const s = params.ink / Math.max(iw, ih);
  const dw = iw * s,
    dh = ih * s;
  const destX = anchorLeft ? 0 : (SIZE - dw) / 2;
  const destY = (SIZE - dh) / 2;
  const full = Math.round(T * s); // 1024 캔버스를 s배 한 크기 — ink 좌상단이 dest에 오도록 평행이동해요
  const node = container({
    style: { width: SIZE, height: SIZE, position: "relative" },
    children: [
      image({
        src: svgDataUri(iconSvg(shapes, filled, params, full)),
        style: { position: "absolute", left: destX - minX * s, top: destY - minY * s, width: full, height: full },
      }),
    ],
  });
  const png = Buffer.from(await renderer.render(node, { width: SIZE, height: SIZE, format: "png" }));
  return { png, skipped, empty: false };
}

/*
 * 프로그레스바 셀 생성. 기존 pb_*.png(512×110 full-bleed, 시작/끝 캡 라운드, filled #ff85c0, empty #fbd3e7)를 재현해요.
 * pb_mid_end: 진행바의 마지막 채워진 세그먼트가 mid일 때 — accent 끝을 오른쪽으로 둥글게 처리해 자연스러운 종단을 만들어요.
 *   mid_end_filled=오른쪽 둥근 채움, mid_end_half=왼쪽 절반 채움(끝 둥글게), mid_end_empty=빈 mid(사각).
 * end 셀은 오른쪽 라우드, start 셀은 왼쪽 라우드, mid는 사각이에요.
 * 셀 도형은 왼쪽에 붙이고 여백은 오른쪽에만 남겨 셀들이 왼쪽 기준으로 이어져요.
 * kind: 'start' | 'mid' | 'end' | 'mid_end', state: 'filled' | 'half' | 'empty'
 */
async function renderProgressBarCell(kind, state, params) {
  const W = params.pbWidth;
  const H = params.pbHeight;
  // 기존 110px pb 캡 라우드 비율(≈48/110) 유지. pbCapRadius=0이면 자동.
  const r =
    params.pbCapRadius > 0 ? params.pbCapRadius : Math.round(H * 0.43636);
  const leftCap = kind === "start"; // start만 왼쪽 라우드
  const rightCap = kind === "end" || kind === "mid_end"; // end·mid_end는 오른쪽 라우드

  // 셀 여백 — 도형은 왼쪽에 붙이고 여백은 오른쪽에만 남겨 셀들이 왼쪽 기준으로 이어져요.
  // 기본 pbPad=0이면 전 셀이 full-bleed라 바 좌우에 빈 공간이 없어요.
  const innerW = W - Math.max(0, params.pbPad);

  // 한쪽 모서리만(또는 양쪽) 라운드된 사각형 — 왼쪽=왼쪽 두 모서리, 오른쪽=오른쪽 두 모서리.
  const box = (left, width, color, roundLeft, roundRight) => {
    const rr = Math.min(r, H / 2, width / 2);
    return container({
      style: {
        position: "absolute",
        left,
        top: 0,
        width,
        height: H,
        backgroundColor: color,
        borderTopLeftRadius: roundLeft ? rr : 0,
        borderBottomLeftRadius: roundLeft ? rr : 0,
        borderTopRightRadius: roundRight ? rr : 0,
        borderBottomRightRadius: roundRight ? rr : 0,
      },
    });
  };

  // 1) 빈 배경: start는 왼쪽, end는 오른쪽만 둥글게 — mid·mid_end는 사각 그대로예요.
  const layers = [box(0, innerW, params.pbEmptyColor, leftCap, kind === "end")];
  // 2) 채워진(accent) 면: filled는 전체 폭, half는 절반(오른쪽 끝은 항상 둥글게)을 배경 위에 덮어요.
  if (state === "filled") layers.push(box(0, innerW, params.accent, leftCap, rightCap));
  else if (state === "half") layers.push(box(0, Math.round(innerW / 2), params.accent, leftCap, true));

  const node = container({ style: { width: W, height: H, position: "relative" }, children: layers });
  return Buffer.from(await renderer.render(node, { width: W, height: H, format: "png" }));
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const eq = args.find((a) => a.startsWith(flag + "="));
    if (eq) return eq.slice(flag.length + 1);
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const params = parseParams(args);
  // 서버 테마 세트 — accent와 파일명 접미사를 계약에서 가져와요 (분홍은 접미사 없음).
  const { THEME_PRESET_HEX, THEME_PRESET_DEFAULT, THEME_PRESETS } = await import(
    pathToFileURL(join(REPO_ROOT, "packages", "utils", "dist", "guildSettingsContract.js")).href
  );
  const presetArg = getArg("--preset");
  let suffix = "";
  if (presetArg) {
    if (!THEME_PRESET_HEX[presetArg])
      throw new Error(`알 수 없는 프리셋: ${presetArg} (${THEME_PRESETS.join(", ")})`);
    params.accent = THEME_PRESET_HEX[presetArg];
    // 진행바 빈 트랙도 프리셋 색을 따라가요 — 기본 분홍(#ff85c0 → #fbd3e7)과 같은 비율(흰색에 accent 37%)로 섞어요.
    if (!args.some((a) => a.startsWith("--pbEmptyColor"))) {
      const ch = (i) => parseInt(params.accent.slice(1 + i * 2, 3 + i * 2), 16);
      const mix = (c) => Math.round(255 - (255 - c) * 0.37).toString(16).padStart(2, "0");
      params.pbEmptyColor = `#${mix(ch(0))}${mix(ch(1))}${mix(ch(2))}`;
    }
    if (presetArg !== THEME_PRESET_DEFAULT) suffix = `_${presetArg}`;
  }
  const themeSuffixes = THEME_PRESETS.filter((p) => p !== THEME_PRESET_DEFAULT).map((p) => `_${p}`);
  const srcDir = join(REPO_ROOT, "resources", "emoji_replacement");
  const outDir = resolve(
    REPO_ROOT,
    getArg("--out") || join("/tmp", "emoji_regen"),
  );
  const mode = getArg("--mode") || "icons"; // icons | pb | all
  const only = getArg("--only")
    ?.split(",")
    .map((s) => s.trim());
  const dryRun = args.includes("--dry-run");

  // ── 진행바(pb) 모드 ──────────────────────────────────────────────────────────
  if (mode === "pb" || mode === "all") {
    // kind×state 12종: pb_<start|mid|end|mid_end>_<filled|half|empty>
    const kinds = ["start", "mid", "end", "mid_end"];
    const states = ["filled", "half", "empty"];
    let cells = [];
    for (const k of kinds) for (const s of states) cells.push([k, s]);
    if (only) cells = cells.filter(([k, s]) => only.includes(`pb_${k}_${s}`));
    if (dryRun) {
      console.log(`[pb] 대상 ${cells.length}종 → ${outDir}`);
      console.log(cells.map(([k, s]) => `pb_${k}_${s}`).join(", "));
    } else {
      await mkdir(outDir, { recursive: true });
      let cnt = 0;
      for (const [k, s] of cells) {
        await writeFile(
          join(outDir, `pb_${k}_${s}${suffix}.png`),
          await renderProgressBarCell(k, s, params),
        );
        cnt++;
      }
      console.log(
        `[pb] 완료: ${cnt}종 (두께 ${params.pbHeight}px, 캡 ${params.pbCapRadius || Math.round(params.pbHeight * 0.43636)}px) → ${outDir}`,
      );
    }
    if (mode === "pb") return;
  }

  // ── 정사각 이모지(lucide) 모드 ──────────────────────────────────────────────
  // 정사각 이름 = 리소스 폴더의 pb_ 아닌 png 파일명 ∩ 매핑 테이블 키 (+ --only로 지정한 유효 이름)
  const pngNames = (await readdir(srcDir))
    .filter((f) => f.endsWith(".png") && !f.startsWith("pb_"))
    .map((f) => f.replace(".png", ""))
    // 이미 생성된 테마 세트(`name_blue`)는 원본 이름 목록에서 빼요.
    .filter((n) => !themeSuffixes.some((sfx) => n.endsWith(sfx)));
  const candidateNames = only
    ? Array.from(new Set([...pngNames, ...only]))
    : pngNames;
  let names = candidateNames.filter((n) => resolveLucideIcon(n));
  const unmapped = pngNames.filter((n) => !resolveLucideIcon(n));
  if (unmapped.length)
    console.warn(
      `경고: 매핑 없는 이름 ${unmapped.length}개 건너뜀 — ${unmapped.join(", ")}`,
    );
  if (only) names = names.filter((n) => only.includes(n));

  if (args.includes("--list")) {
    console.log(names.sort().join("\n"));
    return;
  }
  if (dryRun) {
    console.log(
      `[icons] 대상 ${names.length}종 (ink ${params.ink}px, accent ${params.accent}) → ${outDir}`,
    );
    console.log(names.sort().join(", "));
    return;
  }

  await mkdir(outDir, { recursive: true });
  let ok = 0,
    filled = 0,
    fail = 0;
  for (const name of names) {
    const iconName = resolveLucideIcon(name);
    const baseName = name.endsWith("_l") ? name.slice(0, -2) : name;
    try {
      const isFilled = FILLED.has(name) || FILLED.has(baseName);
      if (isFilled) filled++;
      const nodes = await loadIconNodes(iconName);
      const { png, skipped, empty } = await renderIconPng(
        nodes,
        isFilled,
        params,
        name.endsWith("_l"),
      );
      if (empty)
        throw new Error(`빈 아이콘(ink 없음) — 미지원 태그만 있거나 노드 없음`);
      await writeFile(join(outDir, name + suffix + ".png"), png);
      if (skipped?.length)
        console.warn(`경고 ${name}: 미지원 태그 ${skipped.join(",")} 건너뜀`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${name}(${iconName}): ${e.message}`);
      fail++;
    }
  }
  console.log(
    `[icons] 완료: ${ok} 렌더링 (${filled} fill, ${ok - filled} stroke), 실패 ${fail} → ${outDir}`,
  );
}

await main();
