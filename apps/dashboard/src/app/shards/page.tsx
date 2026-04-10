import { AlertTriangle, RadioTower } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import Container from "@/components/container";
import { InteractiveGlow } from "@/components/interactive-glow";
import { ProcessCard } from "@/components/process-card";
import { ShardStats } from "@/components/shard-stats";
import { fetchShards } from "@/lib/shard-api";

export const dynamic = "force-dynamic";

export default async function ShardsPage() {
	const data = await fetchShards();

	if (!data) {
		return (
			<main className="min-h-screen pt-32 pb-20 relative overflow-hidden flex items-center justify-center">
				<section className="glass-panel p-12 text-center max-w-xl mx-auto border-red-500/20">
					<div className="mx-auto mb-6 inline-flex rounded-2xl bg-red-500/10 p-4 border border-red-500/20">
						<AlertTriangle className="h-8 w-8 text-red-400" />
					</div>
					<h1 className="text-3xl font-black tracking-tighter text-foreground mb-4">샤드 매니저 연결 실패</h1>
					<p className="text-lg font-medium text-muted-foreground leading-relaxed">
						샤드 매니저 프로세스에 연결할 수 없습니다. <br />
						네트워크 상태나 인증 설정을 다시 한번 확인해 주세요.
					</p>
				</section>
			</main>
		);
	}

	const { processes, stats } = data;

	return (
		<Container>
			<InteractiveGlow />

			<div className="mx-auto w-full max-w-6xl px-6 relative z-10">
				<header className="mb-6 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
					<div className="space-y-6">
						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold animate-pulse">
							<RadioTower size={16} />
							<span>실시간</span>
						</div>
						
						<h1 className="text-4xl md:text-5xl font-black tracking-tighter text-title-gradient leading-[0.9]">
							클러스터링 상태
						</h1>
						<p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
							분산 처리 상태를 모니터링합니다.
						</p>
					</div>
					<AutoRefresh intervalMs={11000} />
				</header>

				<section className="space-y-12">
					<ShardStats stats={stats} />

					<div className="space-y-6">
						<div className="flex items-center gap-4">
							<div className="h-px flex-1 bg-white/5" />
							<h2 className="text-2xl font-black tracking-tighter text-foreground/80">클러스터 목록</h2>
							<div className="h-px flex-1 bg-white/5" />
						</div>

						{processes.length === 0 ? (
							<div className="glass-panel p-20 text-center border-dashed border-white/10">
								<p className="text-xl font-medium text-muted-foreground">현재 활성화된 프로세스가 없습니다.</p>
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
			</div>
		</Container>
	);
}

