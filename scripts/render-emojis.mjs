#!/usr/bin/env node
/**
 * resources/emoji_replacement 정사각 이모지를 lucide 아이콘에서 재렌더링하는 재사용 가능한 스크립트.
 *
 * - lucide-react의 SVG 노드 데이터(__iconData.node)를 skia-canvas로 그려 PNG로 뽑아요.
 * - chapter.png에서 역설계한 렌더 파라미터(ink box 정규화, accent, stroke)를 그대로 적용해
 *   앱 이모지 전체의 시각 크기를 통일해요.
 * - pb_*(progress bar 9종)는 제외하고 나머지 정사각 이모지를 처리해요.
 *
 * 사용법:
 *   node scripts/render-emojis.mjs                       # 94종 정사각 전부 렌더링(임시 출력)
 *   node scripts/render-emojis.mjs --out resources/emoji_replacement   # PNG를 리소스 폴더에 직접 덮어쓰기
 *   node scripts/render-emojis.mjs --only play,pause,star # 일부만
 *   node scripts/render-emojis.mjs --list                 # 매핑된 이름 목록만 출력
 *   node scripts/render-emojis.mjs --dry-run              # 매핑/경로 검증만(렌더링 없음)
 *
 * 의존성: skia-canvas, lucide-react (모두 repo node_modules에서 탐색 — 임포트 불필요).
 * 새 이모지 추가 시: EMOJI_LUCIDE_MAP에 `이름: 'lucide-아이콘'` 한 줄만 넣으면 재렌더링에 자동 포함돼요.
 */
import { Canvas, Path2D } from "skia-canvas";
import { readdir, writeFile, mkdir, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

// node_modules 탐색 — root에 없으면 실패. lucide-react/skia-canvas가 어디에 hoist돼든 동작.
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
const SIZE = 512; // PNG 캔버스
const ACCENT = "#ff85c0"; // 앱 이모지 accent 색
const INK = 449; // 목표 ink box max dim (chapter와 동일)
const STROKE = 2.4; // lucide 24-viewbox 기준 스트로크 두께
const FILLED = new Set(["play", "pause"]); // 면이 주인 아이콘만 fill(나머지는 stroke)

// 이모지 이름 → lucide 아이콘(kebab-case). 새 이모지 추가 시 여기 한 줄만.
const EMOJI_LUCIDE_MAP = {
  arrow_back: "skip-back",
  arrow_forward: "skip-forward",
  arrow_up: "arrow-up",
  arrow_down: "arrow-down",
  artist: "disc-3",
  cd: "disc",
  headphone: "headphones",
  music_note: "music",
  music_notes: "music-2",
  play: "play",
  pause: "pause",
  stop: "square",
  repeat: "repeat",
  repeat_one: "repeat-1",
  repeat_off: "repeat",
  shuffle: "shuffle",
  volume_up: "volume-2",
  volume_down: "volume-1",
  volume_muted: "volume-x",
  radio_wave: "radio",
  mic: "mic",
  spectrum: "audio-lines",
  chapter: "clapperboard",
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
  magnet: "magnet",
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

// SVG 노드(path/rect/circle)를 스트로크 또는 fill로 그리고, ink box를 INK에 맞춰 중앙 배치한 캔버스를 반환해요.
function renderIconCanvas(nodes, filled) {
  const T = 1024; // ink 측정용 임시 캔버스
  const tc = new Canvas(T, T);
  const ctx = tc.getContext("2d");
  ctx.strokeStyle = ACCENT;
  ctx.fillStyle = ACCENT;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.translate(T / 2 - 12 * (T / 24), T / 2 - 12 * (T / 24));
  ctx.scale(T / 24, T / 24);
  const paint = (p) =>
    filled ? ctx.fill(p) : ((ctx.lineWidth = STROKE), ctx.stroke(p));
  for (const [tag, attrs] of nodes) {
    let p;
    if (tag === "path" && attrs.d) {
      p = new Path2D(attrs.d);
    } else if (tag === "rect") {
      p = new Path2D();
      const r = +attrs.rx || 0;
      if (p.roundRect)
        p.roundRect(
          +attrs.x || 0,
          +attrs.y || 0,
          +attrs.width,
          +attrs.height,
          r,
        );
      else p.rect(+attrs.x || 0, +attrs.y || 0, +attrs.width, +attrs.height);
    } else if (tag === "circle") {
      p = new Path2D();
      const cx = +attrs.cx || 0,
        cy = +attrs.cy || 0,
        r = +attrs.r;
      p.moveTo(cx + r, cy);
      p.arc(cx, cy, r, 0, Math.PI * 2);
    }
    if (p) paint(p);
  }
  // ink box 측정
  const d = ctx.getImageData(0, 0, T, T).data;
  let minX = T,
    maxX = 0,
    minY = T,
    maxY = 0;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++)
      if (d[(y * T + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX <= minX) return new Canvas(SIZE, SIZE); // 빈 아이콘
  // ink box max dim을 INK로 스케일해 SIZE 캔버스 중앙 배치
  const iw = maxX - minX + 1,
    ih = maxY - minY + 1;
  const s = INK / Math.max(iw, ih);
  const out = new Canvas(SIZE, SIZE);
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  const dw = iw * s,
    dh = ih * s;
  octx.drawImage(
    tc,
    minX,
    minY,
    iw,
    ih,
    (SIZE - dw) / 2,
    (SIZE - dh) / 2,
    dw,
    dh,
  );
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const srcDir = join(REPO_ROOT, "resources", "emoji_replacement");
  const outDir = resolve(
    REPO_ROOT,
    getArg("--out") || join("/tmp", "emoji_regen"),
  );
  const only = getArg("--only")
    ?.split(",")
    .map((s) => s.trim());
  const dryRun = args.includes("--dry-run");

  // 정사각 이름 = 리소스 폴더의 pb_ 아닌 png 파일명 ∩ 매핑 테이블 키
  const pngNames = (await readdir(srcDir))
    .filter((f) => f.endsWith(".png") && !f.startsWith("pb_"))
    .map((f) => f.replace(".png", ""));
  let names = pngNames.filter((n) => EMOJI_LUCIDE_MAP[n]);
  const unmapped = pngNames.filter((n) => !EMOJI_LUCIDE_MAP[n]);
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
    console.log(`렌더링 대상 ${names.length}종 (dry-run) → ${outDir}`);
    console.log(names.sort().join(", "));
    return;
  }

  await mkdir(outDir, { recursive: true });
  let ok = 0,
    filled = 0,
    fail = 0;
  for (const name of names) {
    try {
      const isFilled = FILLED.has(name);
      if (isFilled) filled++;
      const nodes = await loadIconNodes(EMOJI_LUCIDE_MAP[name]);
      await writeFile(
        join(outDir, name + ".png"),
        await renderIconCanvas(nodes, isFilled).toBuffer("png"),
      );
      ok++;
    } catch (e) {
      console.error(`FAIL ${name}(${EMOJI_LUCIDE_MAP[name]}): ${e.message}`);
      fail++;
    }
  }
  console.log(
    `완료: ${ok} 렌더링 (${filled} fill, ${ok - filled} stroke), 실패 ${fail} → ${outDir}`,
  );
}

await main();
