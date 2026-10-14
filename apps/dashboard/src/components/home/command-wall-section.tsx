"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { m, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { SectionLabel } from "@/components/primitives/section-label";
import { Card } from "@/components/ui/card";

/**
 * 명령어 카드 월: 실제 슬래시 커맨드(한국어 로캘 이름/설명)를 카드로 채운 가로 4줄 필름을,
 * 긴 스크롤 영역 위에 스티키로 고정해 왼쪽으로 흘려보여요. 각 줄의 이동 거리를(창 폭 - 줄 폭)
 * 실측해 스크롤 진행도 0~1을 15%~90% 구간에만 매핑하므로, 카드 월이 흐르는 동안 양 끝에
 * 붙지 않아요. 끝까지 보고 나야 다음 Features 섹션으로 넘어가요 (R-19: 명령어 문화를 볼륨으로
 * 전달). 봇 소스의 실제 ko name/description만 쓰고, reduced-motion에서는 긴 영역·고정·이동을
 * 풀어 카드 전체를 정적으로 보여줘요.
 */

interface CommandCard {
	cmd: string;
	desc: string;
}

// 봇 로캘의 한국어 명령어 이름 — apps/bot/src/modules/<모듈>/commands/*의 setNameLocalizations({ ko }) 값
const MUSIC_CONTROL: CommandCard[] = [
	{ cmd: "/음악 재생", desc: "음성 채널에서 노래를 재생해요." },
	{ cmd: "/음악 검색", desc: "곡을 검색해서 5개 결과 중 골라 재생해요." },
	{ cmd: "/음악 일시정지", desc: "현재 곡을 일시정지하거나 다시 재생해요." },
	{ cmd: "/음악 건너뛰기", desc: "현재 재생 중인 곡을 건너뛰어요." },
	{ cmd: "/음악 이전곡", desc: "이전에 재생한 곡을 다시 재생해요." },
	{ cmd: "/음악 정지", desc: "대기열을 정리하고 노래를 멈춰요." },
	{ cmd: "/음악 시간이동", desc: "현재 곡의 특정 시간으로 이동해요." },
	{ cmd: "/음악 볼륨", desc: "플레이어의 볼륨을 설정해요." },
	{ cmd: "/음악 반복", desc: "반복 모드를 설정해요." },
	{ cmd: "/음악 자동재생", desc: "추천곡 자동재생을 켜거나 꺼요." },
	{ cmd: "/음악 필터", desc: "오디오 필터를 적용하거나 해제해요." },
	{ cmd: "/현재곡", desc: "현재 재생 중인 곡의 정보를 보여줘요." },
	{ cmd: "/대기열", desc: "음악 대기열을 보거나 관리해요." }
];

const MUSIC_LIBRARY: CommandCard[] = [
	{ cmd: "/음악 가사", desc: "곡의 가사를 검색해요." },
	{ cmd: "/음악 추천", desc: "현재 곡 기반의 추천곡을 대기열에 추가해요." },
	{ cmd: "/음악 재생기록", desc: "이 서버에서 재생된 최근 음악 기록을 보여줘요." },
	{ cmd: "/음악 음성", desc: "재생 중인 곡 위에 입력한 내용을 음성으로 겹쳐요." },
	{ cmd: "/플레이리스트", desc: "커스텀 플레이리스트를 관리해요." },
	{ cmd: "/즐겨찾기", desc: "즐겨찾기한 노래를 관리해요." },
	{ cmd: "/믹서", desc: "갭리스 재생과 크로스페이드를 설정해요." }
];

const CHAT_LIFESTYLE: CommandCard[] = [
	{ cmd: "/채팅", desc: "AI와 대화해요. 대화 기록은 채널 단위로 기억해요." },
	{ cmd: "/채팅설정", desc: "서버와 채널의 AI 채팅 설정을 관리해요." },
	{ cmd: "/날씨", desc: "현재 날씨와 예보를 확인해요." },
	{ cmd: "/택배", desc: "택배 배송 상태를 조회해요." },
	{ cmd: "/프로필", desc: "생일·별자리·음악 기록을 확인하고 관리해요." }
];

