#!/usr/bin/env node
/**
 * resources/emoji_replacement 이모지 PNG를 생성하는 재사용 가능한 스크립트.
 *
 * - 정사각 이모지: lucide-react의 SVG 노드 데이터(__iconData.node)를 skia-canvas로 그려요.
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
 *
 * 파라미터 (모두 CLI로 재정의 가능): PARAMS 정의 참조 — ink/accent/stroke/pbHeight/pbWidth/pbCapRadius/pbEmptyColor.
 * 의존성: skia-canvas, lucide-react (repo node_modules에서 탐색).
 * 새 이모지 추가 시: EMOJI_LUCIDE_MAP에 `이름: 'lucide-아이콘'` 한 줄. pb 셀은 kind/state 조합으로 자동 생성.
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

<<<<<<< HEAD
// SVG 노드(path/rect/circle)를 스트로크 또는 fill로 그리고, ink box를 INK에 맞춰 중앙 배치한 캔버스를 반환해요.
function renderIconCanvas(nodes, filled) {
=======
// lucide SVG 노드를 Path2D로 변환해요. lucide가 쓰는 7종 태그(path/circle/rect/line/ellipse/polyline/polygon) 전부를 지원해요.
// frame처럼 line만 쓰는 아이콘도 빠짐없이 그려져요. 알 수 없는 태그는 건너뛰고 경고를 돌려줘요.
// 반환: { path, fillRule } — fillRule은 path 태그의 fill-rule 속성(evenodd 등)을 반영해요.
function nodeToPath(tag, attrs) {
  const p = new Path2D();
  const n = (v, d = 0) => (v === undefined || v === null || v === "" ? d : +v);
  switch (tag) {
    case "path":
      if (!attrs.d) return null;
      return {
        path: new Path2D(attrs.d),
        fillRule: attrs["fill-rule"] === "evenodd" ? "evenodd" : "nonzero",
      };
    case "rect": {
      const x = n(attrs.x),
        y = n(attrs.y),
        w = n(attrs.width),
        h = n(attrs.height);
      const r = n(attrs.rx, n(attrs.ry));
      if (r > 0 && p.roundRect) p.roundRect(x, y, w, h, r);
      else p.rect(x, y, w, h);
      return { path: p, fillRule: "nonzero" };
    }
    case "circle": {
      const cx = n(attrs.cx),
        cy = n(attrs.cy),
        r = n(attrs.r);
      p.moveTo(cx + r, cy);
      p.arc(cx, cy, r, 0, Math.PI * 2);
      return { path: p, fillRule: "nonzero" };
    }
    case "ellipse": {
      const cx = n(attrs.cx),
        cy = n(attrs.cy),
        rx = n(attrs.rx),
        ry = n(attrs.ry ?? attrs.rx);
      p.moveTo(cx + rx, cy);
      p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      return { path: p, fillRule: "nonzero" };
    }
    case "line": {
      p.moveTo(n(attrs.x1), n(attrs.y1));
      p.lineTo(n(attrs.x2), n(attrs.y2));
      return { path: p, fillRule: "nonzero" };
    }
    case "polyline":
    case "polygon": {
      // points="x,y x,y ..." 또는 "x y x y" — 콤마/공백 구분 모두 처리
      const nums = String(attrs.points ?? "")
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (nums.length < 2) return null;
      p.moveTo(nums[0], nums[1] ?? 0);
      for (let i = 2; i + 1 < nums.length; i += 2)
        p.lineTo(nums[i], nums[i + 1]);
      if (tag === "polygon") p.closePath();
      return { path: p, fillRule: "nonzero" };
    }
    default:
      return { skipped: tag };
  }
}

// SVG 노드를 스트로크 또는 fill로 그리고, ink box를 params.ink에 맞춰 중앙 배치한 캔버스를 반환해요.
function renderIconCanvas(nodes, filled, params) {
>>>>>>> b7b9c625 (feat(emojis): 이모지·진행바 리디자인 — 크기 조정, pb_mid_end 라운드, 색상 통일)
  const T = 1024; // ink 측정용 임시 캔버스
  const tc = new Canvas(T, T);
  const ctx = tc.getContext("2d");
  ctx.strokeStyle = params.accent;
  ctx.fillStyle = params.accent;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.translate(T / 2 - 12 * (T / 24), T / 2 - 12 * (T / 24));
  ctx.scale(T / 24, T / 24);
<<<<<<< HEAD
  const paint = (p) =>
    filled ? ctx.fill(p) : ((ctx.lineWidth = STROKE), ctx.stroke(p));
=======
  ctx.lineWidth = params.stroke;
  let skipped = null;
>>>>>>> b7b9c625 (feat(emojis): 이모지·진행바 리디자인 — 크기 조정, pb_mid_end 라운드, 색상 통일)
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
<<<<<<< HEAD
  if (maxX <= minX) return new Canvas(SIZE, SIZE); // 빈 아이콘
  // ink box max dim을 INK로 스케일해 SIZE 캔버스 중앙 배치
=======
  if (maxX <= minX)
    return { canvas: new Canvas(SIZE, SIZE), skipped, empty: true }; // 빈 아이콘
  // ink box max dim을 params.ink로 스케일해 SIZE 캔버스 중앙 배치
>>>>>>> b7b9c625 (feat(emojis): 이모지·진행바 리디자인 — 크기 조정, pb_mid_end 라운드, 색상 통일)
  const iw = maxX - minX + 1,
    ih = maxY - minY + 1;
  const s = params.ink / Math.max(iw, ih);
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

/*
 * 프로그레스바 셀 생성. 기존 pb_*.png(512×110 full-bleed, 시작/끝 캡 라운드, filled #ff85c0, empty #fbd3e7)를 재현해요.
 * pb_mid_end: 진행바의 마지막 채워진 세그먼트가 mid일 때 — accent 끝을 오른쪽으로 둥글게 처리해 자연스러운 종단을 만들어요.
 *   mid_end_filled=오른쪽 둥근 채움, mid_end_half=왼쪽 절반 채움(끝 둥글게), mid_end_empty=빈 mid(사각).
 * end 셀은 오른쪽 라우드, start 셀은 왼쪽 라우드, mid는 사각이에요.
 * kind: 'start' | 'mid' | 'end' | 'mid_end', state: 'filled' | 'half' | 'empty'
 */
