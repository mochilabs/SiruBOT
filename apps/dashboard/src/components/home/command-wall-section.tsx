"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { m, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { SectionLabel } from "@/components/primitives/section-label";
import { Card } from "@/components/ui/card";

/**
 * 명령어 카드 월 — 실제 슬래시 커맨드(이름/설명)를 카드로 채운 세로 3열을, 긴 스크롤
 * 영역 위에 스티키로 고정해서 흘려보여요. 열의 이동 거리를(창−열 높이) 실측해 딱 한 번
 * 끝까지 내려가므로, 카드 전체를 다 보고 나야 다음 Features 섹션으로 넘어가요
 * (R-19: 명령어 문화를 볼륨으로 전달). 봇 소스의 실제 name/description만 쓰고,
 * reduced-motion에서는 긴 영역·고정을 풀어 카드 전체를 정적으로 보여줘요.
 */

interface CommandCard {
	cmd: string;
	desc: string;
}

const MUSIC_CONTROL: CommandCard[] = [
	{ cmd: "/music 재생", desc: "음성 채널에서 노래를 재생해요." },
	{ cmd: "/music 검색", desc: "곡을 검색해서 5개 결과 중 골라 재생해요." },
	{ cmd: "/music 일시정지", desc: "현재 곡을 일시정지하거나 다시 재생해요." },
	{ cmd: "/music 건너뛰기", desc: "현재 재생 중인 곡을 건너뛰어요." },
	{ cmd: "/music 이전곡", desc: "이전에 재생한 곡을 다시 재생해요." },
	{ cmd: "/music 정지", desc: "대기열을 정리하고 노래를 멈춰요." },
	{ cmd: "/music 시간이동", desc: "현재 곡의 특정 시간으로 이동해요." },
	{ cmd: "/music 볼륨", desc: "플레이어의 볼륨을 설정해요." },
	{ cmd: "/music 반복", desc: "반복 모드를 설정해요." },
	{ cmd: "/music 자동재생", desc: "추천곡 자동재생을 켜거나 꺼요." },
	{ cmd: "/music 필터", desc: "오디오 필터를 적용하거나 해제해요." },
	{ cmd: "/nowplaying", desc: "현재 재생 중인 곡의 정보를 보여줘요." },
	{ cmd: "/queue", desc: "음악 대기열을 보거나 관리해요." }
];

const MUSIC_LIBRARY: CommandCard[] = [
	{ cmd: "/music 가사", desc: "곡의 가사를 검색해요." },
	{ cmd: "/music 추천", desc: "현재 곡 기반의 추천곡을 대기열에 추가해요." },
	{ cmd: "/music 재생기록", desc: "이 서버에서 재생된 최근 음악 기록을 보여줘요." },
	{ cmd: "/music 음성", desc: "재생 중인 곡 위에 입력한 내용을 음성으로 겹쳐요." },
	{ cmd: "/playlist", desc: "커스텀 플레이리스트를 관리해요." },
	{ cmd: "/favorites", desc: "즐겨찾기한 노래를 관리해요." },
	{ cmd: "/mixer", desc: "갭리스 재생과 크로스페이드를 설정해요." },
	{ cmd: "/chat", desc: "AI와 대화해요. 대화 기록은 채널 단위로 기억해요." },
	{ cmd: "/chat-settings", desc: "서버와 채널의 AI 채팅 설정을 관리해요." },
	{ cmd: "/weather", desc: "현재 날씨와 예보를 확인해요." },
	{ cmd: "/delivery", desc: "택배 배송 상태를 조회해요." },
	{ cmd: "/profile", desc: "생일·별자리·음악 기록을 확인하고 관리해요." }
];

