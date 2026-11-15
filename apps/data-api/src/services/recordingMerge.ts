import type { Prisma, PrismaClient } from '@sirubot/prisma';
import { sourcePriority } from '@sirubot/utils/trackIdentity';

type Tx = Prisma.TransactionClient;

const recordingSelect = { id: true, isrc: true, totalPlays: true, source: true, title: true, artist: true, thumbnail: true } as const;

export type ApplyIsrcResult = 'track-only' | 'already' | 'filled' | 'merged' | 'conflict';

async function advisoryLock(tx: Tx, key: string): Promise<void> {
	// 봇 recordingLink.ts와 같은 키 — ISRC 묶음 생성·병합이 서로 겹치지 않게 해요.
	await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
}

/**
 * from 묶음을 to로 합쳐요 (트랜잭션 안에서 호출). Track 연결·일별 롤업·누적 재생수를 옮기고 from을 지워요.
 * 대표 표시값은 소스 우선순위가 높은 쪽을 남겨요. 관리자 병합 도구도 이 함수를 써요.
 */
export async function mergeRecordings(tx: Tx, fromId: string, toId: string): Promise<void> {
	if (fromId === toId) return;
	const [from, to] = await Promise.all([
		tx.recording.findUnique({ where: { id: fromId }, select: recordingSelect }),
		tx.recording.findUnique({ where: { id: toId }, select: recordingSelect })
	]);
	if (!from || !to) throw new Error(`mergeRecordings: missing recording (${fromId} → ${toId})`);

	await tx.track.updateMany({ where: { recordingId: fromId }, data: { recordingId: toId } });
	await tx.$executeRaw`
		INSERT INTO "RecordingDailyPlay" ("recordingId", "day", "guildId", "plays")
		SELECT ${toId}, "day", "guildId", "plays" FROM "RecordingDailyPlay" WHERE "recordingId" = ${fromId}
		ON CONFLICT ("recordingId", "day", "guildId") DO UPDATE SET "plays" = "RecordingDailyPlay"."plays" + EXCLUDED."plays"`;
	// from의 일별 행은 Cascade로 함께 지워져요. isrc unique를 비운 뒤에 to에 옮겨요.
	await tx.recording.delete({ where: { id: fromId } });

	const takeFromDisplay = sourcePriority(from.source) > sourcePriority(to.source);
	await tx.recording.update({
		where: { id: toId },
		data: {
			totalPlays: { increment: from.totalPlays },
			...(!to.isrc && from.isrc ? { isrc: from.isrc } : {}),
			...(takeFromDisplay ? { title: from.title, artist: from.artist, source: from.source, thumbnail: from.thumbnail ?? to.thumbnail } : {})
		}
	});
}

/**
 * Track에서 찾은 ISRC를 저장하고 묶음에 반영해요.
 * - 묶음에 ISRC가 없고 같은 ISRC 묶음도 없으면 → 묶음에 채움
 * - 같은 ISRC를 가진 다른 묶음이 있으면 → 그쪽으로 병합
 * - 묶음이 이미 다른 ISRC면 → 합치지 않아요 (conflict)
 * 묶음의 다른 Track 중 ISRC가 없는 것은 묶음 ISRC를 물려받아 외부 조회를 건너뛰어요.
 */
export async function applyTrackIsrc(db: PrismaClient, trackId: string, isrc: string, source: string): Promise<ApplyIsrcResult> {
	return db.$transaction(async (tx) => {
		await advisoryLock(tx, `isrc:${isrc}`);
		const now = new Date();
		const track = await tx.track.update({
			where: { id: trackId },
			data: { isrc, isrcSource: source, isrcCheckedAt: now },
			select: { recordingId: true }
		});
		if (!track.recordingId) return 'track-only';

		const recording = await tx.recording.findUnique({ where: { id: track.recordingId }, select: { id: true, isrc: true } });
		if (!recording) return 'track-only';
		if (recording.isrc === isrc) return 'already';
		if (recording.isrc) return 'conflict';

		const owner = await tx.recording.findUnique({ where: { isrc }, select: { id: true } });
		let targetId = recording.id;
		let result: ApplyIsrcResult = 'filled';
		if (owner) {
			await mergeRecordings(tx, recording.id, owner.id);
			targetId = owner.id;
			result = 'merged';
		} else {
			await tx.recording.update({ where: { id: recording.id }, data: { isrc } });
		}
		await tx.track.updateMany({
			where: { recordingId: targetId, isrc: null },
			data: { isrc, isrcSource: 'recording', isrcCheckedAt: now }
		});
		return result;
	});
}
