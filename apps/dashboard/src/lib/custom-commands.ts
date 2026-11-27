import type {
	CustomCommandMethod,
	CustomCommandSpec
} from "@sirubot/utils/customCommand";
import {
	CUSTOM_COMMAND_MAX_PER_GUILD,
	CUSTOM_COMMAND_MAX_SLASH_PER_GUILD,
	normalizeCustomCommandPrefix,
} from "@sirubot/utils/customCommand";

import { db } from "@/lib/db";

export interface CustomCommandSummary {
  id: string;
  name: string;
  description: string;
  method: CustomCommandMethod;
  spec: CustomCommandSpec;
  createdAt: string;
  updatedAt: string;
}

export interface CustomCommandsState {
  ok: true;
  prefix: string;
  commands: CustomCommandSummary[];
  slashCount: number;
}

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
      spec: row.spec as unknown as CustomCommandSpec,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

export const MAX_CUSTOM_COMMANDS_PER_GUILD = CUSTOM_COMMAND_MAX_PER_GUILD;

export const MAX_SLASH_COMMANDS_PER_GUILD = CUSTOM_COMMAND_MAX_SLASH_PER_GUILD;
