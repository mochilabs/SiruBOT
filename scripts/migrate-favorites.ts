import { PrismaClient } from '@sirubot/prisma';

async function main() {
	console.log('🔄 즐겨찾기(UserFavorite) -> 플레이리스트(Playlist) 데이터 마이그레이션을 시작합니다...');

	// @sirubot/prisma를 통해 생성된 클라이언트를 인스턴스화합니다.
	const db = new PrismaClient();

	try {
		// 1. 기존 데이터베이스에 "UserFavorite" 테이블이 남아있는지 확인하고 데이터를 조회합니다.
		// 스키마가 갱신되어 userFavorite이 PrismaClient 타입에서 지워졌을 수 있으므로 raw query를 통해 직접 조회합니다.
		console.log('📋 기존 즐겨찾기 데이터를 조회 중...');
		const rawFavorites: Array<{ userId: string; trackId: string; createdAt: Date }> = await db.$queryRaw`
			SELECT "userId", "trackId", "createdAt" FROM "UserFavorite" ORDER BY "createdAt" ASC
		`;

		if (rawFavorites.length === 0) {
			console.log('ℹ️ 이관할 즐겨찾기 데이터가 없습니다. 작업을 종료합니다.');
			return;
		}

		console.log(`💡 총 ${rawFavorites.length}개의 즐겨찾기 데이터를 발견했습니다.`);

		// 2. 유저별로 그룹화합니다.
		const userFavoritesMap = new Map<string, typeof rawFavorites>();
		for (const fav of rawFavorites) {
			if (!userFavoritesMap.has(fav.userId)) {
				userFavoritesMap.set(fav.userId, []);
			}
			userFavoritesMap.get(fav.userId)!.push(fav);
		}

		console.log(`👤 총 ${userFavoritesMap.size}명의 유저 데이터를 이관합니다.`);

		let totalTracksMigrated = 0;

		for (const [userId, favs] of userFavoritesMap.entries()) {
			console.log(`👤 유저 ID: ${userId}의 이관 작업을 진행합니다...`);

			// 2-1. 유저 정보가 User 테이블에 실제로 존재하는지 보장 (Foreign Key 제한 때문)
			await db.user.upsert({
				where: { id: userId },
				create: { id: userId },
				update: {}
			});

			// 2-2. 유저에게 "즐겨찾기"라는 이름의 플레이리스트가 이미 있는지 조회합니다.
			let playlist = await db.playlist.findFirst({
				where: { userId, name: '즐겨찾기' }
			});

			if (!playlist) {
				console.log(`➕ 유저 ${userId}의 "즐겨찾기" 플레이리스트를 생성합니다.`);
				playlist = await db.playlist.create({
					data: {
						userId,
						name: '즐겨찾기',
						description: '즐겨찾기한 음악 목록입니다.'
					}
				});
			}

			// 2-3. 이미 해당 플레이리스트에 담겨있는 트랙 목록을 가져와 중복 삽입을 방지합니다.
			const existingTracks = await db.playlistTrack.findMany({
				where: { playlistId: playlist.id },
				select: { trackId: true }
			});
			const existingTrackIds = new Set(existingTracks.map(t => t.trackId));

			// 2-4. 현재 플레이리스트의 최대 position 값을 구합니다.
			const maxPositionResult = await db.playlistTrack.aggregate({
				where: { playlistId: playlist.id },
				_max: { position: true }
			});
			let currentPosition = (maxPositionResult._max.position ?? -1) + 1;

			// 2-5. 각 즐겨찾기 트랙을 플레이리스트에 매핑
			for (const fav of favs) {
				if (existingTrackIds.has(fav.trackId)) {
					console.log(`  ⚠️ 트랙 ${fav.trackId}는 이미 "즐겨찾기" 플레이리스트에 존재하여 스킵합니다.`);
					continue;
				}

				// 트랙이 Track 테이블에 존재하는지 안전 검사 (원래 존재해야 하지만 무결성을 위해 확인)
				const trackExists = await db.track.count({
					where: { id: fav.trackId }
				});

				if (trackExists === 0) {
					console.log(`  ❌ 트랙 ${fav.trackId}가 Track 테이블에 존재하지 않아 이관할 수 없습니다. 스킵합니다.`);
					continue;
				}

				// 플레이리스트 트랙 추가
				await db.playlistTrack.create({
					data: {
						playlistId: playlist.id,
						trackId: fav.trackId,
						position: currentPosition++,
						addedAt: fav.createdAt
					}
				});

				totalTracksMigrated++;
			}
		}

		console.log(`🎉 성공적으로 데이터 이관을 완료했습니다! 총 ${totalTracksMigrated}개의 트랙이 플레이리스트로 이동되었습니다.`);
	} catch (error) {
		console.error('❌ 마이그레이션 중 오류가 발생했습니다:', error);
	} finally {
		await db.$disconnect();
	}
}

main();
