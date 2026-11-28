import { BOT_MODULES, type BotModuleId, featureModule } from "@sirubot/utils/modules";

export const ACTIVATION_WINDOW_MS = 24 * 60 * 60_000;

export interface LifecycleRow {
	joinedAt: Date;
	firstUseAt: Date | null;
	leftAt: Date | null;
}

export interface UsageGroupRow {
	feature: string;
	count: number;
}

export interface ActivationSummary {
	joined: number;
	activated: number;
	stillIn: number;
	rate: number | null;
}

export interface ModuleUsage {
	id: BotModuleId;
	label: string;
	emoji: string;
	uses: number;
}

export interface PlaybackUsage {
	type: string;
	count: number;
}

export interface UsageSummary {
	activation: ActivationSummary;
	modules: ModuleUsage[];
	playback: PlaybackUsage[];
}

export type AdminUsageResponse = UsageSummary & { activationDays: number; usageDays: number };

export function summarizeActivation(rows: readonly LifecycleRow[]): ActivationSummary {
	const activated = rows.filter((r) => r.firstUseAt !== null && r.firstUseAt.getTime() - r.joinedAt.getTime() <= ACTIVATION_WINDOW_MS).length;
	return {
		joined: rows.length,
		activated,
		stillIn: rows.filter((r) => r.leftAt === null).length,
		rate: rows.length > 0 ? activated / rows.length : null,
	};
}

export function summarizeModules(rows: readonly UsageGroupRow[]): ModuleUsage[] {
	const uses = new Map<BotModuleId, number>();
	for (const row of rows) {
		if (row.feature.startsWith("playback:") || row.feature === "onboarding:sent") continue;
		const moduleId = featureModule(row.feature);
		if (!moduleId) continue;
		uses.set(moduleId, (uses.get(moduleId) ?? 0) + row.count);
	}
	return BOT_MODULES.map((m) => ({
		id: m.id,
		label: m.label,
		emoji: m.emoji,
		uses: uses.get(m.id) ?? 0,
	}));
}

export function summarizePlayback(rows: readonly UsageGroupRow[]): PlaybackUsage[] {
	const totals = new Map<string, number>();
	for (const row of rows) {
		if (!row.feature.startsWith("playback:")) continue;
		const type = row.feature.slice("playback:".length);
		totals.set(type, (totals.get(type) ?? 0) + row.count);
	}
	return [...totals.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}
