import { TrackList } from "@/components/track";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { db } from "@/lib/db";
import { ListMusicIcon } from "lucide-react";
import { InteractiveGlow } from "@/components/interactive-glow";
import Container from "@/components/container";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const fixedTrackFilter = {
	duration: {
		gt: 60 * 1000,	
		lt: 60 * 1000 * 60
	},
	totalPlays: {
		gt: 10
	}
} as const;

export default async function TrackPage({
	searchParams,
}: {
	searchParams: Promise<{ query?: string; page?: string }>;
}) {
	const { query, page } = await searchParams;
	const currentPage = Math.max(1, parseInt(page || "1"));

	const where = query ? {
		...fixedTrackFilter,
		OR: [
			{ title: { contains: query, mode: "insensitive" as const } },
			{ artist: { contains: query, mode: "insensitive" as const } }
		]
	} : fixedTrackFilter;

	const [tracks, totalCount, totalPlaybacks] = await Promise.all([
		db.track.findMany({
			orderBy: [{ totalPlays: "desc" }, { updatedAt: "desc" }],
			where,
			take: PAGE_SIZE,
			skip: (currentPage - 1) * PAGE_SIZE,
		}),
		db.track.count({
			where
		}),
		db.track.aggregate({
			_sum: {
				totalPlays: true
			},
			where
		})
	]);

	const totalPages = Math.ceil(totalCount / PAGE_SIZE);
	const rankOffset = (currentPage - 1) * PAGE_SIZE;

	return (
		<Container>
			<InteractiveGlow />
			
			<div className="mx-auto w-full max-w-6xl px-6 relative z-10">
				<header className="mb-6 space-y-6">
					<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold">
						<ListMusicIcon size={16} />
						<span>{query ? `'${query}' 검색 결과` : "전체 재생 목록"}</span>
					</div>
					
					<div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
						<div className="space-y-4">
							<h1 className="text-4xl md:text-5xl font-black tracking-tighter text-title-gradient leading-[0.9]">
								{query ? '검색 결과' : '재생 순위'}
							</h1>
							<p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
								{query ? (
									<>시루봇이 재생한 적 있는 노래의<br /> 검색 결과를 보여드려요.</>
								) : (
									<>시루봇 사용자들에게 가장 사랑받는 <br className="hidden md:block"/> 노래들을 집계합니다.</>
								)}
							</p>
						</div>
					</div>

					<div className="max-w-full flex flex-col gap-4 md:grid md:grid-cols-2 md:items-center">
						<SearchInput />
						<div className="flex gap-2 justify-start md:justify-end">
							<div className="group relative glass-panel h-14 px-5 flex flex-col justify-center items-center border-primary/20 cursor-help flex-1 md:flex-none md:min-w-[120px]">
								<div className="flex items-center gap-1.5 text-primary/60">
									<span className="text-[10px] font-black tracking-widest uppercase">
										{query ? "검색 결과 수" : "단일 곡 수"}
									</span>
								</div>
								<span className="text-xl font-black text-foreground leading-[1.1]">{totalCount.toLocaleString()}</span>
								
								<div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-3 glass-panel border-primary/30 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
									<p className="text-[11px] font-bold text-foreground leading-relaxed">
										• 1분 ~ 60분 사이의 곡<br />
										• 10회 이상 재생된 트랙
									</p>
								</div>
							</div>

							<div className="group relative glass-panel h-14 px-5 flex flex-col justify-center items-center border-primary/20 cursor-help flex-1 md:flex-none md:min-w-[120px]">
								<div className="flex items-center gap-1.5 text-primary/60">
									<span className="text-[10px] font-black tracking-widest uppercase">재생한 횟수</span>
								</div>
								<span className="text-xl font-black text-foreground leading-[1.1]">{totalPlaybacks._sum.totalPlays?.toLocaleString() || 0}</span>

								<div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-3 glass-panel border-primary/30 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
									<p className="text-[11px] font-bold text-foreground leading-relaxed">
										• 필터링된 트랙들의<br />
										• 총 누적 재생 카운트
									</p>
								</div>
							</div>
						</div>
					</div>
				</header>

				<section className="space-y-6">
					{tracks.length === 0 ? (
						<div className="glass-panel p-20 text-center border-dashed border-white/10">
							<p className="text-xl font-medium text-muted-foreground">
								{query ? "검색 결과가 없습니다." : "차트 데이터를 집계 중입니다..."}
							</p>
						</div>
					) : (
						<>
							<TrackList tracks={tracks} rankOffset={rankOffset} />
							<Pagination 
								currentPage={currentPage} 
								totalPages={totalPages} 
								basePath="/track" 
							/>
						</>
					)}
				</section>
			</div>
		</Container>
	);
}



