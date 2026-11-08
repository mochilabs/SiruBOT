"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, ListMusic, MousePointer2, Pause, Repeat, SkipBack, SkipForward, Square, Volume2 } from "lucide-react";

import { motionBase, motionFast } from "@/components/motion/durations";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const BOT_AVATAR = "/images/profile.png";

interface TrackInfo {
	title: string;
	artist: string;
	duration: number;
	thumbnail: string;
}

interface SlideConfig {
	command: string;
	args: string;
	/** 응답 임베드 안에서 커서가 눌러볼 버튼이 있는지 — [data-target]으로 찾아요 */
	hasTarget: boolean;
}

export const slideConfigs: SlideConfig[] = [
	{ command: "/재생", args: "Lemon", hasTarget: true },
	{ command: "/현재곡", args: "", hasTarget: true },
	{ command: "/채팅", args: "비 오는 날 들을 노래 추천해줘", hasTarget: true },
	{ command: "/추천", args: "", hasTarget: false },
	{ command: "/날씨", args: "서울", hasTarget: false },
	{ command: "/플레이리스트", args: "재생 내 노래모음", hasTarget: false },
	{ command: "/주사위", args: "개수:2", hasTarget: true },
	{ command: "/대기열", args: "", hasTarget: true },
];

const yt = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

const TRACKS: TrackInfo[] = [
	{ title: 'I wish I had been midnight. "Justice" MV', artist: "ずっと真夜中でいいのに。", duration: 280, thumbnail: yt("7kUbX4DoZoc") },
	{ title: "Gurenge", artist: "LiSA", duration: 238, thumbnail: yt("MpYy6wwqxoo") },
	{ title: "아이돌 (Idol)", artist: "YOASOBI", duration: 213, thumbnail: yt("ZRtdQ81jPUQ") },
	{ title: "Night Dancer", artist: "imase", duration: 210, thumbnail: yt("kagoEGKHZvU") },
	{ title: "Lemon", artist: "米津玄師", duration: 255, thumbnail: yt("SX_ViT4Ra7k") },
	{ title: "Dynamite", artist: "BTS (방탄소년단)", duration: 199, thumbnail: yt("gdZLi9oWNZg") },
	{ title: "Pretender", artist: "Official髭男dism", duration: 330, thumbnail: yt("TQ8WlA2GXbk") },
	{ title: "Shape of You", artist: "Ed Sheeran", duration: 263, thumbnail: yt("JGwWNGJdvx8") },
];

const [JUSTICE, GURENGE, IDOL, NIGHT_DANCER, LEMON, DYNAMITE, PRETENDER, SHAPE] = TRACKS;

const COMMAND_MENTION = "bg-discord-primary/20 px-1 rounded-sm text-discord-light";

