import { db } from "@/lib/db";
import {
	FAVORITES_PLAYLIST_DESCRIPTION,
	FAVORITES_PLAYLIST_NAME,
} from "@/lib/playlist-constants";

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