const UTILITY_GAME: CommandCard[] = [
	{ cmd: "/정보", desc: "봇·서버·유저 정보를 보여줘요." },
	{ cmd: "/정보 아바타", desc: "사용자의 아바타를 보여줘요." },
	{ cmd: "/정보 봇", desc: "봇의 정보와 통계를 보여줘요." },
	{ cmd: "/정보 서버", desc: "현재 서버의 정보를 보여줘요." },
	{ cmd: "/도움말", desc: "사용 가능한 명령어 목록을 보여줘요." },
	{ cmd: "/설정", desc: "봇의 서버 설정을 관리해요." },
	{ cmd: "/청소", desc: "채널의 최근 메시지를 일괄 삭제해요. (14일 이내)" },
	{ cmd: "/초대", desc: "봇 초대 링크를 보여줘요." },
	{ cmd: "/핑", desc: "봇과 각 구간의 연결 상태를 보여드려요." },
	{ cmd: "/출석", desc: "매일 출석 체크를 해요. 연속 출석하면 스트릭이 쌓여요." },
	{ cmd: "/주사위", desc: "주사위를 굴려요. 2d20+3 같은 식도 돼요." },
	{ cmd: "/가위바위보", desc: "가위바위보로 봇과 승부해요." },
	{ cmd: "/숫자맞히기", desc: "1~100 숫자를 맞히는 게임이에요. 6번 안에 맞히면 이겨요!" },
	{ cmd: "/운세", desc: "오늘의 운세를 봐요. 하루에 한 번 같은 결과!" },
	{ cmd: "/오하아사", desc: "오늘의 별자리 운세를 확인해요." }
];

const COLUMNS = [MUSIC_CONTROL, MUSIC_LIBRARY, CHAT_LIFESTYLE, UTILITY_GAME];

function CommandTile({ command }: { command: CommandCard }) {
	return (
		<Card padding="md" className="w-64 shrink-0 justify-center gap-2 sm:w-80 lg:w-96">
			{/* Pretendard(font-sans)로 통일 — code의 preflight mono 스택에선 한글이 시스템 폰트로
			    폴백해 화면 전체와 이질적이에요. 배경은 카드 본체(--card)와 같은 surface-1이
			    소멸하므로 중첩 영역 토큰인 surface-2로 구분해요 */}
			<code className="w-fit rounded-control bg-surface-2 px-2.5 py-1 font-sans text-xs font-semibold text-primary-text sm:py-1.5 sm:text-sm">{command.cmd}</code>
			<p className="text-xs font-medium leading-relaxed text-muted-foreground sm:text-sm">{command.desc}</p>
		</Card>
	);
}

