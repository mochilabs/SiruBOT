import { BOT_MODULES, type BotModuleId,featureModule } from "@sirubot/utils/modules";

/**
 * /admin "사용 지표" 탭 집계 — 봇이 쌓는 FeatureDailyUse·GuildLifecycle을 표 3개로 묶어요.
 * DB 조회는 API 라우트가 하고, 여기는 순수 계산만 해요 (테스트하기 쉽게).
 */

export const ACTIVATION_WINDOW_MS = 24 * 60 * 60_000;

export interface LifecycleRow {
	joinedAt: Date;
	firstUseAt: Date | null;
	leftAt: Date | null;
}

/** featureDailyUse.groupBy({ by: ["guildId", "feature"], _sum: { count } }) 결과 한 줄 */
export interface UsageGroupRow {
	guildId: string;
	feature: string;
	count: number;
}

export interface ActivationSummary {
	/** 기간 안에 들어온 서버 수 */
	joined: number;
	/** 들어온 뒤 24시간 안에 뭐라도 쓴 서버 수 */
	activated: number;
	/** 그중 지금도 남아 있는 서버 수 */
	stillIn: number;
	/** activated / joined (0~1). 들어온 서버가 없으면 null */
	rate: number | null;
}

export interface ModuleUsage {
	id: BotModuleId;
	label: string;
	emoji: string;
	activeGuilds: number;
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

/** GET /api/admin/usage 응답 */
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

/** 모듈별 활성 서버 수(그 모듈 기능을 한 번이라도 쓴 서버)와 사용 횟수. 표 순서는 BOT_MODULES 순서예요. */
export function summarizeModules(rows: readonly UsageGroupRow[]): ModuleUsage[] {
	const guilds = new Map<BotModuleId, Set<string>>();
	const uses = new Map<BotModuleId, number>();
	for (const row of rows) {
		// 재생 실패·온보딩 발송은 사람이 쓴 게 아니라서 모듈 사용에서 빼요
		if (row.feature.startsWith("playback:") || row.feature === "onboarding:sent") continue;
		const moduleId = featureModule(row.feature);
		if (!moduleId) continue;
		if (!guilds.has(moduleId)) guilds.set(moduleId, new Set());
		guilds.get(moduleId)!.add(row.guildId);
		uses.set(moduleId, (uses.get(moduleId) ?? 0) + row.count);
	}
	return BOT_MODULES.map((m) => ({
		id: m.id,
		label: m.label,
		emoji: m.emoji,
		activeGuilds: guilds.get(m.id)?.size ?? 0,
		uses: uses.get(m.id) ?? 0,
	}));
}

/** 재생 이벤트(`playback:{type}`) 유형별 합계. 많은 순서예요. */
export function summarizePlayback(rows: readonly UsageGroupRow[]): PlaybackUsage[] {
	const totals = new Map<string, number>();
	for (const row of rows) {
		if (!row.feature.startsWith("playback:")) continue;
		const type = row.feature.slice("playback:".length);
		totals.set(type, (totals.get(type) ?? 0) + row.count);
	}
	return [...totals.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}