// 데모용 더미 트랙은 duration을 "초"로 담아요 — lib/format formatDuration(밀리초 입력)과
// 단위가 달라 여기서만 로컬 포매터를 써요.
const formatDuration = (seconds: number) => {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

/* ── 실제 Components V2 컨테이너를 흉내 내는 조각들 ───────────────────────────── */

/** 봇 기본 accent 색 — packages/utils/src/constants.ts의 DEFAULT_COLOR(0xff85c0)와 같은 값이에요. 대시보드는 utils 루트 barrel을 못 써서 값만 옮겨 적어요. */
const BOT_ACCENT_COLOR = "#ff85c0";

/** Container — 좌측 accent 바 + 둥근 면. 실제 봇의 createContainer와 같은 모양 */
function Container({ children }: { children: ReactNode }) {
	return (
		<div className="w-full max-w-md space-y-2.5 rounded-lg border-l-4 bg-discord-embed p-3.5" style={{ borderLeftColor: BOT_ACCENT_COLOR }}>
			{children}
		</div>
	);
}

/** Section — 텍스트 여러 줄 + 우측 썸네일 accessory */
function Section({ children, thumbnail }: { children: ReactNode; thumbnail?: string }) {
	return (
		<div className="flex items-start gap-3">
			<div className="min-w-0 flex-1 space-y-1">{children}</div>
			{thumbnail ? (
				<div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
					<Image src={thumbnail} alt="" fill className="object-cover" sizes="64px" unoptimized />
				</div>
			) : null}
		</div>
	);
}

/** `-#` subtext */
function Subtext({ children }: { children: ReactNode }) {
	return <p className="text-2xs leading-snug text-discord-text-muted">{children}</p>;
}

/** `###` heading */
function Heading({ children }: { children: ReactNode }) {
	return <p className="text-sm font-bold leading-snug text-discord-text">{children}</p>;
}

function TrackTitle({ children }: { children: ReactNode }) {
	return <span className="underline decoration-discord-text/20 underline-offset-2">{children}</span>;
}

/** Separator — 얇은 구분선 */
function Separator() {
	return <div className="h-px bg-discord-btn-active/70" />;
}

/** 봇 푸터: `-# 📡 main 🔊 100% ℹ️ 시루` */
function Footer({ left, right }: { left: string; right?: string }) {
	return (
		<div className="flex items-center justify-between text-2xs text-discord-text-muted">
			<span>{left}</span>
			{right ? <span>{right}</span> : null}
		</div>
	);
}

/** ActionRow 버튼 — Secondary 스타일. 커서가 누를 대상이면 data-target을 달아요 */
function DiscordButton({ children, target, pressed, className }: { children: ReactNode; target?: boolean; pressed?: boolean; className?: string }) {
	return (
		<span
			data-target={target ? "" : undefined}
			aria-hidden
			className={cn(
				"flex h-8 min-w-10 items-center justify-center gap-1.5 rounded-md px-2.5 text-2xs font-semibold text-discord-text transition-colors duration-fast",
				pressed ? "bg-discord-btn-hover" : "bg-discord-btn-active",
				className
			)}
		>
			{children}
		</span>
	);
}

/* ── 슬라이드별 응답 ─────────────────────────────────────────────────────────── */

/** /재생 — 곡 추가 컨테이너. 아래에 "대기열 보기" 버튼이 붙어요 */
function PlayResult({ clicked }: { clicked: boolean }) {
	return (
		<Container>
			<Subtext>🎵 노래를 대기열 4번에 추가했어요.</Subtext>
			<Section thumbnail={LEMON.thumbnail}>
				<Heading>
					<TrackTitle>{LEMON.title}</TrackTitle>
					<span className="ml-1.5 align-middle text-2xs font-medium tabular-nums text-discord-text-muted">({formatDuration(LEMON.duration)})</span>
				</Heading>
				<Subtext>
					💿 {LEMON.artist} <span className={COMMAND_MENTION}>@사용자</span>
				</Subtext>
				<Subtext>대기열 3곡 남음 · 12:36 재생 예정</Subtext>
			</Section>
			<div className="flex">
				<DiscordButton target pressed={clicked} className="px-3">
					<ListMusic size={12} aria-hidden />
					대기열 보기
				</DiscordButton>
			</div>
		</Container>
	);
}

/** /현재곡 — 컨트롤러. 다음곡 버튼을 누르면 곡이 바뀌어요 */
function NowPlayingResult({ clicked }: { clicked: boolean }) {
	const track = clicked ? DYNAMITE : JUSTICE;
	const position = clicked ? 0 : 43;
	return (
		<Container>
			<Subtext>
				<span className={COMMAND_MENTION}>#음악-라운지</span> 에서 재생 중
			</Subtext>
			<Section thumbnail={track.thumbnail}>
				<AnimatePresence mode="wait" initial={false}>
					<m.div key={track.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionFast }} className="space-y-1">
						<Heading>
							<TrackTitle>{track.title}</TrackTitle>
						</Heading>
						<Subtext>
							💿 {track.artist} <span className={COMMAND_MENTION}>@사용자</span>
						</Subtext>
						<div className="flex items-center gap-2 pt-0.5 text-2xs tabular-nums text-discord-text-muted">
							<span>{formatDuration(position)}</span>
							<div className="h-1 flex-1 overflow-hidden rounded-full bg-discord-btn-active">
								<div className="h-full rounded-full bg-primary-control" style={{ width: `${(position / track.duration) * 100}%` }} />
							</div>
							<span>{formatDuration(track.duration)}</span>
						</div>
					</m.div>
				</AnimatePresence>
			</Section>
			<div className="flex items-center gap-2">
				<DiscordButton>
					<SkipBack size={13} fill="currentColor" aria-hidden />
				</DiscordButton>
				<DiscordButton>
					<Pause size={13} fill="currentColor" aria-hidden />
				</DiscordButton>
				<DiscordButton target pressed={clicked}>
					<SkipForward size={13} fill="currentColor" aria-hidden />
				</DiscordButton>
				<DiscordButton>
					<Square size={12} fill="currentColor" aria-hidden />
				</DiscordButton>
				<DiscordButton>
					<Repeat size={13} aria-hidden />
				</DiscordButton>
			</div>
			<Separator />
			<Footer left="📡 main 🔊 100%" right="다음 곡 3곡 대기 중" />
		</Container>
	);
}

