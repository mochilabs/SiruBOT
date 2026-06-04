export interface Playlist {
	id: string;
	name: string;
	description: string | null;
	isPublic: boolean;
	createdAt: string;
	_count?: {
		tracks: number;
	};
}

export interface Track {
	id: string;
	title: string;
	artist: string;
	duration: number;
	thumbnail: string | null;
	url: string;
	source: string;
	playlistTrackId: string;
	position: number;
	addedAt: string;
}

export interface PlaylistDetailResponse {
	playlist: Playlist;
	tracks: Track[];
}

export interface SearchedTrack {
	id: string;
	title: string;
	artist: string;
	duration: number;
	thumbnail: string | null;
	url: string;
	source: string;
}

export interface SearchTracksResponse {
	tracks: SearchedTrack[];
}
