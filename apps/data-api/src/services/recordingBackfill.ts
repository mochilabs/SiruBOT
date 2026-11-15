import type { PrismaClient } from '@sirubot/prisma';
import { displayMetadata, durationMatches, sourcePriority, trackIdentity } from '@sirubot/utils/trackIdentity';

/**
 * 기존 Track을 Recording 묶음으로 채우는 일회성 백필.
 * 묶음 규칙은 봇 `apps/bot/src/features/music/application/recordingLink.ts`와 같아요
 * (ISRC → 같은 녹음 키 중 길이 ±3초 → 새 묶음).
 */

export interface BackfillTrack {
	id: string;
	title: string;
	artist: string;
	duration: number;
	source: string;
	thumbnail: string | null;
	isrc: string | null;
	totalPlays: number;
}

export interface ExistingRecording {
	id: string;
	key: string;
	isrc: string | null;
	duration: number;
}

export interface PlannedGroup {
	/** 이미 있는 묶음에 붙으면 그 id, 새 묶음이면 null */
	recordingId: string | null;
	key: string;
	isrc: string | null;
	duration: number;
	tracks: BackfillTrack[];
}

/** Track 목록을 묶음으로 나눠요. 순수 함수라 드라이런과 실제 실행이 같은 결과를 써요. */
export function planRecordingGroups(tracks: BackfillTrack[], existing: ExistingRecording[]): { groups: PlannedGroup[]; skipped: BackfillTrack[] } {
	const groups: PlannedGroup[] = existing.map((r) => ({ recordingId: r.id, key: r.key, isrc: r.isrc, duration: r.duration, tracks: [] }));
	const byIsrc = new Map(groups.filter((g) => g.isrc).map((g) => [g.isrc!, g]));
	const byKey = new Map<string, PlannedGroup[]>();
	for (const g of groups) byKey.set(g.key, [...(byKey.get(g.key) ?? []), g]);
	const skipped: BackfillTrack[] = [];

	// 정식 소스·많이 재생된 곡부터 넣어야 묶음 대표 길이가 안정돼요.
	const ordered = [...tracks].sort((a, b) => sourcePriority(b.source) - sourcePriority(a.source) || b.totalPlays - a.totalPlays || a.id.localeCompare(b.id));
	for (const track of ordered) {
		const identity = trackIdentity({ title: track.title, author: track.artist, durationMs: track.duration, isrc: track.isrc, sourceName: track.source });
		const { isrc, recordingKey: key } = identity;
		if (!isrc && !key) {
			skipped.push(track);
			continue;
		}
		let group = isrc ? byIsrc.get(isrc) : undefined;
		if (!group && key) {
			group = (byKey.get(key) ?? [])
				.filter((g) => durationMatches(g.duration, identity.durationMs) && !(isrc && g.isrc && g.isrc !== isrc))
				.sort((a, b) => Math.abs(a.duration - identity.durationMs) - Math.abs(b.duration - identity.durationMs))[0];
			if (group && isrc && !group.isrc) {
				group.isrc = isrc;
				byIsrc.set(isrc, group);
			}
		}
		if (!group) {
			group = { recordingId: null, key: key ?? `isrc:${isrc}`, isrc, duration: track.duration, tracks: [] };
			groups.push(group);
			if (isrc) byIsrc.set(isrc, group);
			byKey.set(group.key, [...(byKey.get(group.key) ?? []), group]);
		}
		group.tracks.push(track);
	}
	return { groups: groups.filter((g) => g.tracks.length > 0), skipped };
}

/** 묶음 하나를 DB에 써요: 새 묶음이면 만들고, 멤버 Track을 연결하고, 누적 재생수를 더해요. */
export async function applyGroup(db: PrismaClient, group: PlannedGroup): Promise<string> {
	const plays = group.tracks.reduce((sum, t) => sum + t.totalPlays, 0);
	const lead = group.tracks[0]!; // planRecordingGroups가 우선순위 순으로 넣었어요
	return db.$transaction(async (tx) => {
		let id = group.recordingId;
		if (id) {
			await tx.recording.update({ where: { id }, data: { totalPlays: { increment: plays }, ...(group.isrc ? { isrc: group.isrc } : {}) } });
		} else {
			const display = displayMetadata({ title: lead.title, author: lead.artist, sourceName: lead.source });
			const created = await tx.recording.create({
				data: {
					key: group.key,
					isrc: group.isrc,
					title: display.title,
					artist: display.artist,
					duration: group.duration,
					thumbnail: group.tracks.find((t) => t.thumbnail)?.thumbnail ?? null,
					source: lead.source,
					totalPlays: plays
				},
				select: { id: true }
			});
			id = created.id;
		}
		await tx.track.updateMany({ where: { id: { in: group.tracks.map((t) => t.id) } }, data: { recordingId: id } });
		return id;
	});
}

/**
 * GuildTrackHistory를 KST 날짜 × 서버로 묶어 일별 롤업을 채워요. `before` 이전 기록만 봐요
 * (그 뒤 재생은 봇이 이미 롤업에 쌓았어요). 요청자 없는 기록(자동재생 등)은 빼요.
 */
export async function previewDailyRollup(db: PrismaClient, before: Date): Promise<{ rows: number; plays: number }> {
	const [result] = await db.$queryRaw<{ rows: bigint; plays: bigint | null }[]>`
		SELECT count(*) AS rows, sum(c) AS plays FROM (
			SELECT count(*) AS c FROM "GuildTrackHistory" h JOIN "Track" t ON t."id" = h."trackId"
			WHERE t."recordingId" IS NOT NULL AND h."userId" IS NOT NULL AND h."createdAt" < ${before}
			GROUP BY t."recordingId", ((h."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')::date, h."guildId"
		) g`;
	return { rows: Number(result?.rows ?? 0), plays: Number(result?.plays ?? 0) };
}

export async function applyDailyRollup(db: PrismaClient, before: Date): Promise<number> {
	return db.$executeRaw`
		INSERT INTO "RecordingDailyPlay" ("recordingId", "day", "guildId", "plays")
		SELECT t."recordingId", ((h."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')::date, h."guildId", count(*)::int
		FROM "GuildTrackHistory" h JOIN "Track" t ON t."id" = h."trackId"
		WHERE t."recordingId" IS NOT NULL AND h."userId" IS NOT NULL AND h."createdAt" < ${before}
		GROUP BY 1, 2, 3
		ON CONFLICT ("recordingId", "day", "guildId") DO UPDATE SET "plays" = "RecordingDailyPlay"."plays" + EXCLUDED."plays"`;
}
