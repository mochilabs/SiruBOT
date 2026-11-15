import type { PrismaClient } from '@sirubot/prisma';
import { Track } from 'lavalink-client';
import { extractTrackData } from './trackData.ts';
import { isTtsClip, RELATED_TRACK_REQUESTER_ID } from '../lavalink/requester.ts';

/**
 * Prisma 오류를 진단 가능하게 직렬화한다 — code(P2003 등)와 meta(제약명)를 남겨
 * FK 위반의 원인(trackId·부모 행 존재 여부)을 추적할 수 있게 한다.
 */
export function formatRecordError(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
	const meta = 'meta' in error ? (error as { meta?: unknown }).meta : undefined;
	const codeText = typeof code === 'string' && code.length > 0 ? ` (code=${code})` : '';
	const metaText = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
	return `${error.message}${codeText}${metaText}`;
}

/** TrackService가 쓰는 의존성 — DB 접근만 받아요 */
export interface TrackServiceDeps {
	db: PrismaClient;
}

export class TrackService {
	constructor(private readonly deps: TrackServiceDeps) {}

	public async increasePlays(track: Track) {
		const data = extractTrackData(track);
		// 식별자도 uri도 없는 곡은 랭킹·히스토리 모두 기록할 수 없다 — 조용히 건너뛴다.
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
		// 채팅 TTS 클립은 재생 히스토리 대상이 아니다 (명세 4.2 단독 클립 규칙).
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

	/**
	 * 재생 기록의 원자적 단일 진입점 — 곡 upsert(랭킹 증가)와 히스토리 기록을 하나의
	 * 트랜잭션으로 묶는다. 재생 중 커넥션 단절·노드 교체·redeploy로 요청이 abort되면
	 * 두 행이 함께 롤백되어, 부모 Track 없이 GuildTrackHistory만 남는 FK 위반(P2003)을
	 * 원천 차단한다. (기존 increasePlays→addHistory 분리 호출은 각기 다른 풀 커넥션에서
	 * 실행돼, increasePlays의 INSERT가 롤백된 뒤 addHistory가 FK 위반으로 실패했다.)
	 */
	public async recordPlay(guildId: string, track: Track): Promise<void> {
		if (isTtsClip(track)) return;
		const data = extractTrackData(track);
		if (!data.id) return;
		const userId = resolveRequesterId(track);

		await this.deps.db.$transaction(async (tx) => {
			await tx.track.upsert({
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
	}
}

function resolveRequesterId(track: Track): string | null {
	if (!track.requester) return null;
	const requesterId = (track.requester as { id: string } | undefined)?.id;
	return requesterId && requesterId !== RELATED_TRACK_REQUESTER_ID ? requesterId : null;
}
