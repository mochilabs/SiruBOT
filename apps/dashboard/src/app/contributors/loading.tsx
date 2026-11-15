import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { SkeletonCircle, SkeletonLine } from "@/components/ui/skeleton";

/**
 * 기여자 로딩 중 — 완성 화면과 같은 구조(히트맵 카드 1개 + 기여자 목록 카드 1개)로 그려요.
 */
export default function ContributorsLoading() {
	return (
		<Container>
			<span role="status" className="sr-only">
				기여자 목록을 불러오는 중…
			</span>

			<PageHeader title="기여자" description="코드·문서·기획으로 시루봇을 함께 만들어 나가는 모든 기여자를 소개해요." />

			<div className="space-y-6">
				<Card padding="md" className="space-y-4">
					<div className="flex items-center justify-between gap-4">
						<SkeletonLine width="12rem" height="h-5" />
						<SkeletonLine width="8rem" height="h-4" />
					</div>
					<SkeletonLine width="100%" height="h-28" />
				</Card>

				<Card padding="md" className="space-y-4">
					<SkeletonLine width="10rem" height="h-5" />
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
						{Array.from({ length: 8 }, (_, index) => (
							<div key={index} className="flex items-center gap-3 rounded-control bg-surface-1 p-3">
								<SkeletonCircle size="h-10 w-10 shrink-0" />
								<div className="min-w-0 flex-1 space-y-1.5">
									<SkeletonLine width="70%" height="h-4" />
									<SkeletonLine width="45%" height="h-3" />
								</div>
							</div>
						))}
					</div>
				</Card>
			</div>
		</Container>
	);
}
