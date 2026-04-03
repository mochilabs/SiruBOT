import { TrackList } from "@/components/track";
import { db } from "@/lib/db";
import { Suspense } from "react";
import { Music } from "lucide-react";

export const dynamic = "force-dynamic";

async function getPopularTracks() {
	return db.track.findMany({ orderBy: { totalPlays: 'desc' }, take: 50 });
}

function TrackSkeleton() {
	return (
		<div className="space-y-8">
			<div className="space-y-2">
				<div className="skeleton h-8 w-40" />
				<div className="skeleton h-5 w-72" />
			</div>
			<div className="glass-panel p-2 sm:p-4">
				<div className="space-y-1">
					{Array.from({ length: 10 }).map((_, i) => (
						<div key={i} className="flex items-center gap-4 px-3 py-3 sm:px-4">
							<div className="skeleton h-8 w-8 shrink-0 rounded-lg" />
							<div className="skeleton h-11 w-11 shrink-0 rounded-lg" />
							<div className="flex-1 space-y-2">
								<div className="skeleton h-4 w-3/4" />
								<div className="skeleton h-3 w-1/2" />
							</div>
							<div className="skeleton h-4 w-14" />
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
		<div className="space-y-8">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">
					<span className="gradient-text">인기 곡 순위</span>
				</h1>
				<p className="text-[var(--color-text-secondary)]">재생 횟수 기준으로 정렬된 인기 곡들을 확인해보세요</p>
			</div>

			{tracks.length > 0 ? (
				<div className="glass-panel p-2 sm:p-4">
					<TrackList tracks={tracks} />
				</div>
			) : (
				<div className="glass-panel p-16 text-center">
					<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-accent-subtle)] border border-[var(--color-border)] mb-5">
						<Music size={28} className="text-[var(--color-text-muted)]" />
					</div>
					<h2 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">아직 재생된 곡이 없어요</h2>
					<p className="text-sm text-[var(--color-text-secondary)]">봇에서 음악을 재생하면 여기에 표시됩니다</p>
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
