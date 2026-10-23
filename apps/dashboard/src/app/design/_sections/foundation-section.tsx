import { SectionHeader, Showcase } from "./shared";

export function FoundationSection() {
	return (
		<>
			<SectionHeader
				id="foundation"
				title="Foundation"
				description="Tailwind v4 + shadcn registry CSS 통합 기반의 디자인 시스템"
			/>
			<Showcase>
				<p className="text-sm text-muted-foreground font-medium leading-relaxed">
					시루봇 대시보드는 Tailwind v4와 shadcn registry CSS 통합을 사용해요. UI 컴포넌트는{" "}
					<code className="rounded-control bg-muted px-1.5 py-0.5 text-xs text-foreground">src/components/ui/</code>
					에서 토큰에 맞게 커스터마이즈해요.
				</p>
				<div className="rounded-card bg-muted p-4 overflow-x-auto">
					<pre className="text-xs text-muted-foreground font-medium">
						{JSON.stringify(
							{
								style: "base-nova",
								rsc: true,
								tsx: true,
								iconLibrary: "lucide",
								aliases: {
									components: "@/components",
									utils: "@/lib/utils",
									ui: "@/components/ui",
									lib: "@/lib",
									hooks: "@/hooks",
								},
							},
							null,
							2,
						)}
					</pre>
				</div>
			</Showcase>
		</>
	);
}
