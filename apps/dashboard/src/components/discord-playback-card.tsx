"use client";

import { useEffect,useState } from "react";
import Image from "next/image";
import * as motion from "framer-motion/client";
import { Globe, Music, Pause, Play, Repeat, SkipBack, SkipForward, Sparkles,Volume2 } from "lucide-react";

interface TrackInfo {
	title: string;
	artist: string;
	duration: number; // in seconds
	thumbnail: string;
	server: string;
}

const TRACKS: TrackInfo[] = [
	{
		title: "I wish I had been midnight. \"Justice\" MV",
		artist: "ずっと真夜中でいいのに。ZUTOMAYO",
		duration: 280,
		thumbnail: "https://i.ytimg.com/vi/7kUbX4DoZoc/hqdefault.jpg",
		server: "KOR-1"
	},
	{
		title: "Gurenge",
		artist: "LiSA",
		duration: 238,
		thumbnail: "https://i.ytimg.com/vi/MpYy6wwqxoo/hqdefault.jpg",
		server: "JPN-2"
	},
	{
		title: "アイドル (Idol)",
		artist: "YOASOBI",
		duration: 213,
		thumbnail: "https://i.ytimg.com/vi/ZRtdQ81jPUQ/hqdefault.jpg",
		server: "KOR-4"
	},
	{
		title: "Night Dancer",
		artist: "imase",
		duration: 210,
		thumbnail: "https://i.ytimg.com/vi/kagoEGKHZvU/hqdefault.jpg",
		server: "KOR-1"
	}
];

export function DiscordPlaybackCard() {
	const [track, setTrack] = useState<TrackInfo | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [isPlaying, setIsPlaying] = useState(true);

	useEffect(() => {
		// Randomize track on mount
		const randomTrack = TRACKS[Math.floor(Math.random() * TRACKS.length)];
		setTrack(randomTrack);
		// Random start time
		setCurrentTime(Math.floor(Math.random() * (randomTrack.duration / 2)));
	}, []);

	useEffect(() => {
		if (!isPlaying || !track) return;

		const interval = setInterval(() => {
			setCurrentTime((prev) => {
				if (prev >= track.duration) return 0;
				return prev + 1;
			});
		}, 1000);

		return () => clearInterval(interval);
	}, [isPlaying, track]);

	if (!track) return null;

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	};

	const progress = (currentTime / track.duration) * 100;

	return (
		<motion.div 
			className="w-[450px] h-[250px] bg-gradient-to-r from-discord-embed via-discord-embed to-transparent rounded-md border-l-4 border-[#ffdaff] overflow-hidden shadow-2xl text-[14px] font-sans flex flex-col"
			initial={{ opacity: 0, y: 30 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.6 }}
		>
			<div className="p-5 flex-1 flex flex-col justify-between">
				{/* Top Status */}
				<div className="flex items-center gap-2 text-discord-text">
					<div className="bg-discord-primary p-1 rounded-md text-white">
						<Music size={14} />
					</div>
					<div className="flex items-center gap-1 font-bold">
						<span className="text-discord-light">라운지</span>
						<span className="text-discord-text-muted font-medium tracking-tight">에서 재생 중</span>
					</div>
				</div>

				{/* Embed Content Area */}
				<div className="flex gap-4 items-start">
					<div className="flex-1 space-y-3">
						<div className="space-y-1">
							<h3 className="text-discord-blue text-[15px] font-bold leading-snug cursor-pointer hover:underline line-clamp-2">
								{track.title}
							</h3>
							<p className="text-discord-text-muted text-[13px] leading-relaxed">
								아티스트: <span className="text-discord-text">{track.artist}</span> | 추천 곡 
								<Sparkles size={12} className="inline ml-1 text-yellow-400 animate-pulse-soft" />
							</p>
						</div>

						{/* Progress Bar & Timer */}
						<div className="space-y-1">
							<div className="flex justify-between text-[11px] font-bold text-discord-text-muted tabular-nums">
								<span>{formatTime(currentTime)}</span>
								<span>{formatTime(track.duration)}</span>
							</div>
							<div className="h-1 bg-discord-btn-active rounded-full overflow-hidden relative">
								<motion.div 
									className="absolute top-0 left-0 h-full bg-white rounded-full"
									animate={{ width: `${progress}%` }}
									transition={{ duration: 1, ease: "linear" }}
								/>
							</div>
						</div>
					</div>

					{/* Thumbnail */}
					<div className="relative w-24 h-24 rounded-lg overflow-hidden border border-white/5 shrink-0 shadow-lg">
						<Image 
							src={track.thumbnail} 
							alt={track.title} 
							fill 
							sizes="96px"
							className="object-cover"
						/>
					</div>
				</div>

				{/* Controls */}
				<div className="flex gap-2 pt-1">
					{[
						{ icon: SkipBack, active: false, action: () => {} },
						{ icon: isPlaying ? Pause : Play, active: true, action: () => setIsPlaying(!isPlaying) },
						{ icon: SkipForward, active: false, action: () => {} },
						{ icon: Repeat, active: true, action: () => {} },
					].map((btn, i) => (
						<button 
							key={i}
							onClick={btn.action}
							className={`p-2.5 rounded-md transition-all ${
								btn.active 
									? "bg-discord-btn-active text-discord-text hover:bg-discord-btn-hover active:scale-95" 
									: "bg-discord-bg text-discord-text-muted cursor-not-allowed"
							}`}
						>
							<btn.icon size={18} fill={btn.active ? "currentColor" : "none"} />
						</button>
					))}
				</div>

				{/* Embed Footer */}
				<div className="flex items-center gap-4 text-discord-text-muted text-[10px] font-bold tracking-tight pt-1">
					<div className="flex items-center gap-1.5">
						<Globe size={12} />
						재생 서버: {track.server}
					</div>
					<div className="flex items-center gap-1.5">
						<Volume2 size={12} />
						볼륨: 50%
					</div>
				</div>
			</div>
		</motion.div>
	);
}
