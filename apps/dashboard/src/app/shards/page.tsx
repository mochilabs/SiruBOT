import { fetchShards } from '@/lib/shard-api';
import { ShardStats } from '@/components/shard-stats';
import { ProcessCard } from '@/components/process-card';
import { AutoRefresh } from '@/components/auto-refresh';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ShardsPage() {
	const data = await fetchShards();

	if (!data) {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-error)]/8 border border-[var(--color-error)]/15 mb-5">
					<AlertTriangle size={28} className="text-[var(--color-error)]" />
				</div>
				<h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">샤드 매니저에 연결할 수 없어요</h1>
				<p className="text-sm text-[var(--color-text-secondary)]">샤드 매니저가 실행 중인지 확인해주세요.</p>
			</div>
		);
	}

	const { processes, stats } = data;

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">
						<span className="gradient-text">Shard Manager</span>
					</h1>
					<p className="text-[var(--color-text-secondary)]">실시간 샤드 상태 모니터링</p>
				</div>
				<AutoRefresh intervalMs={5000} />
			</div>

			<ShardStats stats={stats} />

			<div className="space-y-4">
				<h2 className="text-lg font-semibold text-[var(--color-text-primary)]">프로세스 목록</h2>
				{processes.length === 0 ? (
					<div className="glass-panel p-12 text-center">
						<p className="text-[var(--color-text-secondary)]">연결된 프로세스가 없어요.</p>
					</div>
				) : (
					<div className="grid gap-4 md:grid-cols-2">
						{processes.map((process, index) => (
							<ProcessCard key={process.wsId} process={process} index={index} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
