import Container from "@/components/container";
import { SkeletonCard, SkeletonLine } from "@/components/primitives/skeleton";

export default function ProfileLoading() {
  return (
    <Container>
      <div className="mb-6 space-y-3 border-b border-border/40 pb-6">
        <SkeletonLine width="220px" height="h-12" />
        <SkeletonLine width="180px" height="h-5" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} className="md:col-span-2" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <SkeletonCard lines={2} avatar={false} />
        <SkeletonCard lines={2} avatar={false} />
        <SkeletonCard lines={2} avatar={false} />
      </div>
    </Container>
  );
}