/** /추천 — 추천곡을 대기열에 넣고 번호 리스트로 보여줘요 */
function RecommendResult() {
	const picks = [IDOL, NIGHT_DANCER, PRETENDER, SHAPE];
	return (
		<Container>
			<Heading>✨ 추천곡 {picks.length}곡을 대기열에 추가했어요.</Heading>
			<Separator />
			<ol className="space-y-1">
				{picks.map((track, index) => (
					<li key={track.title} className="flex items-baseline gap-2 text-xs text-discord-text">
						<span className="w-3 shrink-0 text-2xs tabular-nums text-discord-text-muted">{index + 1}</span>
						<span className="min-w-0 flex-1 truncate font-semibold">{track.title}</span>
						<span className="hidden shrink-0 text-2xs text-discord-text-muted sm:inline">{track.artist}</span>
						<span className="shrink-0 text-2xs tabular-nums text-discord-text-muted">{formatDuration(track.duration)}</span>
					</li>
				))}
			</ol>
			<Footer left="📡 main 🔊 100%" />
		</Container>
	);
}

/** /플레이리스트 재생 — 곡 일괄 추가 + 미리보기 */
function PlaylistResult() {
	const preview = [JUSTICE, GURENGE, DYNAMITE, LEMON];
	const total = preview.reduce((acc, track) => acc + track.duration, 0);
	return (
		<Container>
			<Section thumbnail={preview[0].thumbnail}>
				<Heading>📝 재생목록의 노래 12곡이 추가되었어요.</Heading>
				<Subtext>
					<strong className="font-semibold text-discord-text">내 노래모음</strong> · 약 {Math.round((total * 3) / 60)}분
				</Subtext>
			</Section>
			<Separator />
			<div className="space-y-1">
				<Subtext>🎵 추가된 곡 미리보기</Subtext>
				{preview.map((track, index) => (
					<p key={track.title} className="flex items-baseline gap-1.5 text-xs leading-snug text-discord-text">
						<span className="shrink-0 rounded-sm bg-discord-btn-active px-1 text-2xs tabular-nums text-discord-text-muted">#{index + 1}</span>
						<span className="min-w-0 flex-1 truncate font-medium">{track.title}</span>
						<span className="shrink-0 text-2xs tabular-nums text-discord-text-muted">{formatDuration(track.duration)}</span>
					</p>
				))}
				<Subtext>…외 8곡</Subtext>
			</div>
			<Footer left="📡 main 🔊 100%" />
		</Container>
	);
}

