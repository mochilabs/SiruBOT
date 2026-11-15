"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { ChevronDown, Gamepad2, type LucideIcon, MessageCircle, Music2, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 명령어 섹션: Discord 슬래시 자동완성 팝업을 흉내 내요. 카테고리 탭으로 고르면 대표 명령어 몇 개만 보이고,
 * 입력창에 선택한 명령어가 타이핑돼요. 나머지는 "더 보기"로 펼쳐요(전체 목록은 문서처럼 읽히지 않게 접어 둬요).
 *
 * cmd/desc는 봇 커맨드 정의의 **ko 로캘 문구를 그대로** 옮겨 적어요 —
 * `apps/bot/src/discord/commands/*.ts`, `apps/bot/src/features/<name>/discord/commands/*.ts`의 `setNameLocalizations({ ko })` / `setDescriptionLocalizations({ ko })`,
 * 서브커맨드는 `subcommands/*.ts`의 `name`/`ko`/`description`. 봇 문구를 바꾸면 이 목록도 함께 갱신하세요.
 *
 * 톤: 사용자에게 말을 거는 해요체 존댓말, 마침표 유지, 기능만 서술하고 광고문구는 넣지 않아요.
 */

interface CommandCard {
	cmd: string;
	desc: string;
}

const MUSIC_COMMANDS: CommandCard[] = [
	{ cmd: "/재생", desc: "음성 채널에서 노래를 재생해요." },
	{ cmd: "/건너뛰기", desc: "현재 재생 중인 곡을 건너뛰어요." },
	{ cmd: "/음악 검색", desc: "곡을 검색해서 5개 결과 중 골라 재생해요." },
	{ cmd: "/음악 일시정지", desc: "현재 곡을 일시정지하거나 다시 재생해요." },
	{ cmd: "/음악 이전곡", desc: "이전에 재생한 곡을 다시 재생해요." },
	{ cmd: "/음악 정지", desc: "대기열을 정리하고 노래를 멈춰요." },
	{ cmd: "/음악 시간이동", desc: "현재 곡의 특정 시간으로 이동해요." },
	{ cmd: "/음악 볼륨", desc: "플레이어의 볼륨을 설정해요." },
	{ cmd: "/음악 반복", desc: "반복 모드를 설정해요." },
	{ cmd: "/음악 자동재생", desc: "추천 곡 자동재생을 켜거나 꺼요." },
	{ cmd: "/음악 필터", desc: "오디오 필터를 적용하거나 해제해요." },
	{ cmd: "/현재곡", desc: "현재 재생 중인 곡의 정보를 보여줘요." },
	{ cmd: "/대기열", desc: "음악 대기열을 보거나 관리해요." },
	{ cmd: "/음악 가사", desc: "곡의 가사를 검색해요." },
	{ cmd: "/음악 추천", desc: "현재 곡 기반의 추천 곡을 대기열에 추가해요." },
	{ cmd: "/음악 재생기록", desc: "이 서버에서 재생된 최근 음악 기록을 보여줘요." },
	{ cmd: "/플레이리스트", desc: "커스텀 플레이리스트를 관리해요." },
	{ cmd: "/즐겨찾기", desc: "즐겨찾기한 노래를 관리해요." },
	{ cmd: "/믹서", desc: "갭리스 재생과 크로스페이드를 설정해요." }
];

const LIFE_COMMANDS: CommandCard[] = [
	{ cmd: "/채팅", desc: "AI와 대화해요. 대화 기록은 채널 단위로 기억해요." },
	{ cmd: "/채팅설정", desc: "서버와 채널의 AI 채팅 설정을 관리해요." },
	{ cmd: "/날씨", desc: "현재 날씨와 예보를 확인해요." },
	{ cmd: "/택배", desc: "택배 배송 상태를 조회해요." },
	{ cmd: "/프로필", desc: "프로필(생일·별자리·음악 기록)을 확인하고 관리해요." }
];

