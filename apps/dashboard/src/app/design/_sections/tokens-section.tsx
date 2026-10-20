import { cn } from "@/lib/utils";

import { SectionHeader, Showcase, ShowcaseRow } from "./shared";

const COLOR_TOKENS = [
	"background",
	"foreground",
	"card",
	"popover",
	"primary",
	"primary-control",
	"primary-text",
	"secondary",
	"muted",
	"accent",
	"destructive",
	"success",
	"warning",
	"info",
	"border",
	"surface-1",
	"surface-2",
	"surface-3",
	"discord-embed",
	"discord-text",
];

// Tailwind v4는 `bg-${token}` 같은 동적 클래스 문자열을 CSS에 포함시키지 않아요 — 토큰별 명시적 맵을 써요
const COLOR_TOKEN_BG: Record<string, string> = {
	background: "bg-background",
	foreground: "bg-foreground",
	card: "bg-card",
	popover: "bg-popover",
	primary: "bg-primary",
	"primary-control": "bg-primary-control",
	"primary-text": "bg-primary-text",
	secondary: "bg-secondary",
	muted: "bg-muted",
	accent: "bg-accent",
	destructive: "bg-destructive",
	success: "bg-success",
	warning: "bg-warning",
	info: "bg-info",
	border: "bg-border",
	"surface-1": "bg-surface-1",
	"surface-2": "bg-surface-2",
	"surface-3": "bg-surface-3",
	"discord-embed": "bg-discord-embed",
	"discord-text": "bg-discord-text",
};

function ColorSwatch({ token }: { token: string }) {
	return (
		<div className="flex items-center gap-2">
			<div className={cn("h-8 w-8 shrink-0 rounded-menu border border-border shadow-sm", COLOR_TOKEN_BG[token])} />
			<span className="text-xs font-medium text-muted-foreground">{token}</span>
		</div>
	);
}

export function TokensSection() {
	return (
		<>
			<SectionHeader
				id="tokens"
				title="Tokens"
				description="색상, 타이포그래피, 반경, 그림자, 모션 토큰"
			/>
			<Showcase className="space-y-8">
				<ShowcaseRow label="Colors">
					{COLOR_TOKENS.map((token) => (
						<ColorSwatch key={token} token={token} />
					))}
				</ShowcaseRow>

				<ShowcaseRow label="Typography">
					<div className="space-y-2">
						<p className="text-2xs text-muted-foreground">text-2xs</p>
						<p className="text-xs text-muted-foreground">text-xs</p>
						<p className="text-sm text-muted-foreground">text-sm</p>
						<p className="text-base text-foreground">text-base</p>
						<p className="text-lg text-foreground">text-lg</p>
						<p className="text-xl text-foreground">text-xl</p>
						<p className="text-2xl text-foreground">text-2xl</p>
						<p className="text-3xl text-foreground">text-3xl</p>
						<p className="text-4xl text-foreground">text-4xl</p>
						<p className="text-4xl font-black tracking-tighter text-primary-text">Title Sample</p>
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="Radius">
					<div className="h-16 w-32 rounded-control border border-border bg-surface-1 p-3 text-xs font-medium text-muted-foreground">rounded-control</div>
					<div className="h-16 w-32 rounded-card border border-border bg-surface-1 p-3 text-xs font-medium text-muted-foreground">rounded-card</div>
					<div className="h-16 w-32 rounded-menu border border-border bg-surface-1 p-3 text-xs font-medium text-muted-foreground">rounded-menu</div>
					<div className="h-16 w-32 rounded-dialog border border-border bg-surface-1 p-3 text-xs font-medium text-muted-foreground">rounded-dialog</div>
				</ShowcaseRow>

				<ShowcaseRow label="Shadows">
					<div className="h-16 w-32 rounded-card border border-border bg-card p-3 text-xs font-medium text-muted-foreground shadow-sm">shadow-sm</div>
					<div className="h-16 w-32 rounded-card border border-border bg-card p-3 text-xs font-medium text-muted-foreground shadow-md">shadow-md</div>
					<div className="h-16 w-32 rounded-card border border-border bg-card p-3 text-xs font-medium text-muted-foreground shadow-lg">shadow-lg</div>
					<div className="h-16 w-32 rounded-card border border-border bg-card p-3 text-xs font-medium text-muted-foreground shadow-2xl">shadow-2xl</div>
				</ShowcaseRow>

				<ShowcaseRow label="Motion">
					<div className="h-12 w-24 rounded-control border border-border bg-surface-1 flex items-center justify-center text-xs font-medium text-muted-foreground transition-colors duration-fast hover:bg-primary">fast</div>
					<div className="h-12 w-24 rounded-control border border-border bg-surface-1 flex items-center justify-center text-xs font-medium text-muted-foreground transition-colors duration-base hover:bg-primary">base</div>
					<div className="h-12 w-24 rounded-control border border-border bg-surface-1 flex items-center justify-center text-xs font-medium text-muted-foreground transition-colors duration-slow hover:bg-primary">slow</div>
				</ShowcaseRow>
			</Showcase>
		</>
	);
}
