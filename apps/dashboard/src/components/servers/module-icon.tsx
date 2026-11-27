import type { BotModuleId } from "@sirubot/utils/modules";
import { Bot, Dices, type LucideIcon, Music, Settings, Users, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

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