const UTILITY_COMMANDS: CommandCard[] = [
	{ cmd: "/정보", desc: "봇·서버·유저 정보를 보여줘요." },
	{ cmd: "/정보 봇", desc: "봇 정보와 통계를 보여줘요." },
	{ cmd: "/정보 서버", desc: "현재 서버 정보를 보여줘요." },
	{ cmd: "/아바타", desc: "유저 아바타를 크게 보여줘요." },
	{ cmd: "/도움말", desc: "사용 가능한 명령어 목록을 보여줘요." },
	{ cmd: "/설정", desc: "봇의 서버 설정을 관리해요." },
	{ cmd: "/tts", desc: "채널 낭독 on/off와 내 TTS 설정을 관리해요." },
	{ cmd: "/tts 말하기", desc: "음성 채널에 문장을 읽어줘요. 음악이 재생 중이면 곡 위에 겹쳐요." },
	{ cmd: "/개인정보", desc: "내 데이터를 확인하거나 지워요. (AI 기억·프로필·게임 전적)" },
	{ cmd: "/청소", desc: "채널의 최근 메시지를 일괄 삭제해요. (14일 이내)" },
	{ cmd: "/초대", desc: "봇 초대 링크를 보여줘요." },
	{ cmd: "/핑", desc: "봇과 각 구간의 연결 상태를 보여드려요." }
];

const GAME_COMMANDS: CommandCard[] = [
	{ cmd: "/출석", desc: "매일 출석 체크를 해요. 연속 출석하면 스트릭이 쌓여요." },
	{ cmd: "/주사위", desc: "주사위를 굴려요. 기본은 1d6이고, 개수·면·보정을 옵션으로 지정할 수 있어요." },
	{ cmd: "/가위바위보", desc: "가위바위보로 봇과 승부해요." },
	{ cmd: "/숫자맞히기", desc: "1~100 숫자를 맞히는 게임이에요. 6번 안에 맞히면 이겨요!" },
	{ cmd: "/오하아사", desc: "일본 아사히 방송의 오늘 별자리 운세를 확인해요." }
];

type CategoryKey = "music" | "life" | "utility" | "games";

const CATEGORIES: Array<{ key: CategoryKey; label: string; icon: LucideIcon; commands: CommandCard[] }> = [
	{ key: "music", label: "음악", icon: Music2, commands: MUSIC_COMMANDS },
	{ key: "life", label: "채팅·생활", icon: MessageCircle, commands: LIFE_COMMANDS },
	{ key: "utility", label: "유틸리티", icon: Wrench, commands: UTILITY_COMMANDS },
	{ key: "games", label: "게임", icon: Gamepad2, commands: GAME_COMMANDS }
];

const COLLAPSED_COUNT = 6;
const TYPE_MS = 70;
const HOLD_MS = 1800;

