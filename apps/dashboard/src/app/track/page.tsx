import { InfiniteTrackList } from "@/components/infinite-track-list";
import { db } from "@/lib/db";
import { Disc3, HelpCircle } from "lucide-react";
import { InteractiveGlow } from "@/components/interactive-glow";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const fixedTrackFilter = {
	duration: {
		gt: 60 * 1000,	
		lt: 60 * 1000 * 60
	},
	totalPlays: {
		gt: 10
	}
} as const;

export default async function TrackPage() {
	const [tracks, totalCount, totalPlaybacks] = await Promise.all([
		db.track.findMany({
			orderBy: [{ totalPlays: "desc" }, { updatedAt: "desc" }],
			where: fixedTrackFilter,
			take: PAGE_SIZE,
			skip: 0,
		}),
		db.track.count({
			where: fixedTrackFilter
		}),
		db.track.aggregate({
			_sum: {
				totalPlays: true
			},
			where: fixedTrackFilter
		})
	]);

	return (
		<main className="min-h-screen pt-32 pb-20 relative overflow-hidden">
			<InteractiveGlow />
			
			<div className="mx-auto w-full max-w-6xl px-6 relative z-10">
				<header className="mb-12 space-y-6">
					<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold">
						<Disc3 size={16} />
						<span>인기 차트</span>
					</div>
					
					<div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
						<div className="space-y-4">
							<h1 className="text-4xl md:text-5xl font-black tracking-tighter text-title-gradient leading-[0.9]">
								인기 차트
							</h1>
							<p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
								시루봇 사용자들에게 가장 사랑받는 <br className="hidden md:block"/> 
								노래들을 집계합니다.
							</p>
						</div>
						
						<div className="flex gap-2">
							<div className="group relative glass-panel px-6 py-4 flex flex-col items-center border-primary/20 cursor-help">
								<div className="flex items-center gap-1.5 text-primary/60">
									<span className="text-[12px] font-black tracking-widest uppercase">단일 곡 수</span>
								</div>
								<span className="text-3xl font-black text-foreground">{totalCount.toLocaleString()}</span>
								
								{/* Tooltip */}
								<div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-3 glass-panel border-primary/30 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
									<p className="text-[11px] font-bold text-foreground leading-relaxed">
										• 1분 ~ 60분 사이의 곡<br />
										• 10회 이상 재생된 트랙
									</p>
								</div>
							</div>

							<div className="group relative glass-panel px-6 py-4 flex flex-col items-center border-primary/20 cursor-help">
								<div className="flex items-center gap-1.5 text-primary/60">
									<span className="text-[12px] font-black tracking-widest uppercase">재생한 횟수</span>
								</div>
								<span className="text-3xl font-black text-foreground">{totalPlaybacks._sum.totalPlays?.toLocaleString()}</span>

								{/* Tooltip */}
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
							<p className="text-xl font-medium text-muted-foreground">차트 데이터를 집계 중입니다...</p>
						</div>
					) : (
						<InfiniteTrackList initialTracks={tracks} rankOffset={0} />
					)}
				</section>
			</div>
		</main>
	);
}

