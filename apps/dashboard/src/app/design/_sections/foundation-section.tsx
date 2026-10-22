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
					SiruBOT Dashboard uses Tailwind v4 + shadcn registry CSS integration. UI components are customized in{" "}
					<code className="rounded-control bg-muted px-1.5 py-0.5 text-xs text-foreground">src/components/ui/</code>{" "}
					to match our tokens.
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
