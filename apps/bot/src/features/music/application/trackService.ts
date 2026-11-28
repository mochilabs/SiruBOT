import type { PrismaClient } from '@sirubot/prisma';
import { Track } from 'lavalink-client';
import { countRecordingPlay, isrcFields, linkRecording } from './recordingLink.ts';
import { extractTrackData } from './trackData.ts';
import { isTtsClip, RELATED_TRACK_REQUESTER_ID } from '../lavalink/requester.ts';
import type { AppLogger } from '../../../lib/appLogger.ts';
import { thrownCode } from '../../../lib/thrownError.ts';

export function formatRecordError(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
	const meta = 'meta' in error ? (error as { meta?: unknown }).meta : undefined;
	const codeText = typeof code === 'string' && code.length > 0 ? ` (code=${code})` : '';
	const metaText = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
	return `${error.message}${codeText}${metaText}`;
}

export interface TrackServiceDeps {
	db: PrismaClient;
	logger?: Pick<AppLogger, 'warn'>;
}

export class TrackService {
	constructor(private readonly deps: TrackServiceDeps) {}

	public async getRecentGuildTracks(guildId: string, limit: number) {
		const rows = await this.deps.db.guildTrackHistory.findMany({
			where: { guildId },
			orderBy: { createdAt: 'desc' },
			take: limit * 4,
			include: { track: true }
		});
		const seen = new Set<string>();
		const recent: { id: string; title: string; artist: string; url: string }[] = [];
		for (const row of rows) {
			if (seen.has(row.trackId)) continue;
			seen.add(row.trackId);
			recent.push({ id: row.track.id, title: row.track.title, artist: row.track.artist, url: row.track.url });
			if (recent.length >= limit) break;
		}
		return recent;
	}

	public async increasePlays(track: Track) {
		const data = extractTrackData(track);
		if (!data.id) return;

		const newTrack = await this.deps.db.track.upsert({
			where: { id: data.id },
			create: {
				...data,
				totalPlays: 1
			},
			update: {
				totalPlays: { increment: 1 },
				...(data.title && data.title !== '(제목 없음)' ? { title: data.title } : {}),
				...(data.artist && data.artist !== '(아티스트 정보 없음)' ? { artist: data.artist } : {}),
				...(data.duration > 0 ? { duration: data.duration } : {}),
				...(data.thumbnail ? { thumbnail: data.thumbnail } : {})
			}
		});

		return newTrack;
	}

	public async addHistory(guildId: string, track: Track) {
		if (isTtsClip(track)) return;
		const data = extractTrackData(track);
		if (!data.id) return;
		const userId = resolveRequesterId(track);

		await Promise.all([
			this.deps.db.guild.upsert({
				where: { id: guildId },
				create: { id: guildId },
				update: {}
			}),
			userId
				? this.deps.db.user.upsert({
						where: { id: userId },
						create: { id: userId },
						update: {}
					})
				: Promise.resolve()
		]);

		await this.deps.db.guildTrackHistory.create({
			data: {
				guildId,
				trackId: data.id,
				userId
			}
		});
	}

	/** 곡 upsert와 히스토리 기록을 한 트랜잭션으로 묶어 abort 시 FK 위반(P2003)을 막는다. */
	public async recordPlay(guildId: string, track: Track): Promise<void> {
		if (isTtsClip(track)) return;
		const data = extractTrackData(track);
		if (!data.id) return;
		const userId = resolveRequesterId(track);

		const now = new Date();
		const countInChart = !isRelatedTrack(track);

		const write = () =>
			this.deps.db.$transaction(async (tx) => {
				const row = await tx.track.upsert({
					where: { id: data.id },
					create: {
						...data,
						...isrcFields(data.isrc, 'lavalink', now),
						totalPlays: 1
					},
					update: {
						totalPlays: { increment: 1 },
						...(data.title && data.title !== '(제목 없음)' ? { title: data.title } : {}),
						...(data.artist && data.artist !== '(아티스트 정보 없음)' ? { artist: data.artist } : {}),
						...(data.duration > 0 ? { duration: data.duration } : {}),
						...(data.thumbnail ? { thumbnail: data.thumbnail } : {}),
						...isrcFields(data.isrc, 'lavalink', now)
					},
					select: { recordingId: true }
				});
				const recordingId = row.recordingId ?? (await linkRecording(tx, data, now));
				if (recordingId) await countRecordingPlay(tx, recordingId, data, { guildId, now, countInChart });
				await tx.guild.upsert({
					where: { id: guildId },
					create: { id: guildId },
					update: {}
				});
				if (userId) {
					await tx.user.upsert({
						where: { id: userId },
						create: { id: userId },
						update: {}
					});
				}
				await tx.guildTrackHistory.create({
					data: {
						guildId,
						trackId: data.id,
						userId
					}
				});
			});

		try {
			await write();
		} catch (error) {
			if (!isRetryableRecordError(error)) throw error;
			// Seen once in production: the link update missed the row this transaction had just upserted. A fresh transaction succeeds.
			this.deps.logger?.warn(`[recordPlay] retrying once (guild ${guildId}, track ${data.id}): ${formatRecordError(error)}`);
			await write();
		}
	}
}

function isRetryableRecordError(error: unknown): boolean {
	const code = thrownCode(error);
	return code === 'P2025' || code === 'P2034';
}

function isRelatedTrack(track: Track): boolean {
	return (track.requester as { id?: unknown } | undefined)?.id === RELATED_TRACK_REQUESTER_ID;
}

function resolveRequesterId(track: Track): string | null {
	if (!track.requester) return null;
	const requesterId = (track.requester as { id: string } | undefined)?.id;
	return requesterId && requesterId !== RELATED_TRACK_REQUESTER_ID ? requesterId : null;
}
