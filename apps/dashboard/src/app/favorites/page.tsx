import { redirect } from "next/navigation";
import { Heart } from "lucide-react";

import Container from "@/components/container";
import { InteractiveGlow } from "@/components/interactive-glow";
import { TrackList } from "@/components/track";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getFavorites(userId: string) {
	const userFavorites = await db.userFavorite.findMany({
		where: { userId },
		include: { track: true },
		orderBy: { createdAt: "desc" },
	});

	return userFavorites.map((entry) => entry.track);
}

export default async function FavoritesPage() {
	const session = await auth();

	if (!session?.user?.id) {
		redirect("/api/auth/signin?callbackUrl=/favorites");
	}

	const tracks = await getFavorites(session.user.id);

	return (
		<Container>
			<InteractiveGlow />
			
			<div className="mx-auto w-full max-w-6xl px-6 relative z-10">
				<header className="mb-12 space-y-6">
					<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold animate-pulse">
						<Heart size={16} />
						<span>MY FAVORITES</span>
					</div>
					
					<div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
						<div className="space-y-4">
							<h1 className="text-4xl md:text-5xl font-black tracking-tighter text-title-gradient leading-[0.9]">
								즐겨찾는 노래들
							</h1>
							<p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
								즐겨찾기한 노래들을 <br className="hidden md:block"/> 
								이곳에서 한눈에 모아보고 재생하세요.
							</p>
						</div>
						
						<div className="glass-panel px-6 py-4 flex flex-col items-center border-primary/20">
							<span className="text-[12px] font-black text-primary/60 tracking-widest uppercase">Saved Tracks</span>
							<span className="text-3xl font-black text-foreground">{tracks.length}</span>
						</div>
					</div>
				</header>

				<section className="space-y-6">
					{tracks.length === 0 ? (
						<div className="glass-panel p-20 text-center border-dashed border-border/50 shadow-xl">
							<p className="text-xl font-medium text-muted-foreground">즐겨찾는 노래를 추가해보세요!</p>
						</div>
					) : (
						<TrackList tracks={tracks} />
					)}
				</section>
			</div>
		</Container>
	);
}