export function CommandListSection() {
	const [activeCategory, setActiveCategory] = useState<CategoryKey>("music");
	const [selected, setSelected] = useState(0);
	const [typed, setTyped] = useState(0);
	const [expanded, setExpanded] = useState(false);
	const [autoPlay, setAutoPlay] = useState(true);
	const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });

	const active = CATEGORIES.find((category) => category.key === activeCategory) ?? CATEGORIES[0];
	const visible = expanded ? active.commands : active.commands.slice(0, COLLAPSED_COUNT);
	const current = visible[Math.min(selected, visible.length - 1)];
	const hiddenCount = active.commands.length - COLLAPSED_COUNT;

	// 선택된 명령어를 입력창에 한 글자씩 타이핑하고, 다 치면 잠시 머문 뒤 다음 명령어로 넘어가요
	useEffect(() => {
		if (!inView) return undefined;
		const fullLength = current.cmd.length - 1;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setTyped(fullLength);
			return undefined;
		}
		setTyped(0);
		const typer = setInterval(() => setTyped((count) => Math.min(count + 1, fullLength)), TYPE_MS);
		const advance = autoPlay ? setTimeout(() => setSelected((index) => (index + 1) % Math.min(visible.length, COLLAPSED_COUNT)), fullLength * TYPE_MS + HOLD_MS) : undefined;
		return () => {
			clearInterval(typer);
			if (advance) clearTimeout(advance);
		};
	}, [inView, current.cmd, autoPlay, visible.length]);

	const handleCategory = (key: CategoryKey) => {
		setActiveCategory(key);
		setSelected(0);
		setExpanded(false);
		setAutoPlay(true);
	};

	const handlePick = (index: number) => {
		setSelected(index);
		setAutoPlay(false);
	};

	return (
		<section id="commands" className="py-14 sm:py-20 lg:py-24">
			<div className="mx-auto w-full max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
				<div className="space-y-3">
					<h2 className="break-keep text-balance text-2xl font-black tracking-tighter text-foreground sm:text-4xl">명령어는 슬래시 한 번으로 시작해요.</h2>
					<p className="break-keep text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
						음악 재생부터 AI 대화, 게임, 각종 편의 기능까지. 직관적인 슬래시 커맨드로 간편하게 이용하세요.
					</p>
				</div>

				<div ref={ref} className="space-y-3">
					<div role="tablist" aria-label="명령어 카테고리" className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
						{CATEGORIES.map((category) => {
							const isActive = category.key === activeCategory;
							return (
								<button
									key={category.key}
									type="button"
									role="tab"
									aria-selected={isActive}
									onClick={() => handleCategory(category.key)}
									className={cn(
										"flex shrink-0 cursor-pointer items-center gap-1.5 rounded-control px-3 py-2 text-sm font-bold transition-colors duration-fast",
										isActive ? "bg-primary/10 text-primary-text" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
									)}
								>
									<category.icon size={14} className="shrink-0 opacity-60" aria-hidden />
									{category.label}
								</button>
							);
						})}
					</div>

					{/* Discord 자동완성 팝업 + 입력창 */}
					<div role="tabpanel" aria-label={active.label} className="overflow-hidden rounded-card bg-discord-embed">
						<div className="px-3 pt-3 pb-1 text-2xs font-bold tracking-wide text-discord-text-muted">{active.label} 명령어</div>
						<ul className={cn("space-y-0.5 px-2 pb-2", expanded && "max-h-[22rem] overflow-y-auto")}>
							{visible.map((command, index) => (
								<li key={command.cmd}>
									<button
										type="button"
										onClick={() => handlePick(index)}
										className={cn(
											"flex w-full min-w-0 cursor-pointer items-baseline gap-3 rounded-control px-2.5 py-2 text-left transition-colors duration-fast",
											index === selected ? "bg-discord-btn-active" : "hover:bg-discord-btn-active/50"
										)}
									>
										<span className="shrink-0 text-sm font-bold text-discord-text">{command.cmd}</span>
										<span className="min-w-0 truncate text-xs font-medium text-discord-text-muted">{command.desc}</span>
									</button>
								</li>
							))}
						</ul>
						{hiddenCount > 0 && (
							<button
								type="button"
								aria-expanded={expanded}
								onClick={() => setExpanded((value) => !value)}
								className="flex w-full cursor-pointer items-center justify-center gap-1 border-t border-discord-btn-active px-3 py-2 text-xs font-bold text-discord-text-muted transition-colors duration-fast hover:text-discord-text"
							>
								{expanded ? "접기" : `나머지 ${hiddenCount}개 더 보기`}
								<ChevronDown size={14} className={cn("transition-transform duration-fast", expanded && "rotate-180")} aria-hidden />
							</button>
						)}
						<div className="border-t border-discord-btn-active p-3">
							<div className="flex items-center rounded-control bg-discord-btn-active/60 px-3 py-2.5 text-sm text-discord-text">
								<span className="text-discord-text-muted">/</span>
								<span aria-live="off">{current.cmd.slice(1, 1 + typed)}</span>
								<span aria-hidden className="ml-px h-4 w-0.5 bg-discord-text motion-safe:animate-pulse" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
