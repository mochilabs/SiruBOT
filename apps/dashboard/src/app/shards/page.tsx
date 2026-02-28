import { fetchShards } from '@/lib/shard-api';
import { ShardStats } from '@/components/shard-stats';
import { ProcessCard } from '@/components/process-card';
import { AutoRefresh } from '@/components/auto-refresh';

export const dynamic = 'force-dynamic';

export default async function ShardsPage() {
	const data = await fetchShards();

	if (!data) {
		return (
			<div className="container mx-auto px-6 py-8">
				<div className="max-w-4xl mx-auto text-center py-20">
					<span className="text-6xl mb-4 block">⚠️</span>
					<h1 className="text-2xl font-bold text-gray-900 mb-2">샤드 매니저에 연결할 수 없어요</h1>
					<p className="text-gray-500">샤드 매니저가 실행 중인지 확인해주세요.</p>
				</div>
			</div>
		);
	}

	const { processes, stats } = data;

	return (
		<div className="container mx-auto px-6 py-8">
			<div className="max-w-5xl mx-auto">
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
					<div>
						<h1 className="text-2xl font-bold text-gray-900">📡 Shard Manager</h1>
						<p className="text-sm text-gray-500 mt-1">실시간 샤드 상태 모니터링</p>
					</div>
					<AutoRefresh intervalMs={5000} />
				</div>

				{/* Stats Cards */}
				<div className="mb-8">
					<ShardStats stats={stats} />
				</div>

				{/* Process Cards */}
				<div className="mb-4">
					<h2 className="text-lg font-semibold text-gray-900 mb-4">프로세스 목록</h2>
					{processes.length === 0 ? (
						<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
							<p className="text-gray-500">연결된 프로세스가 없어요.</p>
						</div>
					) : (
						<div className="grid md:grid-cols-2 gap-4">
							{processes.map((process, index) => (
								<ProcessCard key={process.wsId} process={process} index={index} />
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
