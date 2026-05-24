import { container } from '@sapphire/framework';
import { Track } from 'lavalink-client';

export class PlaylistService {
	public async createPlaylist(userId: string, name: string, description?: string) {
		const existing = await container.db.playlist.count({
			where: { userId, name }
		});

		if (existing > 0) {
			throw new Error('이미 같은 이름의 플레이리스트가 존재해요.');
		}

		return await container.db.playlist.create({
			data: {
				userId,
				name,
				description
			}
		});
	}

	public async deletePlaylist(userId: string, name: string) {
		const playlist = await this.getPlaylistByName(userId, name);
		if (!playlist) {
			throw new Error('플레이리스트를 찾을 수 없어요.');
		}

		await container.db.playlist.delete({
			where: { id: playlist.id }
		});
	}

	public async addTrack(userId: string, playlistName: string, track: Track) {
		const playlist = await this.getPlaylistByName(userId, playlistName);
		if (!playlist) {
			throw new Error('플레이리스트를 찾을 수 없어요.');
		}

		const data = this.extractTrackData(track);
		
		// 1. Ensure Track exists
		await container.db.track.upsert({
			where: { id: data.id },
			create: { ...data },
			update: {}
		});

		// 2. Get current max position
		const maxPositionResult = await container.db.playlistTrack.aggregate({
			where: { playlistId: playlist.id },
			_max: { position: true }
		});
		
		const nextPosition = (maxPositionResult._max.position ?? -1) + 1;

		// 3. Add to PlaylistTrack
		await container.db.playlistTrack.create({
			data: {
				playlistId: playlist.id,
				trackId: data.id,
				position: nextPosition
			}
		});

		return { playlist, track: data };
	}

	public async removeTrack(userId: string, playlistName: string, position: number) {
		const playlist = await this.getPlaylistByName(userId, playlistName);
		if (!playlist) {
			throw new Error('플레이리스트를 찾을 수 없어요.');
		}

		const track = await container.db.playlistTrack.findUnique({
			where: {
				playlistId_position: {
					playlistId: playlist.id,
					position
				}
			}
		});

		if (!track) {
			throw new Error('해당 위치에 곡이 없어요.');
		}

		await container.db.playlistTrack.delete({
			where: { id: track.id }
		});

		// 재정렬(Re-order)은 일단 생략하거나 나중에 필요시 추가
	}

	public async getUserPlaylists(userId: string) {
		return await container.db.playlist.findMany({
			where: { userId },
			include: {
				_count: {
					select: { tracks: true }
				}
			},
			orderBy: { createdAt: 'desc' }
		});
	}

	public async getPlaylistTracks(userId: string, name: string) {
		const playlist = await this.getPlaylistByName(userId, name);
		if (!playlist) {
			throw new Error('플레이리스트를 찾을 수 없어요.');
		}

		const tracks = await container.db.playlistTrack.findMany({
			where: { playlistId: playlist.id },
			include: { track: true },
			orderBy: { position: 'asc' }
		});

		return { playlist, tracks };
	}

	private async getPlaylistByName(userId: string, name: string) {
		return await container.db.playlist.findFirst({
			where: { userId, name }
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