export function CommandWallSection() {
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const windowRef = useRef<HTMLDivElement>(null);
	const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
	const shouldReduce = useReducedMotion();

	// 핀 고정 동안의 진행도 — start start(고정 시작) ~ end end(고정 해제)
	const { scrollYProgress } = useScroll({ target: scrollAreaRef, offset: ["start start", "end end"] });

	// 이동 거리 실측: 창 폭 - 줄 폭(음수). 이 값의 15%~90% 구간만 이동 범위로 써요(아래
	// useTransform) — 진행도 0/1의 휴식 상태에서 카드가 가장자리에 딱 붙지 않게 해요.
	const [travel, setTravel] = useState<[number, number, number, number]>([0, 0, 0, 0]);
	useLayoutEffect(() => {
		const measure = () => {
			const windowBox = windowRef.current;
			if (!windowBox) return;
			const windowWidth = windowBox.clientWidth;
			setTravel((previous) => {
				const next = rowRefs.current.map((row) =>
					row ? Math.min(0, windowWidth - row.scrollWidth) : 0
				) as [number, number, number, number];
				return (
					previous[0] === next[0] &&
					previous[1] === next[1] &&
					previous[2] === next[2] &&
					previous[3] === next[3]
						? previous
						: next
				);
			});
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);

	// 진행도 0~1을 이동 거리의 15%~90%에만 매핑해요 — 필름은 왼쪽으로 흐르고, 양 끝 카드
	// 한두 장은 페이드 뒤에 숨은 채 창에 온전히 붙지 않아요.
	const x1 = useTransform(scrollYProgress, [0, 1], [travel[0] * 0.15, travel[0] * 0.9]);
	const x2 = useTransform(scrollYProgress, [0, 1], [travel[1] * 0.15, travel[1] * 0.9]);
	const x3 = useTransform(scrollYProgress, [0, 1], [travel[2] * 0.15, travel[2] * 0.9]);
	const x4 = useTransform(scrollYProgress, [0, 1], [travel[3] * 0.15, travel[3] * 0.9]);
	const rowX = [x1, x2, x3, x4];

	return (
		<section className="w-full py-14 lg:py-20">
			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				<SectionLabel as="p">슬래시 커맨드</SectionLabel>
				<h2 className="mt-2 max-w-2xl text-3xl font-black leading-tight tracking-tighter text-foreground sm:text-4xl">
					명령어는 많은데, 배울 건 없어요.
				</h2>
				<p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
					음악·AI 채팅·게임·유틸까지 — 필요한 순간에 골라 쓰면 끝이에요.
				</p>
			</div>

			{/* 긴 스크롤 영역: 이 구간(260vh)을 내려가는 동안 창이 고정되고 줄이 흘러요.
			    h-[260vh]는 리터럴로 — 템플릿 문자열은 Tailwind가 스캔하지 못해요.
			    overflow-clip은 줄이 영역 밖으로 삐져나오는 머리·꼬리만 잘라요. overflow:hidden과
			    달리 position:sticky를 깨지지 않아요 */}
			<div ref={scrollAreaRef} className={shouldReduce ? "relative mt-10" : "relative mt-10 h-[260vh] overflow-clip"}>
				{/* 스티키 창은 컨테이너 밖 풀블리드라 카드 월이 페이지 가로 100%를 차지해요.
				    좌우 마스크 페이드로 가장자리를 닫아 카드가 잘리지 않고 흘러 들어오고 나가 보여요.
				    top과 높이는 --navbar-h 단일 소스(navbar 높이)를 따라요 */}
				<div
					ref={windowRef}
					className={
						shouldReduce
							? "relative"
							: "sticky top-[var(--navbar-h)] h-[calc(100vh-var(--navbar-h))] overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
					}
				>
					{/* 수직 페이드 래퍼 — 회전한 줄 끝이 창 상·하단에서 뚝 잘리지 않게 위아래를
					    페이드해요. rotate 요소 안에 걸면 마스크 축도 함께 기울어지므로 반드시
					    비회전 래퍼에 따로 걸어요 */}
					<div className={shouldReduce ? "relative" : "relative h-full [mask-image:linear-gradient(to_bottom,transparent,black_5%,black_95%,transparent)]"}>
						{/* 게이트를 통과하는 필름처럼 줄 전체를 -6° 기울여 대각선으로 흘려요.
						    줄은 sm 이상에서 창 세로를 골고루 나눠 카드가 꽉 차 보여요(정적 모드는
						    내용 높이대로 감싸서 보여줘요). 각 줄의 좌우 px-28은 블리드: 첫·마지막 카드가
						    페이드 구간 안쪽에 안착해 빈 모서리가 안 보여요 */}
						<div className={shouldReduce ? "relative flex flex-col gap-4" : "relative flex h-full rotate-[-6deg] flex-col justify-center gap-4 sm:gap-6"}>
							{COLUMNS.map((column, index) => (
								<m.div
									key={index}
									ref={(element) => {
										rowRefs.current[index] = element;
									}}
									style={shouldReduce ? undefined : { x: rowX[index] }}
									className={
										shouldReduce
											? "flex flex-wrap gap-3 sm:gap-4"
											: index === 3
												? "hidden w-max items-stretch gap-3 px-28 sm:flex sm:flex-1 sm:gap-4"
												: "flex w-max items-stretch gap-3 px-28 sm:flex-1 sm:gap-4"
									}
								>
									{column.map((command) => (
										<CommandTile key={command.cmd} command={command} />
									))}
								</m.div>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}