/** /대기열 — 목록 + 페이지 버튼. 다음 페이지를 누르면 목록이 넘어가요 */
function QueueResult({ clicked }: { clicked: boolean }) {
	const pages = [
		[GURENGE, IDOL, NIGHT_DANCER],
		[LEMON, DYNAMITE, PRETENDER],
	];
	const page = clicked ? 1 : 0;
	return (
		<Container>
			<Heading>📋 대기열 · 총 7곡</Heading>
			<Subtext>
				지금 재생 중 · <strong className="font-semibold text-discord-text">{JUSTICE.title}</strong>
			</Subtext>
			<Separator />
			<AnimatePresence mode="wait" initial={false}>
				<m.ol key={page} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionFast }} className="space-y-1">
					{pages[page].map((track, index) => (
						<li key={track.title} className="flex items-baseline gap-2 text-xs text-discord-text">
							<span className="w-3 shrink-0 text-2xs tabular-nums text-discord-text-muted">{page * 3 + index + 1}</span>
							<span className="min-w-0 flex-1 truncate font-semibold">{track.title}</span>
							<span className="shrink-0 text-2xs tabular-nums text-discord-text-muted">{formatDuration(track.duration)}</span>
						</li>
					))}
				</m.ol>
			</AnimatePresence>
			<div className="flex items-center gap-2">
				<DiscordButton>
					<ChevronLeft size={14} aria-hidden />
				</DiscordButton>
				<span className="text-2xs tabular-nums text-discord-text-muted">{page + 1} / 2</span>
				<DiscordButton target pressed={clicked}>
					<ChevronRight size={14} aria-hidden />
				</DiscordButton>
			</div>
		</Container>
	);
}

/** /채팅 — AI 응답. 버튼을 누르면 추천곡이 대기열에 들어가요 */
function ChatResult({ clicked }: { clicked: boolean }) {
	const picks = [
		{ track: LEMON, note: "가라앉은 분위기가 빗소리와 잘 어울려요." },
		{ track: PRETENDER, note: "잔잔하게 시작해서 끝까지 차분히 이어져요." },
	];
	return (
		<Container>
			<p className="text-sm leading-snug text-discord-text">비 오는 날엔 차분한 곡이 잘 어울려요. 이런 곡은 어때요?</p>
			<ul className="space-y-1.5">
				{picks.map(({ track, note }) => (
					<li key={track.title} className="text-xs leading-snug text-discord-text">
						<strong className="font-semibold">{track.title}</strong>
						<span className="text-discord-text-muted"> ({track.artist})</span>
						<br />
						<span className="text-discord-text-muted">{note}</span>
					</li>
				))}
			</ul>
			<div className="flex">
				<DiscordButton target pressed={clicked} className="px-3">
					{clicked ? <Check size={12} aria-hidden /> : <ListMusic size={12} aria-hidden />}
					{clicked ? "2곡을 대기열에 추가했어요" : "둘 다 대기열에 추가"}
				</DiscordButton>
			</div>
			<Separator />
			<Footer left="💬 대화 기록은 채널 단위로 기억해요" />
		</Container>
	);
}

/** /날씨 — 현재 날씨와 예보. 데모용 값이에요 */
function WeatherResult() {
	const forecast = [
		{ day: "내일", icon: "⛅", high: 20, low: 12 },
		{ day: "모레", icon: "🌧️", high: 17, low: 11 },
		{ day: "토요일", icon: "☀️", high: 22, low: 13 },
	];
	return (
		<Container>
			<Subtext>서울특별시 현재 날씨</Subtext>
			<div className="flex items-end gap-3">
				<span className="text-4xl font-black leading-none tabular-nums text-discord-text">18°</span>
				<div className="pb-0.5">
					<p className="text-sm font-bold leading-snug text-discord-text">☀️ 맑음</p>
					<Subtext>체감 17° · 습도 45% · 바람 2.1m/s</Subtext>
				</div>
			</div>
			<Separator />
			<div className="grid grid-cols-3 gap-2">
				{forecast.map((day) => (
					<div key={day.day} className="rounded-md bg-discord-btn-active/40 px-2 py-1.5 text-center">
						<p className="text-2xs text-discord-text-muted">{day.day}</p>
						<p className="text-base leading-snug">{day.icon}</p>
						<p className="text-2xs tabular-nums text-discord-text">
							{day.high}° <span className="text-discord-text-muted">/ {day.low}°</span>
						</p>
					</div>
				))}
			</div>
		</Container>
	);
}

