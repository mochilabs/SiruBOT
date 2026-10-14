import Container from "@/components/container";
import { SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <Container>
      <header aria-busy="true" className="relative mb-6 flex flex-col justify-between gap-6 pb-6 md:flex-row md:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <SkeletonLine width="12rem" height="h-10 sm:h-12" />
          <SkeletonLine width="14rem" height="h-5" />
        </div>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <SkeletonCard lines={2} avatar={false} />
        <SkeletonCard lines={2} avatar={false} />
        <SkeletonCard lines={3} avatar={false} className="md:col-span-2" />
        <SkeletonCard lines={2} avatar={false} className="md:col-span-2" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <SkeletonCard lines={2} avatar={false} />
        <SkeletonCard lines={2} avatar={false} />
        <SkeletonCard lines={2} avatar={false} />
      </div>
    </Container>
  );
}
