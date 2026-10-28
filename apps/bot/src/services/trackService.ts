import { container } from '@sapphire/framework';
import { Track } from 'lavalink-client';
import { extractTrackData } from './trackData.ts';
import { isTtsClip, RELATED_TRACK_REQUESTER_ID } from '../modules/audio/lavalink/requester.ts';

export class TrackService {
	public async increasePlays(track: Track) {
		const data = extractTrackData(track);
		// 식별자도 uri도 없는 곡은 랭킹·히스토리 모두 기록할 수 없다 — 조용히 건너뛴다.
		if (!data.id) return;

		const newTrack = await container.db.track.upsert({
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
		let userId: string | null = null;
		if (track.requester) {
			const requesterId = (track.requester as { id: string } | undefined)?.id;
			if (requesterId && requesterId !== RELATED_TRACK_REQUESTER_ID) {
				userId = requesterId;
			}
		}

		await Promise.all([
			container.db.guild.upsert({
				where: { id: guildId },
				create: { id: guildId },
				update: {}
			}),
			userId
				? container.db.user.upsert({
						where: { id: userId },
						create: { id: userId },
						update: {}
					})
				: Promise.resolve()
		]);

		await container.db.guildTrackHistory.create({
			data: {
				guildId,
				trackId: data.id,
				userId
			}
		});
	}
}
