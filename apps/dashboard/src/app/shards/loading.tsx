import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";

export default function ShardsLoading() {
	return (
		<Container>
			<span role="status" className="sr-only">
				샤드 정보 불러오는 중…
			</span>

			<PageHeader title="시스템 상태" description="샤드 정보를 동기화하는 중이에요." />

			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4 sm:gap-6">
				<SkeletonCard lines={2} avatar={false} />
				<SkeletonCard lines={2} avatar={false} />
				<SkeletonCard lines={2} avatar={false} />
				<SkeletonCard lines={2} avatar={false} />
			</div>

			<div className="mt-8 grid gap-4">
				<SkeletonCard lines={3} avatar={false} />
				<SkeletonCard lines={3} avatar={false} />
			</div>

			<div className="mt-8 grid gap-4 lg:grid-cols-2">
				<SkeletonCard lines={4} avatar={false} />
				<SkeletonCard lines={4} avatar={false} />
			</div>

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