/** /주사위 — 2d6. 버튼을 누르면 다시 굴려 값이 바뀌어요 */
function DiceResult({ clicked }: { clicked: boolean }) {
	const [a, b] = clicked ? [6, 4] : [3, 5];
	return (
		<Container>
			<Subtext>🎲 주사위를 굴렸어요 (2d6)</Subtext>
			<AnimatePresence mode="wait" initial={false}>
				<m.p
					key={`${a}-${b}`}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0 }}
					transition={{ duration: motionFast }}
					className="text-2xl font-black tabular-nums text-discord-text"
				>
					{a} + {b} = <span className="text-discord-light">{a + b}</span>
				</m.p>
			</AnimatePresence>
			<div className="flex">
				<DiscordButton target pressed={clicked} className="px-3">
					🎲 다시 굴리기
				</DiscordButton>
			</div>
		</Container>
	);
}

function commandResult(slide: SlideConfig, clicked: boolean): ReactNode {
	switch (slide.command) {
		case "/재생":
			return <PlayResult clicked={clicked} />;
		case "/추천":
			return <RecommendResult />;
		case "/플레이리스트":
			return <PlaylistResult />;
		case "/대기열":
			return <QueueResult clicked={clicked} />;
		case "/채팅":
			return <ChatResult clicked={clicked} />;
		case "/날씨":
			return <WeatherResult />;
		case "/주사위":
			return <DiceResult clicked={clicked} />;
		default:
			return <NowPlayingResult clicked={clicked} />;
	}
}

/* ── 타임라인 ───────────────────────────────────────────────────────────────── */

const PHASES = ["typing", "sent", "thinking", "reply"] as const;
type Phase = (typeof PHASES)[number];

const TYPE_MS = 80;
const CURSOR_MOVE_S = 0.7;
const HOLD_AFTER_CLICK_MS = 2600;
const HOLD_NO_TARGET_MS = 3800;

interface CursorState {
	x: number;
	y: number;
	visible: boolean;
	pressed: boolean;
	/** 클릭할 때마다 올라가요 — 파문 애니메이션의 key */
	tick: number;
}

interface DiscordCommandAnimationProps {
	activeSlide?: number;
	/** false면 시작하지 않고 대기해요 (히어로가 화면에 들어오기 전) */
	active?: boolean;
	/** 마지막 장면을 보여주고 잠시 머문 뒤 호출돼요. 부모가 다음 예시로 넘길 때 써요. */
	onDone?: () => void;
}

/**
 * 가짜 마우스 커서가 입력창을 눌러 포커스 → 명령어 타이핑 → 전송 → 봇 "생각 중" → 응답 →
 * 응답 속 버튼을 눌러보는 순서로 재생해요. 타이머는 effect 하나가 맡고, 슬라이드가 바뀌면 처음부터 다시 시작해요.
 * 커서 좌표는 실제 요소(입력창, [data-target])를 재서 정확히 그 위에 멈춰요.
 */
