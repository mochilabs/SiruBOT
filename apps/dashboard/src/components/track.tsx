import { Track as TrackType } from "@sirubot/prisma";
import * as Avatar from "@radix-ui/react-avatar";
import * as Separator from "@radix-ui/react-separator";
import { Flex, Text, Button } from "@radix-ui/themes";
import Link from "next/link";
import Image from "next/image";

interface TrackListProps {
	tracks: TrackType[];
	currentPage?: number;
	pageSize?: number;
	totalPages?: number;
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

export function TrackList({ tracks, currentPage = 1, pageSize = 10, totalPages = 1 }: TrackListProps) {
	return (
		<div className="w-full flex flex-col h-full">
			<div className="w-full space-y-2 overflow-y-auto pb-6">
				{tracks.map((track, index) => {
					const absoluteRank = (currentPage - 1) * pageSize + index + 1;
					return <TrackItem key={track.id} track={track} rank={absoluteRank} />;
				})}
			</div>

			{/* Pagination Controls */}
			{totalPages > 1 && (
				<Flex justify="center" align="center" gap="4" className="mt-6 pt-4 border-t border-siru-text/10">
					<Button
						variant="soft"
						disabled={currentPage <= 1}
						className="bg-siru-base text-siru-text hover:bg-siru-base/80 rounded-xl"
						asChild={currentPage > 1}
					>
						{currentPage > 1 ? (
							<Link href={`/track?page=${currentPage - 1}`}>이전</Link>
						) : (
							<span>이전</span>
						)}
					</Button>

					<Text className="text-siru-text/80 font-medium">
						{currentPage} <span className="text-siru-text/40">/</span> {totalPages}
					</Text>

					<Button
						variant="soft"
						disabled={currentPage >= totalPages}
						className="bg-siru-base text-siru-text hover:bg-siru-base/80 rounded-xl"
						asChild={currentPage < totalPages}
					>
						{currentPage < totalPages ? (
							<Link href={`/track?page=${currentPage + 1}`}>다음</Link>
						) : (
							<span>다음</span>
						)}
					</Button>
				</Flex>
			)}
		</div>
	);
}

function TrackItem({ track, rank }: { track: TrackType; rank: number }) {
	const isTop3 = rank <= 3;
	const isFirst = rank === 1;

	return (
		<div className="group">
			<div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-siru-base/50 transition-all duration-300">
				{/* 순위 */}
				<div className="w-8 sm:w-10 text-center flex flex-col items-center justify-center">
					{isFirst && <span className="text-xl mb-1 drop-shadow-md">👑</span>}
					<span className={`font-mono font-bold text-lg ${isTop3 ? 'text-siru-secondary' : 'text-siru-text/50'}`}>
						{rank}
					</span>
				</div>

				{/* 썸네일 */}
				<Avatar.Root className="w-14 h-14 rounded-xl overflow-hidden bg-siru-base shadow-sm ring-1 ring-siru-text/10">
					<Avatar.Image 
						src={track.thumbnail || undefined} 
						alt={track.title}
						className="w-full h-full object-cover"
					/>
					<Avatar.Fallback className="w-full h-full flex items-center justify-center bg-siru-base">
						<span className="text-siru-text/40 text-xl">🎵</span>
					</Avatar.Fallback>
				</Avatar.Root>

				{/* 제목과 아티스트 */}
				<div className="flex-1 min-w-0 flex flex-col justify-center">
					<div className="flex items-center gap-2">
						<h3 className="font-semibold text-siru-text truncate text-base" title={track.title}>
							{track.title}
						</h3>
						<span className="text-xs text-siru-text/40 font-mono bg-siru-base px-2 py-0.5 rounded-full hidden sm:inline-block">
							{formatTimeToKorean(track.duration / 1000)}
						</span>
					</div>
					<p className="text-sm text-siru-text/60 truncate mt-1 font-medium" title={track.artist}>
						{track.artist}
					</p>
				</div>

				{/* 재생 횟수와 링크 */}
				<div className="flex items-center gap-4">
					<div className="text-right flex flex-col items-end">
						<span className="text-xs text-siru-text/40 font-medium mb-0.5 hidden sm:block">재생 횟수</span>
						<span className={`text-sm font-semibold ${isTop3 ? 'text-siru-primary' : 'text-siru-text/80'}`}>
							{track.totalPlays.toLocaleString()}회
						</span>
					</div>
					
					{track.url && (
						<a 
							href={track.url} 
							target="_blank" 
							rel="noopener noreferrer"
							className="p-2 text-siru-text/40 hover:text-siru-primary hover:bg-siru-primary/10 rounded-xl transition-all hidden sm:flex items-center justify-center"
							title="원본 링크로 이동"
						>
							<svg 
								className="w-5 h-5"
								fill="none" 
								stroke="currentColor" 
								viewBox="0 0 24 24"
							>
								<path 
									strokeLinecap="round" 
									strokeLinejoin="round" 
									strokeWidth={2} 
									d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
								/>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</a>
					)}
				</div>
			</div>
			
			{/* 구분선 (마지막 아이템 제외) */}
			<Separator.Root className="h-px bg-siru-text/5 mx-4 last:hidden" />
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