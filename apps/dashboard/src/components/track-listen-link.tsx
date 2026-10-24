import { ExternalLink } from "lucide-react";

interface TrackListenLinkProps {
	url: string | null | undefined;
	title: string;
	compact?: boolean;
}

/** 트랙의 원본 URL을 여는 공통 듣기 액션이에요. */
export function TrackListenLink({ url, title, compact = false }: TrackListenLinkProps) {
	if (!url) return null;

	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			title={`${title} 듣기`}
			aria-label={`${title} 듣기`}
			className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 rounded-control bg-primary/10 px-2 text-xs font-semibold text-primary-text transition-colors duration-fast hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<ExternalLink size={13} aria-hidden />
			<span className={compact ? "sr-only sm:not-sr-only" : undefined}>듣기</span>
		</a>
	);
}
