import type { Prisma } from '@sirubot/prisma';
import { displayMetadata, durationMatches, kstDay, sourcePriority, trackIdentity } from '@sirubot/utils/trackIdentity';
import type { extractTrackData } from './trackData.ts';

type Tx = Prisma.TransactionClient;
type TrackData = ReturnType<typeof extractTrackData>;

export function isrcFields(isrc: string | null, source: 'lavalink' | 'recording', at: Date) {
	return isrc ? { isrc, isrcSource: source, isrcCheckedAt: at } : {};
}

async function advisoryLock(tx: Tx, key: string): Promise<void> {
	// 같은 곡의 첫 재생이 여러 서버에서 동시에 들어와도 Recording이 하나만 생기게 트랜잭션 단위로 직렬화해요.
	await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
}

export async function linkRecording(tx: Tx, data: TrackData, now: Date): Promise<string | null> {
	const identity = trackIdentity({ title: data.title, author: data.artist, durationMs: data.duration, isrc: data.isrc, sourceName: data.source });
	const { isrc, recordingKey: key } = identity;
	if (!isrc && !key) return null;

	// 잠금 순서는 항상 isrc → key (교착 방지)
	if (isrc) await advisoryLock(tx, `isrc:${isrc}`);
	if (key) await advisoryLock(tx, key);

	let recording = isrc ? await tx.recording.findUnique({ where: { isrc }, select: { id: true, isrc: true } }) : null;
	if (!recording && key) {
		const sameKey = await tx.recording.findMany({ where: { key }, select: { id: true, isrc: true, duration: true }, take: 20 });
		const near = sameKey
			.filter((r) => durationMatches(r.duration, identity.durationMs) && !(isrc && r.isrc && r.isrc !== isrc))
			.sort((a, b) => Math.abs(a.duration - identity.durationMs) - Math.abs(b.duration - identity.durationMs))[0];
		if (near) {
			recording = near;
			if (isrc && !near.isrc) {
				await tx.recording.update({ where: { id: near.id }, data: { isrc } });
				recording = { ...near, isrc };
			}
		}
	}
	if (!recording) {
		const display = displayMetadata({ title: data.title, author: data.artist, sourceName: data.source });
		recording = await tx.recording.create({
			data: {
				key: key ?? `isrc:${isrc}`,
				isrc,
				title: display.title,
				artist: display.artist,
				duration: data.duration,
				thumbnail: data.thumbnail,
				source: data.source
			},
			select: { id: true, isrc: true }
		});
	}

	await tx.track.update({
		where: { id: data.id },
		data: {
			recordingId: recording.id,
			...(!isrc && recording.isrc ? isrcFields(recording.isrc, 'recording', now) : {})
		}
	});
	return recording.id;
}

export async function countRecordingPlay(
	tx: Tx,
	recordingId: string,
	data: TrackData,
	opts: { guildId: string; now: Date; countInChart: boolean }
): Promise<void> {
	const current = await tx.recording.update({
		where: { id: recordingId },
		data: { totalPlays: { increment: 1 } },
		select: { source: true }
	});
	if (sourcePriority(data.source) > sourcePriority(current.source)) {
		const display = displayMetadata({ title: data.title, author: data.artist, sourceName: data.source });
		await tx.recording.update({
			where: { id: recordingId },
			data: { title: display.title, artist: display.artist, source: data.source, ...(data.thumbnail ? { thumbnail: data.thumbnail } : {}) }
		});
	}
	if (!opts.countInChart) return;
	const day = kstDay(opts.now);
	await tx.recordingDailyPlay.upsert({
		where: { recordingId_day_guildId: { recordingId, day, guildId: opts.guildId } },
		create: { recordingId, day, guildId: opts.guildId, plays: 1 },
		update: { plays: { increment: 1 } }
	});
}
