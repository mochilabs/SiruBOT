import { config } from "dotenv";
import { join } from "node:path";

// 실행 위치에 상관없이 apps/bot/.env 파일을 정상적으로 탐색하여 로드합니다.
config();
config({ path: join(process.cwd(), "apps", "bot", ".env") });

import { REST, Routes } from "discord.js";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { blue, bold, cyan, gray, green, red, yellow } from "colorette";

// CLI 인자 파싱
const args = process.argv.slice(2);
const showHelp = args.includes("--help") || args.includes("-h");
const isDryRun = args.includes("--dry-run") || args.includes("-d");
const isClean = args.includes("--clean");

const EMOJI_SOURCE_DIR = join(process.cwd(), "resources", "emoji_replacement");
/** 이모지 이름은 2~32자, 소문자+숫자+언더스코어만 허용 */
const NAME_REGEX = /^[a-z0-9_]{2,32}$/;

if (showHelp) {
  console.log(bold(cyan("\n[SiruBOT 앱 이모지 업로드 도구 도움말]")));
  console.log(gray("==============================================="));
  console.log(bold("사용법:"));
  console.log(gray("  yarn dlx tsx scripts/upload-emojis.ts [옵션]\n"));
  console.log(bold("옵션 목록:"));
  console.log(
    `  ${bold("-d, --dry-run")}  : 실제로 Discord API를 호출하지 않고 업로드 대상 목록만 보여줍니다.`,
  );
  console.log(
    `  ${bold("--clean")}        : 기존 앱 이모지를 모두 삭제한 뒤 업로드합니다 (이름 불일치 잔여 이모지 정리용).`,
  );
  console.log(bold("설명:"));
  console.log(
    gray("  resources/emoji_replacement/ 디렉터리의 .png 파일 전부를"),
  );
  console.log(
    gray("  봇 전용 앱 이모지(application emoji, 글로벌)로 업로드합니다."),
  );
  console.log(
    gray("  파일명이 이모지 이름이 됩니다 (예: star.png → :star:).\n"),
  );
  process.exit(0);
}

