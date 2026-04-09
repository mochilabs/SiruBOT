import { TrackList } from "@/components/track";
import { db } from "@/lib/db";
import { Suspense } from "react";
import { Heading, Text, Card, Flex } from "@radix-ui/themes";

// Prerender ignore
export const dynamic = "force-dynamic";

async function getPopularTracks(page: number = 1, pageSize: number = 10) {
	const skip = (page - 1) * pageSize;

	const [tracks, totalCount] = await Promise.all([
		db.track.findMany({
			orderBy: {
				totalPlays: 'desc'
			},
			take: pageSize,
			skip: skip
		}),
		db.track.count()
	]);
	
	return { tracks, totalCount };
}

function TrackSkeleton() {
	return (
		<div className="container mx-auto sm:px-6 py-12 relative z-10">
			<div className="mb-8 text-center sm:text-left">
				<Heading size="8" className="text-siru-text mb-2">인기 곡 순위</Heading>
				<Text size="4" className="text-siru-text/60">재생 횟수 기준으로 정렬된 인기 곡들을 확인해보세요</Text>
			</div>
			
			<Card className="bg-siru-panel border-0 rounded-[1.5rem] p-6 sm:p-8">
				<div className="space-y-4">
					{Array.from({ length: 10 }).map((_, i) => (
						<div key={i} className="flex items-center space-x-4 p-4">
							<div className="w-8 h-8 bg-siru-base rounded-md animate-pulse"></div>
							<div className="w-14 h-14 bg-siru-base rounded-xl animate-pulse"></div>
							<div className="flex-1 space-y-3 pl-2">
								<div className="h-4 bg-siru-base rounded-md w-3/4 animate-pulse"></div>
								<div className="h-3 bg-siru-base rounded-md w-1/3 animate-pulse"></div>
							</div>
							<div className="w-16 h-5 bg-siru-base rounded-md animate-pulse"></div>
						</div>
					))}
				</div>
			</Card>
		</div>
	);
}

async function TrackContent({ page }: { page: number }) {
	const pageSize = 10;
	const { tracks, totalCount } = await getPopularTracks(page, pageSize);
	const totalPages = Math.ceil(totalCount / pageSize) || 1;

	return (
		<div className="container mx-auto sm:px-6 py-12 relative z-10">
			<div className="mb-8 text-center sm:text-left">
				<Heading size="8" className="text-siru-text mb-2 tracking-tight">인기 곡 순위 🏆</Heading>
				<Text size="4" className="text-siru-text/70">서버에서 가장 많이 재생된 곡들을 확인해보세요.</Text>
			</div>

			{tracks.length > 0 ? (
				<Card className="bg-siru-panel border-0 rounded-[1.5rem] shadow-lg p-4 sm:p-8">
					<TrackList tracks={tracks} currentPage={page} pageSize={pageSize} totalPages={totalPages} />
				</Card>
			) : (
				<Card className="bg-siru-panel border-0 rounded-[1.5rem] p-12 text-center">
					<Flex direction="column" align="center" gap="4">
						<span className="text-6xl mb-2 opacity-80">🎵</span>
						<Heading size="5" className="text-siru-text">아직 재생된 곡이 없어요</Heading>
						<Text className="text-siru-text/60">봇에서 음악을 재생하면 여기에 표시됩니다</Text>
					</Flex>
				</Card>
			)}
		</div>
	);
}

export default async function TrackPage(props: { searchParams: Promise<{ page?: string }> }) {
	const searchParams = await props.searchParams;
	const page = parseInt(searchParams?.page || '1', 10) || 1;

	return (
		<div className="min-h-screen bg-siru-bg relative">
			{/* Watermark effect */}
			<div className="absolute top-0 right-0 w-full h-full opacity-[0.03] pointer-events-none flex justify-end items-end overflow-hidden">
				<div className="w-[800px] h-[800px] bg-siru-primary rounded-full blur-[120px] transform translate-y-1/2 translate-x-1/4"></div>
			</div>

			<Suspense fallback={<TrackSkeleton />} key={page}>
				<TrackContent page={page} />
			</Suspense>
		</div>
	);
}