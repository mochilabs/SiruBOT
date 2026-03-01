import { Track as TrackType } from "@sirubot/prisma";
import * as Avatar from "@radix-ui/react-avatar";
import * as Separator from "@radix-ui/react-separator";
import Image from "next/image";

interface TrackListProps {
	tracks: TrackType[];
}

export function formatTimeToKorean(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
  
	const parts: string[] = [];
  
	if (hours > 0) {
	  parts.push(`${hours}시간`);
	}
	if (minutes > 0 || hours > 0) {
	  parts.push(`${minutes}분`);
	}
	if (secs > 0 || (hours === 0 && minutes === 0)) {
	  parts.push(`${secs}초`);
	}
  
	return parts.join(" ");
}

export function TrackList({ tracks }: TrackListProps) {
	return (
		<div className="w-full space-y-1 overflow-y-auto">
			{tracks.map((track, index) => (
				<TrackItem key={track.id} track={track} rank={index + 1} />
			))}
		</div>
	);
}

function TrackItem({ track, rank }: { track: TrackType; rank: number }) {
	return (
		<div className="group">
			<div className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
				{/* 순위 */}
				<div className="w-1 sm:w-6 text-center">
					<span className="font-mono text-sm text-gray-600 font-medium">
						{rank}
					</span>
				</div>

				{/* 썸네일 */}
				<Avatar.Root className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
					<Avatar.Image 
						src={track.thumbnail || undefined} 
						alt={track.title}
						className="w-full h-full object-cover"
					/>
					<Avatar.Fallback className="w-full h-full flex items-center justify-center bg-gray-200">
						<span className="text-gray-400 text-lg">🎵</span>
					</Avatar.Fallback>
				</Avatar.Root>

				{/* 제목과 아티스트 */}
				<div className="flex-1 min-w-0">
					<h3 className="font-medium text-gray-900 truncate" title={track.title}>
						{track.title} <a className="text-sm text-gray-500 truncate mt-0.5">{formatTimeToKorean(track.duration / 1000)}</a>
					</h3>
					<p className="text-sm text-gray-500 truncate mt-0.5" title={track.artist}>
						{track.artist}
					</p>
				</div>

				{/* 재생 횟수와 링크 */}
				<div className="flex items-center gap-3">
					<div className="text-right text-sm text-gray-400">
						{track.totalPlays.toLocaleString()}회
					</div>
					
					{track.url && (
						<a 
							href={track.url} 
							target="_blank" 
							rel="noopener noreferrer"
							className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors hidden sm:block"
							title="원본 링크로 이동"
						>
							<svg 
								className="w-4 h-4" 
								fill="none" 
								stroke="currentColor" 
								viewBox="0 0 24 24"
							>
								<path 
									strokeLinecap="round" 
									strokeLinejoin="round" 
									strokeWidth={2} 
									d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" 
								/>
							</svg>
						</a>
					)}
				</div>
			</div>
			
			{/* 구분선 (마지막 아이템 제외) */}
			<Separator.Root className="h-px bg-gray-100 last:hidden" />
		</div>
	);
}

// 기존 단일 트랙 컴포넌트도 유지
export function Track({ track }: { track: TrackType }) {
	return (
		<div className="flex items-center gap-3 p-3 border rounded-lg">
			{track.thumbnail ? (
				<Image
					src={track.thumbnail}
					alt={track.title}
					width={48}
					height={48}
					className="rounded object-cover"
				/>
			) : (
				<div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
					<span className="text-gray-400">🎵</span>
				</div>
			)}
			<div className="flex-1 min-w-0">
				<h3 className="font-medium truncate" title={track.title}>
					{track.title}
				</h3>
				<p className="text-sm text-gray-600 truncate" title={track.artist}>
					{track.artist}
				</p>
				<p className="text-xs text-gray-500">
					{track.totalPlays}회 재생
				</p>
			</div>
		</div>
	);
}