function renderProgressBarCell(kind, state, params) {
  const W = params.pbWidth;
  const H = params.pbHeight;
  // 기존 110px pb 캡 라우드 비율(≈48/110) 유지. pbCapRadius=0이면 자동.
  const r =
    params.pbCapRadius > 0 ? params.pbCapRadius : Math.round(H * 0.43636);
  const fill = params.accent;
  const emptyColor = params.pbEmptyColor;
  const canvas = new Canvas(W, H);
  const ctx = canvas.getContext("2d");
  const leftCap = kind === "start"; // start만 왼쪽 라우드
  const rightCap = kind === "end" || kind === "mid_end"; // end·mid_end는 오른쪽 라우드

  // 1) 빈 배경 레이어: 사각으로 채우고, start/end가 열리는 쪽 모서리만 투명(destination-out)으로 자른 캡을 만들어요.
  //    mid/mid_end는 사각 그대로. empty/half에서 accent 위에 보이는 빈 배경이 여기서 만들어져요.
  const bgLayer = new Canvas(W, H);
  const b = bgLayer.getContext("2d");
  b.fillStyle = emptyColor;
  b.fillRect(0, 0, W, H);
  if (leftCap || (rightCap && kind === "end")) {
    // 라운드 캡 "안" 영역만 남기기: destination-in에 라운드 마스크
    const cap = new Canvas(W, H);
    const m = cap.getContext("2d");
    m.fillStyle = "#fff";
    if (leftCap) roundRect(m, 0, 0, W, H, r, true, kind === "end" && rightCap);
    else roundRect(m, 0, 0, W, H, r, false, true);
    b.globalCompositeOperation = "destination-in";
    b.drawImage(cap, 0, 0);
  }
  ctx.drawImage(bgLayer, 0, 0);

  // 2) 채워진(accent) 레이어: filled/half 면적을 라운드 마스크로 자른 뒤 배경 위에 덮어요.
  if (state !== "empty") {
    const layer = new Canvas(W, H);
    const f = layer.getContext("2d");
    f.fillStyle = fill;
    if (state === "filled") roundRect(f, 0, 0, W, H, r, leftCap, rightCap);
    else roundRect(f, 0, 0, Math.round(W / 2), H, r, leftCap, true);
    ctx.drawImage(layer, 0, 0);
  }
  return canvas;
}

// 한쪽 모서리만(또는 양쪽) 라운드된 사각형을 그려요. 왼쪽=상·하 모서리만, 오른쪽=상·하 모서리만.
function roundRect(ctx, x, y, w, h, r, roundLeft, roundRight) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  if (roundLeft && roundRight) {
    ctx.roundRect(x, y, w, h, rr);
  } else if (roundLeft) {
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + rr, y);
    ctx.arc(x + rr, y + rr, rr, -Math.PI / 2, Math.PI, true);
    ctx.lineTo(x, y + h - rr);
    ctx.arc(x + rr, y + h - rr, rr, Math.PI, Math.PI / 2, true);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  } else if (roundRight) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, false);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();
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
          join(outDir, `pb_${k}_${s}.png`),
          await renderProgressBarCell(k, s, params).toBuffer("png"),
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
    try {
      const isFilled = FILLED.has(name);
      if (isFilled) filled++;
      const nodes = await loadIconNodes(EMOJI_LUCIDE_MAP[name]);
<<<<<<< HEAD
=======
      const { canvas, skipped, empty } = renderIconCanvas(
        nodes,
        isFilled,
        params,
      );
      if (empty)
        throw new Error(`빈 아이콘(ink 없음) — 미지원 태그만 있거나 노드 없음`);
>>>>>>> b7b9c625 (feat(emojis): 이모지·진행바 리디자인 — 크기 조정, pb_mid_end 라운드, 색상 통일)
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
    `[icons] 완료: ${ok} 렌더링 (${filled} fill, ${ok - filled} stroke), 실패 ${fail} → ${outDir}`,
  );
}

await main();
