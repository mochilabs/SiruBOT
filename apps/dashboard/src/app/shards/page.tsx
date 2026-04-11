import { AlertTriangle, RadioTower } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import Container from "@/components/container";
import { ProcessCard } from "@/components/process-card";
import { ShardStats } from "@/components/shard-stats";
import { fetchShards } from "@/lib/shard-api";

export const dynamic = "force-dynamic";

export default async function ShardsPage() {
	const data = await fetchShards();

	if (!data) {
		return (
			<main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8 pt-32 pb-20">
				<section className="glass-panel p-12 text-center max-w-xl mx-auto border-red-500/20">
					<div className="mx-auto mb-6 inline-flex rounded-2xl bg-red-500/10 p-4 border border-red-500/20">
						<AlertTriangle className="h-8 w-8 text-red-400" />
					</div>
					<h1 className="text-3xl font-black tracking-tighter text-foreground mb-4">앗, 연결에 실패했어요</h1>
					<p className="text-lg font-medium text-muted-foreground leading-relaxed">
						샤드 매니저에 연결할 수 없어요. <br />
						잠시만 
					</p>
				</section>
			</main>
		);
	}

	const { processes, stats } = data;

	return (
		<Container>
				<header className="mb-6 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
					<div className="space-y-6">
						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold animate-pulse">
							<RadioTower size={16} />
							<span>실시간</span>
						</div>
						
						<h1 className="text-4xl md:text-5xl font-black tracking-tighter text-title-gradient leading-[0.9]">
							시스템 상태
						</h1>
						<p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
							시루봇의 상태를 확인해요.
						</p>
					</div>
					<AutoRefresh intervalMs={11000} />
				</header>

				<section className="space-y-12">
					<ShardStats stats={stats} />

					<div className="space-y-6">
						<div className="flex items-center gap-4">
							<div className="h-px flex-1 bg-border" />
							<h2 className="text-2xl font-black tracking-tighter text-foreground/80">프로세스 목록</h2>
							<div className="h-px flex-1 bg-border" />
						</div>

						{processes.length === 0 ? (
							<div className="glass-panel p-20 text-center border-dashed border-border/50">
								<p className="text-xl font-medium text-muted-foreground">지금은 활성화된 프로세스가 없어요.</p>
							</div>
						) : (
							<div className="grid gap-6 md:grid-cols-2">
								{processes.map((process, index) => (
									<ProcessCard key={process.wsId} process={process} index={index} />
								))}
							</div>
						)}
					</div>
				</section>
		</Container>
	);
}

