import { db } from "@/lib/db";
import {
	FAVORITES_PLAYLIST_DESCRIPTION,
	FAVORITES_PLAYLIST_NAME,
} from "@/lib/playlist-constants";

/**
 * 유저 레코드와 기본 "즐겨찾기" 플레이리스트가 있도록 보장해요 — favorites·playlists
 * 라우트가 공유하는 자동 생성 흐름이에요. 이미 있으면 조회만 돌려주고, 없으면 한
 * 트랜잭션에서 유저 upsert + 즐겨찾기 생성을 해요.
 */
export async function ensureUserAndFavorites(userId: string) {
	const existing = await db.playlist.findFirst({
		where: { userId, name: FAVORITES_PLAYLIST_NAME },
	});
	if (existing) return existing;

	return db.$transaction(async (tx) => {
		await tx.user.upsert({
			where: { id: userId },
			create: { id: userId },
			update: {},
		});
		return tx.playlist.create({
			data: {
				userId,
				name: FAVORITES_PLAYLIST_NAME,
				description: FAVORITES_PLAYLIST_DESCRIPTION,
			},
		});
	});
}