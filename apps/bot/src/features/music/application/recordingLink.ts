import type { Prisma } from '@sirubot/prisma';
import { displayMetadata, durationMatches, kstDay, sourcePriority, trackIdentity } from '@sirubot/utils/trackIdentity';
import type { extractTrackData } from './trackData.ts';

type Tx = Prisma.TransactionClient;
type TrackData = ReturnType<typeof extractTrackData>;

/** ISRC를 새로 알게 된 Track에 함께 쓰는 필드 */
export function isrcFields(isrc: string | null, source: 'lavalink' | 'recording', at: Date) {
	return isrc ? { isrc, isrcSource: source, isrcCheckedAt: at } : {};
}

async function advisoryLock(tx: Tx, key: string): Promise<void> {
	// 같은 곡의 첫 재생이 여러 서버에서 동시에 들어와도 Recording이 하나만 생기게 트랜잭션 단위로 직렬화해요.
	await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
}

/**
 * Track을 같은 녹음 묶음(Recording)에 연결해요. 규칙은 `@sirubot/utils/trackIdentity`예요.
 * 1. ISRC가 같은 묶음 → 2. 같은 녹음 키 중 길이 ±3초 → 3. 새 묶음.
 * 외부 조회는 하지 않아요 (재생 경로). ISRC가 없는 곡은 data-api isrcEnricher가 나중에 채우고 묶음을 합쳐요.
 * 아티스트·제목이 없어 키를 만들 수 없고 ISRC도 없으면 null (차트 밖).
 */
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
			// 이미 아는 곡의 다른 업로드면 묶음의 ISRC를 물려받아 외부 조회를 건너뛰어요.
			...(!isrc && recording.isrc ? isrcFields(recording.isrc, 'recording', now) : {})
		}
	});
	return recording.id;
}

/** 재생 1회를 묶음에 반영해요: 누적 +1, 더 정식인 소스면 대표값 교체, 사람이 고른 곡이면 일별 롤업 +1. */
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
