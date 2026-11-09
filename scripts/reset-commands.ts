import { config } from "dotenv";
import { join } from "node:path";

// 실행 위치에 상관없이 apps/bot/.env 파일을 정상적으로 탐색하여 로드합니다.
config();
config({ path: join(process.cwd(), "apps", "bot", ".env") });

import {
  REST,
  Routes,
  type APIApplicationCommand,
  type APIGuild,
} from "discord.js";
import { blue, green, yellow, red, bold, gray, cyan } from "colorette";

// 이 스크립트는 봇에 등록된 슬래시 커맨드를 전부 지웁니다.
//  - 글로벌 커맨드 (applicationCommands)
//  - 봇이 들어가 있는 모든 길드의 길드 전용 커맨드 (applicationGuildCommands)
// 기본은 "무엇이 지워질지"만 출력하는 드라이런이며, 실제 삭제는 --yes 를 붙여야 합니다.
const args = process.argv.slice(2);
const showHelp = args.includes("--help") || args.includes("-h");
const confirmed = args.includes("--yes") || args.includes("-y");

const guildIdx = args.findIndex((arg) => arg === "--guild");
const guildArg = guildIdx !== -1 ? args[guildIdx + 1] : undefined;
if (guildIdx !== -1 && (!guildArg || guildArg.startsWith("-") || !/^\d+$/.test(guildArg))) {
  console.error(red("에러: --guild 뒤에 길드 ID(숫자)를 지정해 주세요. 값이 없으면 전체 삭제로 넘어가지 않도록 중단합니다."));
  process.exit(1);
}
const onlyGuildId = guildArg;
const skipGlobal = args.includes("--no-global");
const skipGuilds = args.includes("--no-guilds");

if (showHelp) {
  console.log(bold(cyan("\n[SiruBOT 슬래시 커맨드 전체 초기화 도구]")));
  console.log(gray("==============================================="));
  console.log(bold("사용법:"));
  console.log(gray("  yarn dlx tsx scripts/reset-commands.ts [옵션]\n"));
  console.log(bold("옵션 목록:"));
  console.log(`  ${bold("-h, --help")}       : 도움말을 출력하고 종료합니다.`);
  console.log(
    `  ${bold("-y, --yes")}        : 실제로 삭제합니다. 없으면 삭제 대상만 출력합니다(드라이런).`,
  );
  console.log(
    `  ${bold("--guild <id>")}     : 해당 길드의 길드 전용 커맨드만 대상으로 합니다.`,
  );
  console.log(
    `  ${bold("--no-global")}      : 글로벌 커맨드는 건드리지 않습니다.`,
  );
  console.log(
    `  ${bold("--no-guilds")}      : 길드 전용 커맨드는 건드리지 않습니다.`,
  );
  console.log(
    gray(
      "\n필요 env: apps/bot/.env 의 DISCORD_TOKEN (CLIENT_ID 는 토큰에서 자동 추출, 필요 시 CLIENT_ID 로 지정)",
    ),
  );
  console.log(gray("===============================================\n"));
  process.exit(0);
}

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error(
    red("에러: DISCORD_TOKEN 이 apps/bot/.env 에 정의되어 있지 않습니다."),
  );
  process.exit(1);
}

// DISCORD_TOKEN 첫 세그먼트(Base64)가 봇(클라이언트) ID입니다.
const clientId =
  process.env.CLIENT_ID ||
  process.env.BOT_ID ||
  Buffer.from(token.split(".")[0], "base64").toString("utf-8");
if (!/^\d+$/.test(clientId)) {
  console.error(
    red(
      "에러: CLIENT_ID 를 확인할 수 없습니다. .env 에 CLIENT_ID 를 지정해 주세요.",
    ),
  );
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

/** 봇이 들어가 있는 모든 길드를 페이지 단위로 가져옵니다. */
async function fetchAllGuilds(): Promise<APIGuild[]> {
  const guilds: APIGuild[] = [];
  let after: string | undefined;
  for (;;) {
    const query = new URLSearchParams({ limit: "200" });
    if (after) query.set("after", after);
    const page = (await rest.get(Routes.userGuilds(), { query })) as APIGuild[];
    guilds.push(...page);
    if (page.length < 200) break;
    after = page[page.length - 1].id;
  }
  return guilds;
}

function describe(commands: APIApplicationCommand[]): string {
  return commands.map((c) => `/${c.name}`).join(", ");
}

async function main() {
  console.log(bold(cyan("\n[SiruBOT 슬래시 커맨드 전체 초기화 도구]")));
  console.log(gray("==============================================="));
  console.log(gray(`대상 봇 ID: ${clientId}`));
  console.log(
    confirmed
      ? bold(red("모드: 실제 삭제 (--yes)"))
      : bold(
          yellow(
            "모드: 드라이런 — 삭제하지 않습니다. 실제로 지우려면 --yes 를 붙이세요.",
          ),
        ),
  );

  // 1) 글로벌 커맨드
  if (!skipGlobal && !onlyGuildId) {
    const globalCommands = (await rest.get(
      Routes.applicationCommands(clientId),
    )) as APIApplicationCommand[];
    console.log(blue(`\n[글로벌] 등록된 커맨드 ${globalCommands.length}개`));
    if (globalCommands.length > 0)
      console.log(gray(`  ${describe(globalCommands)}`));
    if (confirmed && globalCommands.length > 0) {
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log(bold(green("  → 글로벌 커맨드 삭제 완료")));
    }
  }

  // 2) 길드 전용 커맨드
  if (!skipGuilds) {
    const guilds = onlyGuildId
      ? [{ id: onlyGuildId, name: onlyGuildId } as APIGuild]
      : await fetchAllGuilds();
    console.log(blue(`\n[길드] 봇이 들어가 있는 길드 ${guilds.length}개 검사`));

    let cleared = 0;
    let failed = 0;
    for (const guild of guilds) {
      try {
        const guildCommands = (await rest.get(
          Routes.applicationGuildCommands(clientId, guild.id),
        )) as APIApplicationCommand[];
        if (guildCommands.length === 0) continue;

        console.log(
          `  ${bold(guild.name)} (${guild.id}): ${guildCommands.length}개 — ${gray(describe(guildCommands))}`,
        );
        if (confirmed) {
          await rest.put(Routes.applicationGuildCommands(clientId, guild.id), {
            body: [],
          });
          console.log(green("    → 삭제 완료"));
        }
        cleared++;
      } catch (error) {
        failed++;
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(yellow(`  ${guild.id} 처리 실패: ${reason}`));
      }
    }

    console.log(
      bold(
        confirmed
          ? green(`\n길드 ${cleared}곳 초기화 완료, 실패 ${failed}곳.`)
          : yellow(
              `\n삭제 대상 길드 ${cleared}곳, 확인 실패 ${failed}곳. (드라이런이라 변경 없음)`,
            ),
      ),
    );
  }

  console.log(gray("===============================================\n"));
}

main().catch((error) => {
  console.error(red("슬래시 커맨드 초기화 중 에러가 발생했습니다:"), error);
  process.exit(1);
});
