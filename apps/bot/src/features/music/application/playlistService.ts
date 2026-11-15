import type { PrismaClient } from '@sirubot/prisma';
import { Track } from 'lavalink-client';
import { extractTrackData } from './trackData.ts';

const FAVORITES_PLAYLIST_NAME = '즐겨찾기';

/** PlaylistService가 쓰는 의존성 — DB 접근만 받아요 */
export interface PlaylistServiceDeps {
	db: PrismaClient;
}

export class PlaylistService {
	constructor(private readonly deps: PlaylistServiceDeps) {}

	public async getOrCreateFavoritesPlaylist(userId: string) {
		await this.deps.db.user.upsert({
			where: { id: userId },
			create: { id: userId },
			update: {}
		});

		const playlist = await this.deps.db.playlist.findFirst({
			where: { userId, name: '즐겨찾기' }
		});

		if (playlist) {
			return playlist;
		}

		return await this.deps.db.playlist.create({
			data: {
				userId,
				name: FAVORITES_PLAYLIST_NAME,
				description: '즐겨찾기한 음악 목록이에요.'
			}
		});
	}

	public async createPlaylist(userId: string, name: string, description?: string) {
		name = name.trim();
		if (!name || name.length > 80) throw new Error('플레이리스트 이름은 1~80자로 입력해 주세요.');
		await this.deps.db.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
		if (name === FAVORITES_PLAYLIST_NAME) {
			throw new Error('이름으로 "즐겨찾기"는 사용할 수 없어요. 이건 기본 제공되는 플레이리스트예요.');
		}

		const existing = await this.deps.db.playlist.count({
			where: { userId, name }
		});

		if (existing > 0) {
			throw new Error('이미 같은 이름의 플레이리스트가 존재해요.');
		}

		return await this.deps.db.playlist.create({
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

		await this.deps.db.playlist.delete({
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

		const data = extractTrackData(track);

		if (playlist.name === FAVORITES_PLAYLIST_NAME) {
			const existingTrack = await this.deps.db.playlistTrack.count({
				where: {
					playlistId: playlist.id,
					trackId: data.id
				}
			});

			if (existingTrack > 0) {
				throw new Error('이미 즐겨찾기에 추가된 곡이에요.');
			}
		}

		await this.deps.db.track.upsert({
			where: { id: data.id },
			create: { ...data },
			update: {}
		});

		// max(position)+1 조회와 생성을 한 트랜잭션으로 묶어 동시 추가 시 unique 충돌 방지
		await this.deps.db.$transaction(async (tx) => {
			const maxPositionResult = await tx.playlistTrack.aggregate({
				where: { playlistId: playlist.id },
				_max: { position: true }
			});

			const nextPosition = (maxPositionResult._max.position ?? -1) + 1;

			return await tx.playlistTrack.create({
				data: {
					playlistId: playlist.id,
					trackId: data.id,
					position: nextPosition
				}
			});
		});

		return { playlist, track: data };
	}

	public async removeTrack(userId: string, playlistName: string, position: number) {
		const playlist = await this.getPlaylistByName(userId, playlistName);
		if (!playlist) {
			throw new Error('플레이리스트를 찾을 수 없어요.');
		}

		const track = await this.deps.db.playlistTrack.findUnique({
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

		await this.deps.db.playlistTrack.delete({
			where: { id: track.id }
		});
	}

	public async getUserPlaylists(userId: string) {
		return await this.deps.db.playlist.findMany({
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

		const tracks = await this.deps.db.playlistTrack.findMany({
			where: { playlistId: playlist.id },
			include: { track: true },
			orderBy: { position: 'asc' }
		});

		return { playlist, tracks };
	}

	private async getPlaylistByName(userId: string, name: string) {
		return await this.deps.db.playlist.findFirst({
			where: { userId, name }
		});
	}
}
