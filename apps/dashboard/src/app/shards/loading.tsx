import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";

/**
 * 시스템 상태 로딩 중 — 완성 화면과 같은 구조(PageHeader + ShardStats 카드 행 + 섹션 카드 셸)로 그려요.
 * profile/loading.tsx와 같은 SkeletonCard 언어를 써서 진입 시 레이아웃 시프트가 없어요.
 */
export default function ShardsLoading() {
	return (
		<Container>
			<span role="status" className="sr-only">
				샤드 정보 불러오는 중…
			</span>

			<PageHeader title="시스템 상태" description="샤드 정보를 동기화하는 중이에요." />

			{/* ShardStats — StatCard 4개 행 */}
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4 sm:gap-6">
				<SkeletonCard lines={2} avatar={false} />
				<SkeletonCard lines={2} avatar={false} />
				<SkeletonCard lines={2} avatar={false} />
				<SkeletonCard lines={2} avatar={false} />
			</div>

			{/* 데이터 게이트웨이 · 음성 서버 카드 셸 */}
			<div className="mt-8 grid gap-4">
				<SkeletonCard lines={3} avatar={false} />
				<SkeletonCard lines={3} avatar={false} />
			</div>

			{/* 변화 추이 차트 카드 2개 */}
			<div className="mt-8 grid gap-4 lg:grid-cols-2">
				<SkeletonCard lines={4} avatar={false} />
				<SkeletonCard lines={4} avatar={false} />
			</div>

			{/* 연동된 프로세스 섹션 헤더 + 카드 2개 */}
			<div className="mt-8 space-y-8">
				<SkeletonLine width="12rem" height="h-7" />
				<div className="grid gap-8 md:grid-cols-2">
					<SkeletonCard lines={3} avatar={false} />
					<SkeletonCard lines={3} avatar={false} />
				</div>
			</div>
		</Container>
	);
}