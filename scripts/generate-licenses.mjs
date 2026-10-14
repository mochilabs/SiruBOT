#!/usr/bin/env node
/**
 * 오픈소스 라이선스 목록 생성기 — node_modules의 모든 의존성(직접+전이)을 순회해
 * 대시보드 /licenses 페이지가 렌더할 JSON을 만들어요.
 *
 * 사용: yarn node scripts/generate-licenses.mjs (의존성을 추가/제거한 뒤 다시 실행)
 * 출력: apps/dashboard/src/generated/open-source-licenses.json (커밋해서 빌드 시 재생성 불필요)
 *
 * - yarn node-modules 링커 기준: node_modules/**\/package.json (+ 스코프 중첩) 을 걷어요.
 * - @sirubot/* 워크스페이스(자체 코드)는 제외해요 — 이 목록은 서드파티 고지용이에요.
 * - license 필드는 문자열/배열/객체 스타일이 섞여 있어 정규화하고, 없으면 Unknown으로 표기해요.
 */
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const NODE_MODULES = join(ROOT, "node_modules");
const OUTPUT = join(
  ROOT,
  "apps/dashboard/src/generated/open-source-licenses.json",
);

/** 스포츠성 오탐 없이 raw package.json을 파싱해요 (깨진 매니페스트는 조용히 스킵) */
function readManifest(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** license / licenses 필드 정규화 — 문자열·배열·객체 스타일 전부 지원해요 */
function licenseOf(manifest) {
  const raw =
    manifest.license ??
    (Array.isArray(manifest.licenses)
      ? manifest.licenses
          .map((entry) =>
            typeof entry === "string" ? entry : (entry?.type ?? ""),
          )
          .join(" OR ")
      : typeof manifest.licenses === "string"
        ? manifest.licenses
        : manifest.licenses?.type);
  if (typeof raw !== "string" || raw.length === 0) return "Unknown";
  return raw.replace(/\s*\*$/, "").trim() || "Unknown";
}

/** homepage / repository에서 링크를 뽑아요 — git+·.git·git@ 표기를 정리해요 */
function urlOf(manifest) {
  let raw =
    manifest.homepage ??
    manifest.url ??
    (typeof manifest.repository === "string"
      ? manifest.repository
      : manifest.repository?.url);
  if (typeof raw !== "string" || raw.length === 0) return null;
  raw = raw
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/#readme$/, "");
  return raw.startsWith("https://") || raw.startsWith("http://") ? raw : null;
}

/** 라이선스 문자열을 그룹 키(SDPX 계열)로 정규화해요 — 표기 변형(MIT License, MIT*, Apache ...) 묶음용 */
function licenseGroupKey(license) {
  const upper = license
    .toUpperCase()
    .replace(/\*$/, "")
    .replace(/^[(\s]+/, "")
    .trim();
  // 이중 라이선스("(MIT OR Apache-2.0)")는 정보 손실을 막으려고 원문 그룹으로 유지해요
  if (upper.includes(" OR ") || upper.includes(" AND ")) return license.trim();
  if (upper.startsWith("MIT")) return "MIT";
  if (upper.startsWith("APACHE")) return "Apache-2.0";
  if (upper.startsWith("BSD-3") || upper.startsWith("BSD 3"))
    return "BSD-3-Clause";
  if (upper.startsWith("BSD-2") || upper.startsWith("BSD 2"))
    return "BSD-2-Clause";
  if (upper.startsWith("0BSD")) return "0BSD";
  if (upper.startsWith("ISC")) return "ISC";
  if (upper.startsWith("MPL")) return "MPL-2.0";
  if (upper.startsWith("CC-BY-4")) return "CC-BY-4.0";
  if (upper.startsWith("CC-BY-3")) return "CC-BY-3.0";
  if (upper.startsWith("ZLIB")) return "Zlib";
  if (upper.startsWith("WTFPL")) return "WTFPL";
  if (upper.startsWith("UNLICENSE")) return "Unlicense";
  if (upper.startsWith("PYTHON") || upper.startsWith("PSF")) return "PSF";
  if (upper.startsWith("ARTISTIC")) return "Artistic-2.0";
  if (upper === "UNKNOWN") return "Unknown";
  return license.trim();
}

/** node_modules를 걷어요 — 스코프 패키지(@org/pkg)와 중첩 node_modules까지 포함해요 */
function collectManifestPaths() {
  const paths = [];
  const walkNodeModules = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const entryPath = join(dir, entry.name);
      if (entry.name.startsWith("@")) {
        for (const scoped of readdirSync(entryPath, { withFileTypes: true })) {
          const manifestPath = join(entryPath, scoped.name, "package.json");
          if (existsSync(manifestPath)) paths.push(manifestPath);
          const nested = join(entryPath, scoped.name, "node_modules");
          if (existsSync(nested)) walkNodeModules(nested);
        }
        continue;
      }
      const manifestPath = join(entryPath, "package.json");
      if (existsSync(manifestPath)) paths.push(manifestPath);
      const nested = join(entryPath, "node_modules");
      if (existsSync(nested)) walkNodeModules(nested);
    }
  };
  walkNodeModules(NODE_MODULES);
  return paths;
}

const seen = new Map();
let skippedPrivate = 0;
let skippedSelf = 0;
let malformed = 0;

for (const manifestPath of collectManifestPaths()) {
  const manifest = readManifest(manifestPath);
  if (!manifest || typeof manifest.name !== "string") {
    malformed++;
    continue;
  }
  if (manifest.private) {
    // yarn이 워크스페이스(@sirubot/*)를 node_modules에 심링크해요 — 자체 코드는 고지 대상이 아니에요.
    skippedPrivate++;
    continue;
  }
  if (manifest.name.startsWith("@sirubot/")) {
    skippedSelf++;
    continue;
  }
  const key = manifest.name;
  if (seen.has(key)) continue;
  const license = licenseOf(manifest);
  seen.set(key, {
    name: manifest.name,
    license,
    group: licenseGroupKey(license),
    url: urlOf(manifest),
  });
}

const entries = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));

/** 그룹 요약 — 큰 그룹(대부분 MIT)이 먼저 오게 정렬해요 */
const groups = new Map();
for (const entry of entries) {
  const bucket = groups.get(entry.group) ?? 0;
  groups.set(entry.group, bucket + 1);
}
const groupSummary = [...groups.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([license, count]) => ({ license, count }));

const output = {
  generatedAt: new Date().toISOString(),
  total: entries.length,
  groupSummary,
  entries,
};

writeFileSync(OUTPUT, `${JSON.stringify(output, null, "\t")}\n`);

console.log(`오픈소스 라이선스 목록 생성 완료: ${entries.length}개 패키지`);
console.log(
  `그룹: ${groupSummary.map(({ license, count }) => `${license} ${count}`).join(", ")}`,
);
console.log(
  `스킵 — 워크스페이스(private/symlink): ${skippedPrivate}, @sirubot 자체: ${skippedSelf}, 파싱 실패: ${malformed}`,
);
console.log(`출력: ${relative(ROOT, OUTPUT)}`);
