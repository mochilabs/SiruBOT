"use client";

import { useEffect, useMemo,useState } from "react";
import Image from "next/image";
import { AnimatePresence,m } from "framer-motion";
import {
	Hash,
	List,
	ListMusic,
	Music,
	Pause,
	Play,
	SkipBack,
	SkipForward,
	Sparkles,
	Square,
	Volume2,
} from "lucide-react";

const BOT_AVATAR = "/images/profile.png";

// ─── Autocomplete commands ──────────────────────────────
const autocompleteCommands = [
	{ name: "재생", desc: "음악을 검색하고 재생해요", Icon: Play },
	{ name: "추천", desc: "노래를 추천받아요", Icon: Sparkles },
	{ name: "플레이리스트", desc: "재생목록을 관리해요", Icon: ListMusic },
	{ name: "대기열", desc: "대기열을 확인해요", Icon: List },
	{ name: "스킵", desc: "다음 곡으로 넘겨요", Icon: SkipForward },
	{ name: "볼륨", desc: "볼륨을 조절해요", Icon: Volume2 },
];

// ─── Track Data from discord-playback-card ────────────────
export interface TrackInfo {
	title: string;
	artist: string;
	duration: number;
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

const formatDuration = (seconds: number) => {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// ─── Slide configs (exported for hero section) ──────────
export interface SlideConfig {
	command: string;
	args: string;
	fullCommand: string;
}

export const slideConfigs: SlideConfig[] = [
	{
		command: "/재생",
		args: "Justice",
		fullCommand: "/재생 Justice",
	},
	{ command: "/추천", args: "", fullCommand: "/추천" },
	{
		command: "/플레이리스트",
		args: "내 노래모음",
		fullCommand: "/플레이리스트 내 노래모음",
	},
	{ command: "/대기열", args: "", fullCommand: "/대기열" },
];

// ─── Embed: Music Player ────────────────────────────────
function MusicEmbed({ track }: { track: TrackInfo }) {
	return (
		<div className="rounded-lg border-l-4 border-primary bg-muted/30 p-4 space-y-3">
			<div className="flex items-center gap-1.5 text-xs font-medium">
				<span className="flex items-center gap-0.5 px-1 rounded bg-[#5865F2]/30 text-[#C9CDFB] hover:bg-[#5865F2] hover:text-white transition-colors cursor-pointer">
					<Volume2 size={12} />
					<span>음악</span>
				</span>
				<span className="text-muted-foreground">에서 재생 중</span>
			</div>

			<div className="flex gap-4">
				<div className="flex-1 space-y-3 min-w-0">
					<h4 className="font-bold text-foreground text-[14px] leading-tight break-keep">
						{track.title}
					</h4>

					<div className="flex items-center gap-2">
						<div className="text-[11px] font-medium text-muted-foreground tabular-nums shrink-0">
							({formatDuration(43)} / {formatDuration(track.duration)})
						</div>
						<div className="h-1.5 bg-muted/60 rounded-full overflow-hidden relative flex-1">
							<m.div
								className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-full"
								initial={{ x: "-100%" }}
								animate={{ x: "0%" }}
								transition={{ duration: 20, ease: "linear" }}
							/>
						</div>
					</div>

					<div className="text-[11px] text-muted-foreground font-medium break-keep">
						아티스트: <span className="text-foreground/80">{track.artist}</span> |
						신청자: <span className="px-1 rounded bg-[#5865F2]/30 text-[#C9CDFB] hover:bg-[#5865F2] hover:text-white transition-colors cursor-pointer">@사용자</span>
					</div>

					<div className="flex items-center gap-2 pt-1.5">
						<button className="flex items-center justify-center w-10 h-8 rounded bg-[#4E5058] hover:bg-[#6D6F78] text-[#dbdee1] transition-all">
							<SkipBack size={16} fill="currentColor" />
						</button>
						<button className="flex items-center justify-center w-10 h-8 rounded bg-[#5865F2] hover:bg-[#4752C4] text-white transition-all">
							<Pause size={16} fill="currentColor" />
						</button>
						<button className="flex items-center justify-center w-10 h-8 rounded bg-[#4E5058] hover:bg-[#6D6F78] text-[#dbdee1] transition-all">
							<SkipForward size={16} fill="currentColor" />
						</button>
						<button className="flex items-center justify-center w-10 h-8 rounded bg-[#4E5058] hover:bg-[#6D6F78] text-[#dbdee1] transition-all">
							<Square size={16} fill="currentColor" />
						</button>
					</div>
				</div>

				{/* Album Art */}
				<div className="w-[80px] h-[80px] rounded-lg overflow-hidden shrink-0 shadow-lg relative bg-muted/20 border border-border/30">
					<Image
						src={track.thumbnail}
						alt={track.title}
						fill
						className="object-cover"
						unoptimized
					/>
				</div>
			</div>

			<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 pt-2 border-t border-border/30 font-medium">
				<Music size={10} />
				<span>재생 서버: {track.server}</span>
				<span className="mx-0.5">|</span>
				<Volume2 size={10} />
				<span>볼륨: 100%</span>
				<span className="mx-0.5">|</span>
				<span>시루봇 v5.1.4</span>
			</div>
		</div>
	);
}

function RecommendEmbed() {
	return (
		<div className="rounded-lg border-l-4 border-secondary bg-muted/30 p-4 shadow-sm max-w-[480px]">
			<div className="flex items-center gap-2 text-[14px] font-bold text-foreground">
				<Sparkles size={16} className="text-secondary" />
				<span>시루가 추천 곡을 재생할게요!</span>
			</div>
		</div>
	);
}

// ─── Embed: Playlist ────────────────────────────────────
function PlaylistEmbed() {
	const playlistTracks = TRACKS.slice(0, 3);
	const totalDuration = playlistTracks.reduce((acc, t) => acc + t.duration, 0);
	return (
		<div className="rounded-lg border-l-4 border-pink-400 bg-muted/30 p-4 space-y-3">
			<div className="flex items-center gap-2 text-xs font-bold text-pink-400">
				<ListMusic size={14} />
				<span>내 노래모음</span>
			</div>
			<div className="space-y-2 text-sm">
				{playlistTracks.map((t, i) => (
					<div key={i} className="flex items-center gap-2">
						<span className="text-muted-foreground/40 text-xs font-bold w-4">
							{i + 1}.
						</span>
						<div className="w-6 h-6 rounded overflow-hidden relative shrink-0 border border-border/20">
							<Image src={t.thumbnail} alt="" fill className="object-cover" unoptimized />
						</div>
						<span className="font-medium text-foreground truncate max-w-[240px]">{t.title}</span>
						<span className="text-muted-foreground text-xs shrink-0">- {t.artist}</span>
					</div>
				))}
			</div>
			<div className="text-[10px] text-muted-foreground/40 pt-2 border-t border-border/30 font-medium">
				{playlistTracks.length}곡 | 총 {formatDuration(totalDuration)}
			</div>
		</div>
	);
}

// ─── Embed: Queue ───────────────────────────────────────
function QueueEmbed() {
	const current = TRACKS[0];
	const queue = TRACKS.slice(1, 3);
	return (
		<div className="rounded-lg border-l-4 border-blue-400 bg-muted/30 p-4 space-y-3">
			<div className="flex items-center gap-2 text-xs font-bold text-blue-400">
				<List size={14} />
				<span>대기열</span>
			</div>
			<div className="space-y-2">
				<div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
					현재 재생 중
				</div>
				<div className="flex items-center gap-2 text-sm bg-primary/5 rounded-md p-2">
					<Play size={12} className="text-primary shrink-0" fill="currentColor" />
					<div className="w-6 h-6 rounded overflow-hidden relative shrink-0 border border-border/20">
						<Image src={current.thumbnail} alt="" fill className="object-cover" unoptimized />
					</div>
					<span className="font-medium text-foreground truncate max-w-[240px]">{current.title}</span>
					<span className="text-muted-foreground text-xs ml-auto shrink-0">{formatDuration(current.duration)}</span>
				</div>
				<div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1">
					다음 곡
				</div>
				{queue.map((s, i) => (
					<div
						key={i}
						className="flex items-center gap-2 text-sm pl-2"
					>
						<span className="text-muted-foreground/40 text-xs font-bold w-4">
							{i + 1}.
						</span>
						<div className="w-6 h-6 rounded overflow-hidden relative shrink-0 border border-border/20">
							<Image src={s.thumbnail} alt="" fill className="object-cover" unoptimized />
						</div>
						<span className="font-medium text-foreground/80 truncate max-w-[220px]">
							{s.title}
						</span>
						<span className="text-muted-foreground text-xs ml-auto shrink-0">
							{formatDuration(s.duration)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ─── Render embed by command ────────────────────────────
function renderEmbed(command: string, selectedTrack: TrackInfo) {
	switch (command) {
		case "/재생":
			return <MusicEmbed track={selectedTrack} />;
		case "/추천":
			return <RecommendEmbed />;
		case "/플레이리스트":
			return <PlaylistEmbed />;
		case "/대기열":
			return <QueueEmbed />;
		default:
			return <MusicEmbed track={selectedTrack} />;
	}
}

const getTrackKeyword = (title: string) => {
	if (title.includes("Justice")) return "Justice";
	if (title.includes("Gurenge")) return "Gurenge";
	if (title.includes("Idol") || title.includes("アイドル")) return "Idol";
	if (title.includes("Night Dancer")) return "Night Dancer";
	return "Justice";
};

// ─── Main Component ─────────────────────────────────────
export function DiscordCommandAnimation({
	activeSlide = 0,
	onComplete,
}: {
	activeSlide?: number;
	onComplete?: () => void;
}) {
	const [inputText, setInputText] = useState("");
	const [showAutocomplete, setShowAutocomplete] = useState(false);
	const [highlightedCmd, setHighlightedCmd] = useState(-1);
	const [messageSent, setMessageSent] = useState(false);
	const [thinking, setThinking] = useState(false);
	const [responded, setResponded] = useState(false);
	const [selectedTrack, setSelectedTrack] = useState<TrackInfo>(TRACKS[0]);

	const safeIndex = Math.min(activeSlide, slideConfigs.length - 1);
	const currentSlide = slideConfigs[safeIndex];

	// Filtered autocomplete
	const filteredAC = useMemo(() => {
		if (!showAutocomplete) return [];
		return autocompleteCommands;
	}, [showAutocomplete]);

	useEffect(() => {
		let cancelled = false;
		const timers: ReturnType<typeof setTimeout>[] = [];
		const intervals: ReturnType<typeof setInterval>[] = [];

		const schedule = (fn: () => void, delay: number) => {
			timers.push(
				setTimeout(() => {
					if (!cancelled) fn();
				}, delay)
			);
		};

		// Reset
		setInputText("");
		setShowAutocomplete(false);
		setHighlightedCmd(-1);
		setMessageSent(false);
		setThinking(false);
		setResponded(false);

		const runAnimation = () => {
			if (cancelled) return;

			let fullText = currentSlide.fullCommand;

			// Only randomize track if it's the /재생 command
			if (currentSlide.command === "/재생") {
				const randomTrack = TRACKS[Math.floor(Math.random() * TRACKS.length)];
				setSelectedTrack(randomTrack);
				const keyword = getTrackKeyword(randomTrack.title);
				fullText = `/재생 ${keyword}`;
			}

			setInputText("");
			setShowAutocomplete(false);
			setHighlightedCmd(-1);
			setMessageSent(false);
			setThinking(false);
			setResponded(false);

			let idx = 0;

			schedule(() => {
				const interval = setInterval(() => {
					if (cancelled) {
						clearInterval(interval);
						return;
					}

					idx++;
					const text = fullText.substring(0, idx);
					setInputText(text);

					// Show autocomplete on "/" and highlight the command
					if (idx === 1) {
						setShowAutocomplete(true);
						const cmdName = currentSlide.command.substring(1);
						const foundIdx = autocompleteCommands.findIndex(c => c.name === cmdName);
						setHighlightedCmd(foundIdx !== -1 ? foundIdx : 0);
					}

					if (idx >= fullText.length) {
						clearInterval(interval);

						// Send message
						schedule(() => {
							setMessageSent(true);
							setInputText("");
							setShowAutocomplete(false);
							setHighlightedCmd(-1);

							// Bot thinking
							schedule(() => {
								setThinking(true);

								// Bot responds
								schedule(() => {
									setThinking(false);
									setResponded(true);

									// Complete current slide and trigger next
									schedule(() => {
										if (onComplete) {
											onComplete();
										} else {
											runAnimation();
										}
									}, 6000); // 6 seconds before next animation
								}, 2000);
							}, 800);
						}, 800);
					}
				}, 120); // slightly faster typing so it doesn't feel too slow

				intervals.push(interval);
			}, 500);
		};

		runAnimation();

		return () => {
			cancelled = true;
			timers.forEach(clearTimeout);
			intervals.forEach(clearInterval);
		};
	}, [activeSlide, onComplete]);

	// Input display parsing
	const inputDisplay = useMemo(() => {
		if (!inputText) return null;
		if (inputText.startsWith("/")) {
			const spaceIdx = inputText.indexOf(" ");
			const cmd =
				spaceIdx > -1 ? inputText.substring(0, spaceIdx) : inputText;
			const args = spaceIdx > -1 ? inputText.substring(spaceIdx) : "";

			const hasArgs = args && args.trim().length > 0;
			const isTypingArgs = args !== "";

			const getParamName = (c: string) => {
				if (c.startsWith("/재생")) return "노래 제목";
				if (c.startsWith("/플레이리스트")) return "이름";
				return "옵션";
			};

			return (
				<div className="flex items-center gap-2 font-sans">
					<span className="text-primary font-bold">{cmd}</span>
					{isTypingArgs && (
						<span className="inline-flex items-center bg-muted/65 text-muted-foreground text-[11px] px-1.5 py-0.5 rounded border border-border/30 shrink-0 font-bold select-none leading-none">
							{getParamName(cmd)}
						</span>
					)}
					{hasArgs && (
						<span className="text-foreground font-medium">{args.trim()}</span>
					)}
				</div>
			);
		}
		return <span>{inputText}</span>;
	}, [inputText]);

	return (
		<div className="w-full max-w-[760px] h-[430px] rounded-2xl glass-panel border border-border/50 shadow-2xl overflow-hidden font-sans text-sm flex flex-row bg-background/40 backdrop-blur-xl">
			{/* ── Sidebar (Channel List) ── */}
			<div className="w-[180px] bg-black/30 border-r border-border/40 hidden xl:flex flex-col shrink-0">
				<div className="px-4 py-3 border-b border-border/40 font-bold text-foreground truncate shadow-sm flex items-center gap-2 h-[46px]">
					<div className="flex items-center gap-1.5 shrink-0 mr-1">
						<div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
						<div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
						<div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
					</div>
					<span className="truncate">시루 서버</span>
				</div>
				<div className="flex-1 p-2 space-y-0.5 overflow-y-auto">
					<div className="px-2 py-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors rounded-[4px] text-[13px] cursor-pointer flex items-center gap-1.5 font-medium">
						<Hash size={14} className="opacity-70" /> 공지사항
					</div>
					<div className="px-2 py-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors rounded-[4px] text-[13px] cursor-pointer flex items-center gap-1.5 font-medium">
						<Hash size={14} className="opacity-70" /> 일반
					</div>
					<div className="px-2 py-1.5 bg-white/10 text-foreground rounded-[4px] text-[13px] cursor-pointer flex items-center gap-1.5 font-bold">
						<Hash size={14} className="opacity-70" /> 라운지
					</div>
					<div className="px-2 py-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors rounded-[4px] text-[13px] cursor-pointer flex items-center gap-1.5 font-medium mt-4">
						<Volume2 size={14} className="opacity-70" /> 음악
					</div>
					<div className="px-1.5 py-1 flex items-center gap-2 ml-4 hover:bg-white/5 rounded-[4px] cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
						<div className="w-6 h-6 rounded-full relative overflow-hidden shrink-0 border-[1.5px] border-[#23A559]/70 bg-background">
							<Image
								src={BOT_AVATAR}
								alt="Siru"
								fill
								className="object-cover"
							/>
						</div>
						<span className="text-[12px] font-medium truncate">
							시루
						</span>
					</div>
				</div>
			</div>

			{/* ── Main Chat Area ── */}
			<div className="flex-1 flex flex-col min-w-0 bg-[#313338]/10">
				{/* ── Header ── */}
				<div className="px-5 py-3 border-b border-border/40 flex items-center gap-3 bg-muted/20 h-[46px]">
					<div className="xl:hidden flex items-center gap-1.5 shrink-0">
						<div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
						<div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
						<div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
					</div>
					<span className="flex gap-1">
						<Hash
							size={14}
							className="ml-2 text-muted-foreground/50"
						/>
						<span className="font-bold text-xs text-muted-foreground tracking-widest uppercase">
							라운지
						</span>
					</span>
				</div>

				{/* ── Chat Body ── */}
				<div className="p-5 flex-1 flex flex-col justify-end gap-4 overflow-hidden">
					{/* User Message */}
					<AnimatePresence mode="wait">
						{messageSent && (
							<m.div
								key={`user-${currentSlide.command}`}
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -10 }}
								transition={{
									type: "spring",
									stiffness: 400,
									damping: 25,
								}}
								className="flex gap-3 items-start"
							>
								<div className="w-9 h-9 rounded-full bg-primary/20 shrink-0 flex items-center justify-center overflow-hidden border border-primary/20">
									<span className="text-primary font-bold text-xs">
										사
									</span>
								</div>
								<div className="flex-1 space-y-1 mt-0.5">
									<div className="flex items-baseline gap-2">
										<span className="font-bold text-foreground">
											사용자
										</span>
										<span className="text-[10px] text-muted-foreground font-medium">
											방금 전
										</span>
									</div>
									<div className="text-foreground/90 font-medium font-sans">
										<span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold mr-1">
											{currentSlide.command}
										</span>
										{activeSlide === 0 ? (
											<span>{getTrackKeyword(selectedTrack.title)}</span>
										) : (
											currentSlide.args && <span>{currentSlide.args}</span>
										)}
									</div>
								</div>
							</m.div>
						)}
					</AnimatePresence>

					{/* Bot Thinking */}
					<AnimatePresence>
						{thinking && (
							<m.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								className="flex gap-3 items-center"
							>
								<div className="w-9 h-9 rounded-full shrink-0 relative overflow-hidden border border-primary/30 shadow-lg shadow-primary/20">
									<Image
										src={BOT_AVATAR}
										alt="Siru"
										fill
										className="object-cover"
									/>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-sm text-muted-foreground italic">
										시루봇이 입력 중
									</span>
									<div className="flex gap-1">
										{[0, 1, 2].map((i) => (
											<m.div
												key={i}
												className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
												animate={{
													opacity: [0.3, 1, 0.3],
												}}
												transition={{
													duration: 1,
													repeat: Infinity,
													delay: i * 0.2,
												}}
											/>
										))}
									</div>
								</div>
							</m.div>
						)}
					</AnimatePresence>

					{/* Bot Response */}
					<AnimatePresence mode="wait">
						{responded && (
							<m.div
								key={`bot-${currentSlide.command}`}
								initial={{ opacity: 0, y: 20, scale: 0.95 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: -20, scale: 0.95 }}
								transition={{
									type: "spring",
									stiffness: 300,
									damping: 25,
								}}
								className="flex gap-3 items-start"
							>
								<div className="w-9 h-9 rounded-full shrink-0 relative overflow-hidden border border-primary/30 shadow-lg shadow-primary/20">
									<Image
										src={BOT_AVATAR}
										alt="Siru"
										fill
										className="object-cover"
									/>
								</div>
								<div className="flex-1 space-y-2 mt-0.5 min-w-0">
									<div className="flex items-baseline gap-2">
										<span className="font-bold text-foreground">
											시루
										</span>
										<span className="px-1.5 py-0.5 rounded-[4px] bg-[#5865F2] text-white text-[10px] font-bold flex items-center gap-0.5 leading-none shrink-0">
											<svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4.5}>
												<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
											</svg>
											<span>앱</span>
										</span>
										<span className="text-[10px] text-muted-foreground font-medium">
											방금 전
										</span>
									</div>
									{renderEmbed(currentSlide.command, selectedTrack)}
								</div>
							</m.div>
						)}
					</AnimatePresence>
				</div>

				{/* ── Input Area ── */}
				<div className="relative border-t border-border/40">
					{/* Autocomplete popup */}
					<AnimatePresence>
						{showAutocomplete && filteredAC.length > 0 && (
							<m.div
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 8 }}
								transition={{ duration: 0.15 }}
								className="absolute bottom-full left-2 right-2 bg-background/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden mb-1"
							>
								<div className="py-1">
									{filteredAC.map((cmd, i) => (
										<div
											key={cmd.name}
											className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${i === highlightedCmd
												? "bg-primary/10"
												: ""
												}`}
										>
											<cmd.Icon
												size={16}
												className={
													i === highlightedCmd
														? "text-primary"
														: "text-muted-foreground/40"
												}
											/>
											<span
												className={`font-bold ${i === highlightedCmd
													? "text-primary"
													: "text-foreground/70"
													}`}
											>
												/{cmd.name}
											</span>
											<span className="text-muted-foreground/60 text-xs">
												{cmd.desc}
											</span>
										</div>
									))}
								</div>
							</m.div>
						)}
					</AnimatePresence>

					{/* Input field */}
					<div className="px-5 py-3.5 flex items-center gap-2 bg-muted/10">
						<div className="flex-1 flex items-center text-sm min-h-[20px]">
							{inputDisplay || (
								<span className="text-muted-foreground/30">
									메시지를 입력하세요
								</span>
							)}
							{!messageSent && (
								<m.span
									className="inline-block w-[2px] h-4 bg-primary ml-0.5 rounded-full"
									animate={{ opacity: [1, 0] }}
									transition={{
										repeat: Infinity,
										duration: 0.8,
									}}
								/>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
