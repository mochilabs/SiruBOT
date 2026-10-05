import { container } from '@sapphire/framework';
import { getZodiacFromDate } from '../../games/utils/ohaasaService.ts';
import { getUserProfile } from './userProfile.ts';

export interface ProfileRecentTrack {
	title: string;
	artist: string;
	playedAt: Date;
}

export interface ProfileTopTrack {
	title: string;
	artist: string;
	count: number;
}

/**
 * 프로필 카드 데이터. 텍스트/Components V2/이미지 렌더가 공유해요.
 * - 생일(월/일)은 본인 조회 때만 채워요. 타인에게는 null + 별자리 코드만.
 * - 음악 집계는 길드 안이면 해당 길드 기준, DM이면 전체 기준이에요.
 */
export interface ProfileCardData {
	isSelf: boolean;
	inGuild: boolean;
	/** 본인일 때만 값 있음. 타인은 null */
	birthMonth: number | null;
	/** 본인일 때만 값 있음. 타인은 null */
	birthDay: number | null;
	zodiacCode: string | null;
	playlistCount: number;
	requestedCount: number;
	listenMs: number;
	/** 신청 곡이 샘플 상한을 넘어서 청취 시간이 일부 기준이면 true */
	listenSampled: boolean;
	recentTracks: ProfileRecentTrack[];
	topTracks: ProfileTopTrack[];
}

const LISTEN_SAMPLE_LIMIT = 500;

export async function buildProfileCardData(targetUserId: string, viewerUserId: string, guildId: string | null): Promise<ProfileCardData> {
	const isSelf = targetUserId === viewerUserId;
	const profile = await getUserProfile(targetUserId);
	const birthMonth = profile?.birthMonth ?? null;
	const birthDay = profile?.birthDay ?? null;
	const zodiacCode = birthMonth != null && birthDay != null ? getZodiacFromDate(birthMonth, birthDay) : null;

	const historyWhere = { userId: targetUserId, ...(guildId ? { guildId } : {}) };

	const [playlistCount, requestedCount, sample, topGroups] = await Promise.all([
		container.db.playlist.count({ where: { userId: targetUserId } }),
		container.db.guildTrackHistory.count({ where: historyWhere }),
		container.db.guildTrackHistory.findMany({
			where: historyWhere,
			orderBy: { createdAt: 'desc' },
			take: LISTEN_SAMPLE_LIMIT,
			include: { track: { select: { title: true, artist: true, duration: true } } }
		}),
		container.db.guildTrackHistory.groupBy({
			by: ['trackId'],
			where: historyWhere,
			_count: { trackId: true },
			orderBy: { _count: { trackId: 'desc' } },
			take: 5
		})
	]);

	const listenMs = sample.reduce((acc, h) => acc + (h.track?.duration ?? 0), 0);
	const recentTracks: ProfileRecentTrack[] = sample.slice(0, 5).map((h) => ({
		title: h.track.title,
		artist: h.track.artist,
		playedAt: h.createdAt
	}));

	let topTracks: ProfileTopTrack[] = [];
	if (topGroups.length > 0) {
		const tracks = await container.db.track.findMany({
			where: { id: { in: topGroups.map((g) => g.trackId) } },
			select: { id: true, title: true, artist: true }
		});
		const meta = new Map(tracks.map((t) => [t.id, t]));
		topTracks = topGroups.map((g) => ({
			title: meta.get(g.trackId)?.title ?? '알 수 없음',
			artist: meta.get(g.trackId)?.artist ?? '',
			count: g._count.trackId
		}));
	}

	return {
		isSelf,
		inGuild: guildId != null,
		birthMonth: isSelf ? birthMonth : null,
		birthDay: isSelf ? birthDay : null,
		zodiacCode,
		playlistCount,
		requestedCount,
		listenMs,
		listenSampled: requestedCount > sample.length,
		recentTracks,
		topTracks
	};
}