const UTILITY_GAME: CommandCard[] = [
	{ cmd: "/info", desc: "봇·서버·유저 정보를 보여줘요." },
	{ cmd: "/info 아바타", desc: "사용자의 아바타를 보여줘요." },
	{ cmd: "/info 봇", desc: "봇의 정보와 통계를 보여줘요." },
	{ cmd: "/info 서버", desc: "현재 서버의 정보를 보여줘요." },
	{ cmd: "/help", desc: "사용 가능한 명령어 목록을 보여줘요." },
	{ cmd: "/settings", desc: "봇의 서버 설정을 관리해요." },
	{ cmd: "/purge", desc: "채널의 최근 메시지를 일괄 삭제해요. (14일 이내)" },
	{ cmd: "/invite", desc: "봇 초대 링크를 보여줘요." },
	{ cmd: "/ping", desc: "봇과 각 구간의 연결 상태를 보여드려요." },
	{ cmd: "/checkin", desc: "매일 출석 체크를 해요. 연속 출석하면 스트릭이 쌓여요." },
	{ cmd: "/dice", desc: "주사위를 굴려요. 2d20+3 같은 식도 돼요." },
	{ cmd: "/rps", desc: "가위바위보로 봇과 승부해요." },
	{ cmd: "/guess", desc: "1~100 숫자를 맞히는 게임이에요. 6번 안에 맞히면 이겨요!" },
	{ cmd: "/fortune", desc: "오늘의 운세를 봐요. 하루에 한 번 같은 결과!" },
	{ cmd: "/ohaasa", desc: "오늘의 별자리 운세를 확인해요." }
];

const COLUMNS = [MUSIC_CONTROL, MUSIC_LIBRARY, UTILITY_GAME];

function CommandTile({ command }: { command: CommandCard }) {
	return (
		<Card padding="sm" className="gap-1.5">
			<code className="w-fit rounded-control bg-surface-1 px-2 py-1 text-xs font-bold text-primary-text">{command.cmd}</code>
			<p className="text-xs font-medium leading-relaxed text-muted-foreground">{command.desc}</p>
		</Card>
	);
}

export function CommandWallSection() {
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const windowRef = useRef<HTMLDivElement>(null);
	const columnRefs = useRef<Array<HTMLDivElement | null>>([]);
	const shouldReduce = useReducedMotion();

	// 핀 고정 동안의 진행도 — start start(고정 시작) ~ end end(고정 해제)
	const { scrollYProgress } = useScroll({ target: scrollAreaRef, offset: ["start start", "end end"] });

	// 이동 거리 실측: 창 높이 − 열 높이(음수). 열 전체가 창을 타고 끝까지 내려가
	// 카드 한 장이 빠짐없이 지나가고, 빈 공간이 생기지 않아요.
	const [travel, setTravel] = useState<[number, number, number]>([0, 0, 0]);
	useLayoutEffect(() => {
		const measure = () => {
			const windowBox = windowRef.current;
			if (!windowBox) return;
			const windowHeight = windowBox.clientHeight;
			setTravel((previous) => {
				const next = columnRefs.current.map((column) =>
					column ? Math.min(0, windowHeight - column.clientHeight) : 0
				) as [number, number, number];
				return previous[0] === next[0] && previous[1] === next[1] && previous[2] === next[2]
					? previous
					: next;
			});
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);

	const y1 = useTransform(scrollYProgress, [0, 1], [travel[0], 0]);
	const y2 = useTransform(scrollYProgress, [0, 1], [travel[1], 0]);
	const y3 = useTransform(scrollYProgress, [0, 1], [travel[2], 0]);
	const columnY = [y1, y2, y3];

	return (
		<section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
			<SectionLabel as="p">슬래시 커맨드</SectionLabel>
			<h2 className="mt-2 max-w-2xl text-3xl font-black leading-tight tracking-tighter text-foreground sm:text-4xl">
				명령어는 많은데, 배울 건 없어요.
			</h2>
			<p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
				음악·AI 채팅·게임·유틸까지 — 필요한 순간에 골라 쓰면 끝이에요.
			</p>

			{/* 긴 스크롤 영역 + 스티키 창: 카드 열이 끝까지 흘러가야 Features 섹션으로 넘어가요.
			    h-[260vh]는 리터럴로 — 템플릿 문자열은 Tailwind가 스캔하지 못해요 */}
			<div ref={scrollAreaRef} className={shouldReduce ? "relative mt-10" : "relative mt-10 h-[260vh]"}>
				<div
					ref={windowRef}
					className={
						shouldReduce
							? "relative"
							: "sticky top-16 h-[calc(100vh-4rem)] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_4%,black_96%,transparent)]"
					}
				>
					<div className="flex items-start gap-3 sm:gap-4">
						{COLUMNS.map((column, index) => (
							<m.div
								key={index}
								ref={(element) => {
									columnRefs.current[index] = element;
								}}
								style={shouldReduce ? undefined : { y: columnY[index] }}
								className={`flex-1 space-y-3 sm:space-y-4 ${index === 2 ? "hidden lg:block" : ""}`}
							>
								{column.map((command) => (
									<CommandTile key={command.cmd} command={command} />
								))}
							</m.div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
