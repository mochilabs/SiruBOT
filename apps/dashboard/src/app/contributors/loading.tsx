import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";

/**
 * 기여자 로딩 중 — 완성 화면과 같은 구조(요약 문장 + 기여자 카드 그리드)로 그려요.
 * profile/loading.tsx와 같은 SkeletonCard 언어를 써서 진입 시 레이아웃 시프트가 없어요.
 */
export default function ContributorsLoading() {
	return (
		<Container>
			<span role="status" className="sr-only">
				기여자 목록을 불러오는 중…
			</span>

			<PageHeader title="기여자" description="코드·문서·기획으로 시루봇을 함께 만들어 나가는 모든 기여자를 소개해요." />

			<SkeletonLine width="16rem" height="h-5" className="mb-4" />

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				{Array.from({ length: 8 }, (_, index) => (
					<SkeletonCard key={index} lines={1} avatar={false} className="items-center px-4 py-5" />
				))}
			</div>
		</Container>
	);
}