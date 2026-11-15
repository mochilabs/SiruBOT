import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { SkeletonLine } from "@/components/ui/skeleton";

export default function PlaylistsLoading() {
	return (
		<Container>
			<span role="status" className="sr-only">
				플레이리스트를 불러오는 중…
			</span>

			<PageHeader
				title="플레이리스트"
				description="내 플레이리스트를 만들고 트랙 순서를 편집해 관리해보세요."
			/>

			<div className="flex flex-col items-start gap-4 lg:flex-row lg:gap-8">
				{/* 사이드바 스켈레톤 */}
				<Card padding="md" className="hidden w-full shrink-0 space-y-3 lg:block lg:w-72">
					<div className="flex items-center justify-between">
						<SkeletonLine width="6rem" height="h-5" />
						<SkeletonLine width="2rem" height="h-8" />
					</div>
					<SkeletonLine width="100%" height="h-9" />
					<div className="space-y-2 pt-1">
						{[0, 1, 2, 3].map((i) => (
							<SkeletonLine key={i} width="100%" height="h-11" />
						))}
					</div>
				</Card>

				{/* 상세 영역 스켈레톤 */}
				<div className="flex w-full flex-1 flex-col gap-4 lg:min-h-[500px]">
					<Card padding="md" className="space-y-3">
						<SkeletonLine width="14rem" height="h-7" />
						<SkeletonLine width="10rem" height="h-4" />
					</Card>
					<Card padding="none" className="flex-1 divide-y divide-border-subtle p-4">
						{[0, 1, 2, 3, 4].map((i) => (
							<div key={i} className="flex items-center gap-3 py-3">
								<SkeletonLine width="2.5rem" height="h-10" className="shrink-0" />
								<div className="min-w-0 flex-1 space-y-1.5">
									<SkeletonLine width="55%" height="h-4" />
									<SkeletonLine width="30%" height="h-3" />
								</div>
								<SkeletonLine width="3rem" height="h-4" className="shrink-0" />
							</div>
						))}
					</Card>
				</div>
			</div>
		</Container>
	);
}
