import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";

export default function PlayerLoading() {
	return (
		<Container>
			<span role="status" className="sr-only">
				음악 플레이어를 불러오는 중…
			</span>

			<PageHeader
				title="음악 플레이어"
				description="지금 플레이 중인 곡을 실시간으로 보고, 검색해서 바로 재생해요. 음성 채널에 접속 중이라면 봇이 채널에 접속해 재생해요."
			/>

			<div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-8">
				<div className="space-y-6">
					<Card padding="lg" className="space-y-4">
						<SkeletonLine width="100%" height="h-20" />
						<SkeletonLine width="100%" height="h-10" />
					</Card>
					<SkeletonCard lines={4} avatar={false} />
				</div>
				<div className="space-y-6">
					<Card padding="lg" className="space-y-4">
						<SkeletonLine width="100%" height="h-11" />
						<SkeletonLine width="100%" height="h-14" />
					</Card>
					<SkeletonCard lines={4} avatar={false} />
				</div>
			</div>
		</Container>
	);
}
