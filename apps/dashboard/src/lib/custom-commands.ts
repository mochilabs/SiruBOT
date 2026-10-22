import type {
	CustomCommandMethod,
	CustomCommandSpec
} from "@sirubot/utils/customCommand";
import {
	CUSTOM_COMMAND_MAX_PER_GUILD,
	CUSTOM_COMMAND_MAX_SLASH_PER_GUILD,
	normalizeCustomCommandName,
	normalizeCustomCommandPrefix,
	validateCustomCommandName,
} from "@sirubot/utils/customCommand";

import { db } from "@/lib/db";

/** 커스텀 명령어 한 개의 API 응답 형태 — spec은 저장 시 스키마로 검증된 값이에요 */
export interface CustomCommandSummary {
  id: string;
  name: string;
  description: string;
  /** 실행 방식 — 'prefix'는 접두사 메시지, 'slash'는 슬래시로만 실행돼요 (생성 후 불변) */
  method: CustomCommandMethod;
  spec: CustomCommandSpec;
  createdAt: string;
  updatedAt: string;
}

/** GET/POST/PUT/PATCH/DELETE 공용 응답 봉투 — 접두사와 목록을 항상 함께 내려줘요 */
export interface CustomCommandsState {
  ok: true;
  prefix: string;
  commands: CustomCommandSummary[];
  /** 슬래시형 개수 — 슬롯(최대 MAX_SLASH_COMMANDS_PER_GUILD) 표시용 */
  slashCount: number;
}

/**
 * 길드의 접두사 + 커스텀 명령어 목록을 읽어요 — 관리 API가 저장/삭제 후 같은 봉투를 돌려줘
 * 클라이언트가 한 번에 최신 상태를 반영해요.
 */
export async function readCustomCommandsState(
  guildId: string,
): Promise<CustomCommandsState> {
  const [guild, rows] = await Promise.all([
    db.guild.findUnique({ where: { id: guildId } }),
    db.customCommand.findMany({
      where: { guildId },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    ok: true,
    prefix: normalizeCustomCommandPrefix(guild?.customCommandPrefix),
    slashCount: rows.filter((row) => row.method === "slash").length,
    commands: rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      method: row.method === "slash" ? "slash" : "prefix",
      // spec은 저장 시 zod로 검증된 JSON — 응답 타입만 좁혀요
      spec: row.spec as unknown as CustomCommandSpec,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

/** 이름을 매칭용으로 정규화해 저장해요 — 'Greet'와 'greet'가 같은 명령어가 돼요 */
export function normalizedCommandName(name: string): string {
  return normalizeCustomCommandName(name);
}

/** 커스텀 명령어 개수 상한 — 서버당 */
export const MAX_CUSTOM_COMMANDS_PER_GUILD = CUSTOM_COMMAND_MAX_PER_GUILD;

/** 슬래시형 커스텀 명령어 슬롯 상한 — 봇 본 커맨드의 Discord 슬롯을 보호해요 */
export const MAX_SLASH_COMMANDS_PER_GUILD = CUSTOM_COMMAND_MAX_SLASH_PER_GUILD;

export { validateCustomCommandName };
