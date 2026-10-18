import { container } from '@sapphire/framework';
import { Track } from 'lavalink-client';
import { extractTrackData } from './trackData.ts';
import { isTtsClip, RELATED_TRACK_REQUESTER_ID } from '../modules/audio/lavalink/requester.ts';

export class TrackService {
	public async increasePlays(track: Track) {
		const data = this.extractTrackData(track);

		const newTrack = await container.db.track.upsert({
			where: { id: data.id },
			create: {
				...data,
				totalPlays: 1
			},
			update: {
				totalPlays: { increment: 1 }
			}
		});

		return newTrack;
	}

	public async addHistory(guildId: string, track: Track) {
		// 채팅 TTS 클립은 재생 히스토리 대상이 아니다 (명세 4.2 단독 클립 규칙).
		if (isTtsClip(track)) return;
		const data = this.extractTrackData(track);
		let userId: string | null = null;
		if (track.requester) {
			const requesterId = (track.requester as { id: string } | undefined)?.id;
			if (requesterId && requesterId !== RELATED_TRACK_REQUESTER_ID) {
				userId = requesterId;
			}
		}

		if (userId) {
			await container.db.user.upsert({
				where: { id: userId },
				create: { id: userId },
				update: {}
			});
		}

		await container.db.guildTrackHistory.create({
			data: {
				guildId,
				trackId: data.id,
				userId
			}
		});
	}

	private extractTrackData = extractTrackData;
}
