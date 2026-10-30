import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function AdminLoading() {
	return (
		<Container>
			<PageHeader
				title="봇 관리자 패널"
				description="운영자 데이터를 불러오는 중이에요."
			/>
			<div className="flex flex-col gap-6 lg:flex-row lg:items-start">
				<div className="hidden w-72 shrink-0 lg:block">
					<SkeletonCard className="h-72" />
				</div>
				<div className="min-w-0 flex-1 space-y-6">
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<SkeletonCard className="h-28" />
						<SkeletonCard className="h-28" />
						<SkeletonCard className="h-28" />
						<SkeletonCard className="h-28" />
					</div>
					<Skeleton className="h-96 w-full rounded-card" />
				</div>
			</div>
		</Container>
	);
}