export function DiscordCommandAnimation({ activeSlide = 0, active = true, onDone }: DiscordCommandAnimationProps) {
	const safeIndex = Math.min(Math.max(activeSlide, 0), slideConfigs.length - 1);
	const currentSlide = slideConfigs[safeIndex];
	const shouldReduce = useReducedMotion();
	const fullText = currentSlide.args ? `${currentSlide.command} ${currentSlide.args}` : currentSlide.command;

	const [phase, setPhase] = useState<Phase>("typing");
	const [typed, setTyped] = useState(0);
	const [focused, setFocused] = useState(false);
	const [clicked, setClicked] = useState(false);
	const [cursor, setCursor] = useState<CursorState>({ x: 0, y: 0, visible: false, pressed: false, tick: 0 });
	const cardRef = useRef<HTMLDivElement>(null);
	const composerRef = useRef<HTMLDivElement>(null);
	const onDoneRef = useRef(onDone);
	onDoneRef.current = onDone;

	useEffect(() => {
		if (!active) return undefined;
		if (shouldReduce) {
			setPhase("reply");
			setTyped(fullText.length);
			setFocused(false);
			setClicked(false);
			return undefined;
		}

		setPhase("typing");
		setTyped(0);
		setFocused(false);
		setClicked(false);

		const timers: ReturnType<typeof setTimeout>[] = [];
		const at = (ms: number, fn: () => void) => {
			timers.push(setTimeout(fn, ms));
		};

		/** 요소 중심 좌표(카드 기준). 아이콘 끝이 요소 위에 오도록 살짝 안쪽으로 잡아요 */
		const center = (el: Element | null | undefined) => {
			const card = cardRef.current;
			if (!card || !el) return null;
			const c = card.getBoundingClientRect();
			const r = el.getBoundingClientRect();
			return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2 };
		};
		const moveTo = (el: Element | null | undefined) => {
			const p = center(el);
			if (p) setCursor((prev) => ({ ...prev, ...p, visible: true }));
		};
		const click = () => {
			setCursor((prev) => ({ ...prev, pressed: true, tick: prev.tick + 1 }));
			at(160, () => setCursor((prev) => ({ ...prev, pressed: false })));
		};

		// 커서가 오른쪽 아래 바깥에서 들어와요
		const card = cardRef.current;
		if (card) setCursor({ x: card.clientWidth - 40, y: card.clientHeight - 6, visible: false, pressed: false, tick: 0 });

		let t = 350;
		at(t, () => moveTo(composerRef.current));
		t += CURSOR_MOVE_S * 1000 + 150;
		at(t, () => {
			click();
			setFocused(true);
		});
		t += 450;

		for (let i = 1; i <= fullText.length; i += 1) {
			at(t + i * TYPE_MS, () => setTyped(i));
		}
		t += fullText.length * TYPE_MS + 450;

		at(t, () => {
			setPhase("sent");
			setFocused(false);
			setCursor((prev) => ({ ...prev, visible: false }));
		});
		t += 650;
		at(t, () => setPhase("thinking"));
		t += 1100;
		at(t, () => setPhase("reply"));
		t += 900;

		if (currentSlide.hasTarget) {
			at(t, () => moveTo(cardRef.current?.querySelector("[data-target]")));
			t += CURSOR_MOVE_S * 1000 + 250;
			at(t, () => {
				click();
				setClicked(true);
			});
			t += HOLD_AFTER_CLICK_MS;
			at(t - 700, () => setCursor((prev) => ({ ...prev, visible: false })));
		} else {
			t += HOLD_NO_TARGET_MS;
		}
		at(t, () => onDoneRef.current?.());

		return () => timers.forEach(clearTimeout);
	}, [safeIndex, active, shouldReduce, fullText, currentSlide.hasTarget]);

	const reached = (target: Phase) => PHASES.indexOf(phase) >= PHASES.indexOf(target);
	const composing = phase === "typing";
	const commandLength = currentSlide.command.length;
	const typedCommand = fullText.slice(0, Math.min(typed, commandLength));
	const typedArgs = fullText.slice(commandLength, typed);

	return (
		<Card ref={cardRef} variant="raised" padding="none" className="relative h-full gap-0 overflow-hidden border-0 bg-discord-bg font-sans">
			<div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-3">
				<Volume2 size={15} className="text-discord-text-muted" aria-hidden />
				<span className="text-sm font-semibold text-discord-text">음악-라운지</span>
			</div>

			{/* 메시지 영역 — flex-1로 높이를 채워 응답이 나와도 카드가 늘어나지 않아요.
			    aria-live 미사용: 데모가 자동 순환해 스크린 리더를 계속 방해해요. */}
			<div className="min-h-[400px] flex-1 space-y-4 p-4 sm:p-6 lg:min-h-[440px]">
				{reached("sent") && (
					<m.div
						key={`user-${safeIndex}`}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: motionFast, ease: "easeOut" }}
						className="flex gap-3"
					>
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-discord-btn-active text-xs font-bold text-discord-text">사</div>
						<div className="min-w-0">
							<div className="flex items-baseline gap-2">
								<span className="text-sm font-semibold text-discord-text">사용자</span>
								<span className="text-2xs text-discord-text-muted">오후 8:12</span>
							</div>
							<p className="mt-1 text-sm text-discord-text">
								<span className={COMMAND_MENTION}>{currentSlide.command}</span>
								{currentSlide.args && <span> {currentSlide.args}</span>}
							</p>
						</div>
					</m.div>
				)}

				{reached("thinking") && (
					<m.div
						key={`bot-${safeIndex}`}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: motionFast, ease: "easeOut" }}
						className="flex gap-3"
					>
						<div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
							<Image src={BOT_AVATAR} alt="시루" fill className="object-cover" sizes="36px" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="mb-1.5 flex items-center gap-2">
								<span className="text-sm font-semibold text-discord-text">시루</span>
								<span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-primary-control-text">앱</span>
								<span className="text-2xs text-discord-text-muted">오후 8:12</span>
							</div>
							{phase === "thinking" ? (
								<p className="flex items-center gap-1 text-sm text-discord-text-muted">
									시루가 생각하는 중
									<span aria-hidden className="flex gap-0.5">
										{[0, 1, 2].map((dot) => (
											<span key={dot} className="h-1 w-1 rounded-full bg-discord-text-muted motion-safe:animate-pulse" style={{ animationDelay: `${dot * 180}ms` }} />
										))}
									</span>
								</p>
							) : (
								<m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: motionBase, ease: "easeOut" }}>
									{commandResult(currentSlide, clicked)}
								</m.div>
							)}
						</div>
					</m.div>
				)}
			</div>

			{/* 입력창 — 커서가 눌러 포커스하고, 전송하면 비워져요 */}
			<div className="border-t border-discord-btn-active p-3 sm:px-5">
				<div
					ref={composerRef}
					className={cn(
						"flex min-h-10 items-center rounded-control bg-discord-btn-active/60 px-3 py-2 text-sm text-discord-text transition-shadow duration-fast",
						focused && "ring-1 ring-discord-primary"
					)}
				>
					{composing && typed > 0 ? (
						<span className="min-w-0 truncate">
							<span className={COMMAND_MENTION}>{typedCommand}</span>
							{typedArgs}
						</span>
					) : (
						<span className="text-discord-text-muted">#음악-라운지에 메시지 보내기</span>
					)}
					{focused && composing && <span aria-hidden className="ml-px h-4 w-0.5 shrink-0 bg-discord-text motion-safe:animate-pulse" />}
				</div>
			</div>

			{/* 가짜 마우스 커서 — 장식이라 스크린리더에서 숨겨요 */}
			<m.div
				aria-hidden
				className="pointer-events-none absolute top-0 left-0 z-10"
				initial={false}
				animate={{ x: cursor.x, y: cursor.y, opacity: cursor.visible ? 1 : 0 }}
				transition={{ x: { duration: CURSOR_MOVE_S, ease: "easeInOut" }, y: { duration: CURSOR_MOVE_S, ease: "easeInOut" }, opacity: { duration: 0.2 } }}
			>
				<m.span
					key={cursor.tick}
					className="absolute -top-4 -left-4 h-8 w-8 rounded-full border-2 border-primary-control"
					initial={{ scale: 0.3, opacity: cursor.tick === 0 ? 0 : 1 }}
					animate={{ scale: 1.6, opacity: 0 }}
					transition={{ duration: 0.55, ease: "easeOut" }}
				/>
				<m.span className="block origin-top-left" animate={{ scale: cursor.pressed ? 0.8 : 1 }} transition={{ duration: 0.12 }}>
					<MousePointer2 size={26} strokeWidth={1.75} className="fill-foreground stroke-background drop-shadow-md" />
				</m.span>
			</m.div>
		</Card>
	);
}