async function main() {
  const token = process.env.DISCORD_TOKEN;

  console.log(bold(cyan("\n[SiruBOT 앱 이모지 업로드 도구]")));
  console.log(gray("==============================================="));

  // 업로드 대상 PNG 수집 (토큰 검증 전에 수행 — dry-run은 토큰 없이도 동작)
  let files: string[] = [];
  try {
    files = (await readdir(EMOJI_SOURCE_DIR))
      .filter((f) => f.toLowerCase().endsWith(".png"))
      .sort();
  } catch {
    console.error(red(`에러: ${EMOJI_SOURCE_DIR} 디렉터리를 읽지 못했습니다.`));
    process.exit(1);
  }

  const invalid = files.filter((f) => !NAME_REGEX.test(basename(f, ".png")));
  if (invalid.length > 0) {
    console.error(
      red(
        `에러: 파일명이 이모지 이름 규칙(2~32자, 소문자/숫자/_)에 맞지 않습니다: ${invalid.join(", ")}`,
      ),
    );
    process.exit(1);
  }

  if (files.length === 0) {
    console.warn(yellow("업로드할 PNG 파일이 없습니다. 종료합니다."));
    return;
  }

  console.log(gray(`소스 디렉터리: ${EMOJI_SOURCE_DIR}`));
  console.log(green(`업로드 대상: ${files.length}개 이모지\n`));
  files.forEach((f, i) =>
    console.log(
      `  ${bold(green(`${i + 1}.`))} :${bold(blue(basename(f, ".png")))}:`,
    ),
  );
  console.log("");

  if (isDryRun) {
    console.log(
      bold(
        green("[DRY RUN 성공] 실제 업로드는 --dry-run 옵션을 빼고 실행하세요."),
      ),
    );
    return;
  }

  if (!token) {
    console.error(
      red("에러: DISCORD_TOKEN이 .env 파일에 정의되어 있지 않습니다."),
    );
    process.exit(1);
  }

  // DISCORD_TOKEN의 첫 번째 세그먼트(Base64)에서 봇 ID(application ID) 추출
  let applicationId = process.env.CLIENT_ID || process.env.BOT_ID;
  if (!applicationId) {
    try {
      applicationId = Buffer.from(token.split(".")[0], "base64").toString(
        "utf-8",
      );
    } catch {
      // 파싱 실패
    }
  }
  if (!applicationId) {
    console.error(
      red(
        "에러: CLIENT_ID (또는 BOT_ID)를 파싱하지 못했습니다. .env 설정을 확인해주세요.",
      ),
    );
    process.exit(1);
  }

  const rest = new REST({ version: "10" }).setToken(token);

  // 기존 앱 이모지 조회
  console.log(gray(`대상 봇 ID: ${applicationId}`));
  console.log(blue("기존 앱 이모지를 조회합니다..."));
  const existing = (await rest.get(
    Routes.applicationEmojis(applicationId),
  )) as { items: Array<{ id: string; name: string }> };
  const existingByName = new Map(existing.items.map((e) => [e.name, e.id]));
  console.log(gray(`기존 앱 이모지: ${existing.items.length}개`));

  if (isClean && existing.items.length > 0) {
    console.log(yellow("--clean: 기존 앱 이모지를 모두 삭제합니다..."));
    let deleted = 0;
    for (const emoji of existing.items) {
      try {
        await rest.delete(Routes.applicationEmoji(applicationId, emoji.id));
        deleted++;
        process.stdout.write(gray(`  🗑️ :${emoji.name}: 삭제됨\n`));
      } catch (error) {
        console.warn(
          yellow(
            `  ⚠️ :${emoji.name}: 삭제 실패 (${error instanceof Error ? error.message : String(error)})`,
          ),
        );
      }
    }
    console.log(green(`${deleted}개 삭제 완료\n`));
    existingByName.clear();
  }

  // 이름 같은 것은 건너뛰고(갱신 안 함), 없는 것만 업로드
  const toUpload = files.filter(
    (f) => !existingByName.has(basename(f, ".png")),
  );
  const skipped = files.length - toUpload.length;
  if (skipped > 0)
    console.log(
      gray(`이미 존재해서 건너뛸 이모지: ${skipped}개 (기존 이미지는 유지)\n`),
    );

  /** 이름 → 이모지 ID 매핑 — 업로드 결과 + 기존 존재분 전부 기록 */
  const emojiIdMap: Record<string, string> = Object.fromEntries(existingByName);

  let created = 0;
  let failed = 0;
  for (const [i, file] of toUpload.entries()) {
    const name = basename(file, ".png");
    const filePath = join(EMOJI_SOURCE_DIR, file);
    try {
      const data = await readFile(filePath);
      const sizeKiB = data.byteLength / 1024;
      if (sizeKiB > 256) {
        console.warn(
          yellow(
            `  ⚠️ :${name}: 256KiB 초과 (${sizeKiB.toFixed(1)}KiB) — 건너뜀`,
          ),
        );
        failed++;
        continue;
      }
      const dataUri = `data:image/png;base64,${data.toString("base64")}`;
      const createdEmoji = (await rest.post(
        Routes.applicationEmojis(applicationId),
        {
          body: { name, image: dataUri },
        },
      )) as { id: string; name: string };
      emojiIdMap[createdEmoji.name] = createdEmoji.id;
      created++;
      console.log(
        green(
          `  ✅ (${i + 1}/${toUpload.length}) :${createdEmoji.name}: → id ${createdEmoji.id}`,
        ),
      );
    } catch (error) {
      failed++;
      console.warn(
        yellow(
          `  ⚠️ (${i + 1}/${toUpload.length}) :${name}: 업로드 실패 (${error instanceof Error ? error.message : String(error)})`,
        ),
      );
    }
  }

  // 매핑 파일 저장 — canonical 위치( resources/emoji_replacement/emoji-ids.json )는
  // 커밋 대상이라 Docker 이미지에 들어가요(앱 이모지 ID는 application 소유로 고정).
  // 런타임용 apps/bot/resources/emoji-ids.json도 갱신해요 — 로컬 dev CWD 기준 로드 경로라
  // 커밋 대상이며, canonical과 함께 커밋해 두 사본을 같은 상태로 유지해요.
  const mapPath = join(EMOJI_SOURCE_DIR, "emoji-ids.json");
  await writeFile(mapPath, `${JSON.stringify(emojiIdMap, null, 2)}\n`, "utf-8");
  console.log(green(`canonical 매핑 저장 (커밋 필요): ${mapPath}`));
  try {
    const botResourcesDir = join(process.cwd(), "apps", "bot", "resources");
    await mkdir(botResourcesDir, { recursive: true });
    await writeFile(
      join(botResourcesDir, "emoji-ids.json"),
      `${JSON.stringify(emojiIdMap, null, 2)}\n`,
      "utf-8",
    );
    console.log(
      gray(`런타임 매핑 동기화 (canonical과 함께 커밋): ${join(botResourcesDir, "emoji-ids.json")}`),
    );
  } catch {
    // 모노레포 루트가 아닌 위치에서 실행 시 무시
  }

  console.log("");
  console.log(
    bold(
      green(`완료! 생성 ${created}개 / 건너뜀 ${skipped}개 / 실패 ${failed}개`),
    ),
  );
}

main().catch((error) => {
  console.error(red("앱 이모지 업로드 중 에러가 발생했습니다:"), error);
  process.exit(1);
});
