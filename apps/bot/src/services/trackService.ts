import { container } from '@sapphire/framework';
import { Track } from 'lavalink-client';

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
		const data = this.extractTrackData(track);
		let userId: string | null = null;
		if (track.requester) {
			const requesterId = (track.requester as any).id;
			if (requesterId && requesterId !== 'related_track') {
				userId = requesterId;
			}
		}

		await container.db.guildTrackHistory.create({
			data: {
				guildId,
				trackId: data.id,
				userId
			}
		});
	}

	private extractTrackData(track: Track) {
		const info = track.info;
		const id: string = info.identifier;
		const title: string = info.title ?? 'Unknown Title';
		const artist: string = info.author ?? 'Unknown Artist';
		const duration: number = info.duration ?? 0;
		const url: string = info.uri ?? '';
		const source: string = info.sourceName ?? 'unknown';
		const thumbnail: string | null = info.artworkUrl ?? (source === 'youtube' && id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null);

		return { id, title, artist, duration, url, source, thumbnail };
	}
}
