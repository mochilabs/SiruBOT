import type { Prisma, PrismaClient } from '@sirubot/prisma';
import { sourcePriority } from '@sirubot/utils/trackIdentity';

type Tx = Prisma.TransactionClient;

const recordingSelect = { id: true, isrc: true, totalPlays: true, source: true, title: true, artist: true, thumbnail: true } as const;

export type ApplyIsrcResult = 'track-only' | 'already' | 'filled' | 'merged' | 'conflict';

async function advisoryLock(tx: Tx, key: string): Promise<void> {
	// Must match bot recordingLink.ts lock key to serialize ISRC merges.
	await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
}

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
	// Delete from before copying its unique isrc to to.
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
