import { container } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { getZodiacFromDate } from '../../../games/index.ts';
import { getUserProfile } from './userProfile.ts';

interface ProfileRecentTrack {
	title: string;
	artist: string;
	playedAt: Date;
}

interface ProfileTopTrack {
	title: string;
	artist: string;
	count: number;
	artworkUrl?: string | null;
}

interface ProfileGameStats {
	rpsWins: number;
	rpsLosses: number;
	rpsDraws: number;
	rpsBestStreak: number;
	guessBest: number | null;
}

interface ProfileCardData {
	isSelf: boolean;
	inGuild: boolean;
	birthMonth: number | null;
	birthDay: number | null;
	zodiacCode: string | null;
	intro: string;
	playlistCount: number;
	requestedCount: number;
	listenMs: number;
	listenSampled: boolean;
	recentTracks: ProfileRecentTrack[];
	topTracks: ProfileTopTrack[];
	gameStats: ProfileGameStats;
	checkinStreak: number;
}

const LISTEN_SAMPLE_LIMIT = 500;

export async function buildProfileCardData(targetUserId: string, viewerUserId: string, guildId: string | null): Promise<ProfileCardData> {
	const isSelf = targetUserId === viewerUserId;
	const profile = await getUserProfile(targetUserId);
	const birthMonth = profile?.birthMonth ?? null;
	const birthDay = profile?.birthDay ?? null;
	const zodiacCode = birthMonth != null && birthDay != null ? getZodiacFromDate(birthMonth, birthDay) : null;

	const historyWhere = { userId: targetUserId, ...(guildId ? { guildId } : {}) };

	const [playlistCount, requestedCount, sample, topGroups, rpsStats, guessBest, checkinState] = await Promise.all([
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
		}),
		container.gameRecords.getRpsStats(targetUserId),
		container.gameRecords.getGuessBest(targetUserId),
		container.gameRecords.getCheckinState(targetUserId)
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
			select: { id: true, title: true, artist: true, thumbnail: true }
		});
		const meta = new Map(tracks.map((t) => [t.id, t]));
		topTracks = topGroups.map((g) => ({
			title: meta.get(g.trackId)?.title ?? '알 수 없음',
			artist: meta.get(g.trackId)?.artist ?? '',
			count: g._count.trackId,
			artworkUrl: meta.get(g.trackId)?.thumbnail ?? null
		}));
	}

	return {
		isSelf,
		inGuild: guildId != null,
		birthMonth: isSelf ? birthMonth : null,
		birthDay: isSelf ? birthDay : null,
		zodiacCode,
		intro: profile?.intro ?? '',
		playlistCount,
		requestedCount,
		listenMs,
		listenSampled: requestedCount > sample.length,
		recentTracks,
		topTracks,
		gameStats: {
			rpsWins: rpsStats.wins,
			rpsLosses: rpsStats.losses,
			rpsDraws: rpsStats.draws,
			rpsBestStreak: rpsStats.best,
			guessBest
		},
		checkinStreak: checkinState.streak
	};
}

export function formatGameStatsLines(gameStats: ProfileGameStats): string[] | null {
	const { rpsWins, rpsLosses, rpsDraws, rpsBestStreak, guessBest } = gameStats;
	const hasRps = rpsWins + rpsLosses + rpsDraws > 0;
	if (!hasRps && guessBest == null) return null;

	const lines = [`${emoji('gamepad')} **게임 전적**`];
	if (hasRps) {
		const best = rpsBestStreak >= 2 ? ` (최고 ${rpsBestStreak}연승)` : '';
		lines.push(`${emoji('fist')} 가위바위보 **${rpsWins}승 ${rpsLosses}패 ${rpsDraws}무**${best}`);
	}
	if (guessBest != null) lines.push(`${emoji('dice')} 숫자맞히기 최고 **${guessBest}번** 만에 성공`);
	return lines;
}
