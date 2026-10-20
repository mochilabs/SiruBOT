import { SectionHeader, Showcase, ShowcaseRow } from "./shared";

export function SurfacesSection() {
	return (
		<>
			<SectionHeader
				id="surfaces"
				title="Surfaces"
				description="배경과 표면 위계"
			/>
			<Showcase>
				<ShowcaseRow label="Surface layers" block>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<div className="h-24 rounded-card border border-border bg-background p-3 text-xs font-medium text-muted-foreground">bg-background</div>
						<div className="h-24 rounded-card border border-border bg-card p-3 text-xs font-medium text-muted-foreground">bg-card</div>
						<div className="h-24 rounded-card border border-border bg-surface-1 p-3 text-xs font-medium text-muted-foreground">bg-surface-1</div>
						<div className="h-24 rounded-card border border-border bg-surface-2 p-3 text-xs font-medium text-muted-foreground">bg-surface-2</div>
						<div className="h-24 rounded-card border border-border bg-surface-3 p-3 text-xs font-medium text-muted-foreground">bg-surface-3</div>
						<div className="h-24 rounded-card border border-border bg-popover p-3 text-xs font-medium text-muted-foreground">bg-popover</div>
						<div className="h-24 rounded-card border border-border bg-input p-3 text-xs font-medium text-muted-foreground">bg-input</div>
						<div className="h-24 rounded-card border border-border bg-muted p-3 text-xs font-medium text-muted-foreground">bg-muted</div>
					</div>
				</ShowcaseRow>
			</Showcase>
		</>
	);
}
