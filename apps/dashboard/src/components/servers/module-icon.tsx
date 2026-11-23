import type { BotModuleId } from "@sirubot/utils/modules";
import { Bot, Dices, type LucideIcon, Music, Settings, Users, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

/** 기능 모듈 아이콘 — 모듈 표(@sirubot/utils/modules)의 유니코드 이모지 대신 대시보드에서 쓰는 Lucide 아이콘이에요. */
const MODULE_ICONS: Record<BotModuleId, LucideIcon> = {
	music: Music,
	community: Users,
	ai: Bot,
	fun: Dices,
	utility: Wrench,
	admin: Settings,
};

export function ModuleIcon({ id, className }: { id: BotModuleId; className?: string }) {
	const Icon = MODULE_ICONS[id];
	return <Icon aria-hidden className={cn("inline-block h-4 w-4 shrink-0 align-[-3px] text-primary-text", className)} />;
}
