import { Music4 } from "lucide-react";

/** 썸네일 없는 트랙 표시 — 그라디언트 서피스 + 음악 아이콘 + "No Image" 워터마크 */
export function MockThumbnail({ className }: { className: string }) {
	return (
		<div className={`flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 via-primary/5 to-secondary/20 relative ${className}`}>
			<Music4 className="h-1/3 w-1/3 text-primary-text relative z-10" aria-hidden />
			<span className="absolute bottom-1 right-1 text-3xs font-black text-primary-text uppercase tracking-tighter select-none z-10">
				No Image
			</span>
		</div>
	);
}
