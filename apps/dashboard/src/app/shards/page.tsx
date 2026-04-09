import { fetchShards } from '@/lib/shard-api';
import { ShardStats } from '@/components/shard-stats';
import { ProcessCard } from '@/components/process-card';
import { AutoRefresh } from '@/components/auto-refresh';
import { Heading, Text, Card, Flex } from "@radix-ui/themes";

export const dynamic = 'force-dynamic';

export default async function ShardsPage() {
	const data = await fetchShards();

	if (!data) {
		return (
			<div className="min-h-[calc(100vh-80px)] bg-siru-bg flex items-center justify-center p-6 relative">
				<div className="absolute top-0 left-0 w-full h-full opacity-[0.02] pointer-events-none flex justify-center items-center">
					<div className="w-[800px] h-[800px] bg-siru-primary rounded-full blur-[150px]"></div>
				</div>
				<Card className="max-w-xl w-full bg-siru-panel border-0 rounded-[2rem] p-12 text-center shadow-lg relative z-10">
					<span className="text-6xl mb-6 block opacity-80">⚠️</span>
					<Heading size="6" className="text-siru-text mb-3">샤드 매니저에 연결할 수 없어요</Heading>
					<Text className="text-siru-text/60">샤드 매니저가 정상적으로 실행 중인지 확인해주세요.</Text>
				</Card>
			</div>
		);
	}

	const { processes, stats } = data;

	return (
		<div className="min-h-[calc(100vh-80px)] bg-siru-bg relative py-12">
			{/* Watermark effect */}
			<div className="absolute top-0 right-0 w-full h-full opacity-[0.03] pointer-events-none flex justify-end items-start overflow-hidden">
				<div className="w-[600px] h-[600px] bg-siru-primary rounded-full blur-[120px] transform -translate-y-1/4 translate-x-1/4"></div>
			</div>

			<div className="container mx-auto px-6 max-w-6xl relative z-10">
				{/* Header */}
				<Flex justify="between" align="center" className="mb-8" wrap="wrap" gap="4">
					<div>
						<Heading size="8" className="text-siru-text tracking-tight mb-2">📡 Shard Manager</Heading>
						<Text size="4" className="text-siru-text/70">실시간 샤드 상태 및 리소스 사용량 모니터링</Text>
					</div>
					<AutoRefresh intervalMs={5000} />
				</Flex>

				{/* Stats Cards */}
				<div className="mb-10">
					<ShardStats stats={stats} />
				</div>

				{/* Process Cards */}
				<div>
					<Heading size="5" className="text-siru-text mb-6">프로세스 목록</Heading>
					{processes.length === 0 ? (
						<Card className="bg-siru-panel border-0 rounded-[1.5rem] p-12 text-center">
							<Text className="text-siru-text/50 text-lg">연결된 프로세스가 없습니다.</Text>
						</Card>
					) : (
						<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
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