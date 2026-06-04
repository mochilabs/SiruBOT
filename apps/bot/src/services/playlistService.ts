import { container } from '@sapphire/framework';
import { Track } from 'lavalink-client';
import { extractTrackData } from './trackData.ts';

const FAVORITES_PLAYLIST_NAME = '즐겨찾기';

export class PlaylistService {
	public async getOrCreateFavoritesPlaylist(userId: string) {
		// Ensure user exists
		await container.db.user.upsert({
			where: { id: userId },
			create: { id: userId },
			update: {}
		});

		const playlist = await container.db.playlist.findFirst({
			where: { userId, name: '즐겨찾기' }
		});

		if (playlist) {
			return playlist;
		}

		return await container.db.playlist.create({
			data: {
				userId,
				name: FAVORITES_PLAYLIST_NAME,
				description: '즐겨찾기한 음악 목록입니다.'
			}
		});
	}

	public async createPlaylist(userId: string, name: string, description?: string) {
		if (name === FAVORITES_PLAYLIST_NAME) {
			throw new Error('이름으로 "즐겨찾기"는 사용할 수 없어요. 이는 기본 제공되는 플레이리스트입니다.');
		}

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
		if (name === FAVORITES_PLAYLIST_NAME) {
			throw new Error('기본 플레이리스트인 "즐겨찾기"는 삭제할 수 없어요.');
		}

		const playlist = await this.getPlaylistByName(userId, name);
		if (!playlist) {
			throw new Error('플레이리스트를 찾을 수 없어요.');
		}

		await container.db.playlist.delete({
			where: { id: playlist.id }
		});
	}

	public async addTrack(userId: string, playlistName: string, track: Track) {
		let playlist = await this.getPlaylistByName(userId, playlistName);
		if (!playlist) {
			if (playlistName === FAVORITES_PLAYLIST_NAME) {
				playlist = await this.getOrCreateFavoritesPlaylist(userId);
			} else {
				throw new Error('플레이리스트를 찾을 수 없어요.');
			}
		}

		const data = this.extractTrackData(track);

		if (playlist.name === FAVORITES_PLAYLIST_NAME) {
			const existingTrack = await container.db.playlistTrack.count({
				where: {
					playlistId: playlist.id,
					trackId: data.id
				}
			});

			if (existingTrack > 0) {
				throw new Error('이미 즐겨찾기에 추가된 곡이에요.');
			}
		}

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

	private extractTrackData = extractTrackData;
}
