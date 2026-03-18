import { TrackList } from "@/components/track";
import { db } from "@/lib/db";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// Prerender ignore
export const dynamic = "force-dynamic";

async function getFavorites(userId: string) {
	const userFavorites = await db.userFavorite.findMany({
		where: {
			userId: userId
		},
		include: {
			track: true
		},
		orderBy: {
			createdAt: 'desc'
		}
	});
	
	return userFavorites.map(uf => uf.track);
}

function FavoritesSkeleton() {
	return (
		<div className="container mx-auto sm:px-6 py-6">
			<div className="mb-4 sm:px-2 pl-8">
				<h1 className="text-3xl font-bold text-gray-900 mb-2">내 즐겨찾기</h1>
				<p className="text-gray-600">내가 좋아하는 곡들을 확인해보세요</p>
			</div>
			
			<div className="sm:bg-white sm:rounded-lg sm:shadow-sm sm:border border-gray-200 sm:p-6">
				<div className="space-y-4">
					{Array.from({ length: 10 }).map((_, i) => (
						<div key={i} className="flex items-center space-x-4 p-4">
							<div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
							<div className="flex-1 space-y-2">
								<div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
								<div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
							</div>
							<div className="w-16 h-4 bg-gray-200 rounded animate-pulse"></div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

async function FavoritesContent() {
    const session = await auth();
    
    if (!session || !session.user || !session.user.id) {
        redirect("/api/auth/signin?callbackUrl=/favorites");
    }

	const tracks = await getFavorites(session.user.id);

	return (
		<div className="container mx-auto sm:px-6 py-6">
			<div className="mb-4 sm:px-2 pl-8">
				<h1 className="text-3xl font-bold text-gray-900 mb-2">내 즐겨찾기</h1>
				<p className="text-gray-600">내가 좋아하는 곡들을 확인해보세요</p>
			</div>

			{tracks.length > 0 ? (
				<div className="sm:bg-white sm:rounded-lg sm:shadow-sm sm:border border-gray-200 sm:p-6">
					<TrackList tracks={tracks} />
				</div>
			) : (
				<div className="bg-white rounded-lg shadow-sm border border-gray-200 sm:p-12 text-center">
					<span className="text-6xl mb-4 block">⭐</span>
					<h2 className="text-xl font-medium text-gray-900 mb-2">아직 즐겨찾기한 곡이 없어요</h2>
					<p className="text-gray-500">봇에서 음악을 즐겨찾기하면 여기에 표시됩니다</p>
				</div>
			)}
		</div>
	);
}

export default async function FavoritesPage() {
	return (
		<Suspense fallback={<FavoritesSkeleton />}>
			<FavoritesContent />
		</Suspense>
	);
}
