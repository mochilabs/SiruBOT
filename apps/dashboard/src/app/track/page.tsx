import { TrackList } from "@/components/track";
import { db } from "@/lib/db";
import { Suspense } from "react";

// Prerender ignore
export const dynamic = "force-dynamic";
async function getPopularTracks() {
	const tracks = await db.track.findMany({
		orderBy: {
			totalPlays: 'desc'
		},
		take: 50 // 상위 50곡
	});
	
	return tracks;
}

function TrackSkeleton() {
	return (
		<div className="container mx-auto sm:px-6 py-6">
			<div className="mb-4 sm:px-2 pl-8">
				<h1 className="text-3xl font-bold text-gray-900 mb-2">인기 곡 순위</h1>
				<p className="text-gray-600">재생 횟수 기준으로 정렬된 인기 곡들을 확인해보세요</p>
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

async function TrackContent() {
	const tracks = await getPopularTracks();

	return (
		<div className="container mx-auto sm:px-6 py-6">
			<div className="mb-4 sm:px-2 pl-8">
				<h1 className="text-3xl font-bold text-gray-900 mb-2">인기 곡 순위</h1>
				<p className="text-gray-600">재생 횟수 기준으로 정렬된 인기 곡들을 확인해보세요</p>
			</div>

			{tracks.length > 0 ? (
				<div className="sm:bg-white sm:rounded-lg sm:shadow-sm sm:border border-gray-200 sm:p-6">
					<TrackList tracks={tracks} />
				</div>
			) : (
				<div className="bg-white rounded-lg shadow-sm border border-gray-200 sm:p-12 text-center">
					<span className="text-6xl mb-4 block">🎵</span>
					<h2 className="text-xl font-medium text-gray-900 mb-2">아직 재생된 곡이 없어요</h2>
					<p className="text-gray-500">봇에서 음악을 재생하면 여기에 표시됩니다</p>
				</div>
			)}
		</div>
	);
}

export default async function TrackPage() {
	return (
		<Suspense fallback={<TrackSkeleton />}>
			<TrackContent />
		</Suspense>
	);
}
