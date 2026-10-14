"use client";

import { useState } from "react";
import { m } from "framer-motion";

import { SectionLabel } from "@/components/primitives/section-label";
import { cn } from "@/lib/utils";

/**
 * 명령어 사전: 연출 없이 실제 슬래시 커맨드를 카테고리 탭으로 골라 훑게 하는 정보 섹션이에요.
 * cmd/desc 문자열은 봇 로캘의 한국어 명령어 이름 그대로 — apps/bot/src/modules/<모듈>/commands/*의
 * setNameLocalizations({ ko }) 값이므로 임의로 바꾸지 마세요.
 */

interface CommandCard {
	cmd: string;
	desc: string;
}

const MUSIC_COMMANDS: CommandCard[] = [
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
	{ cmd: "/대기열", desc: "음악 대기열을 보거나 관리해요." },
	{ cmd: "/음악 가사", desc: "곡의 가사를 검색해요." },
	{ cmd: "/음악 추천", desc: "현재 곡 기반의 추천곡을 대기열에 추가해요." },
	{ cmd: "/음악 재생기록", desc: "이 서버에서 재생된 최근 음악 기록을 보여줘요." },
	{ cmd: "/음악 음성", desc: "재생 중인 곡 위에 입력한 내용을 음성으로 겹쳐요." },
	{ cmd: "/플레이리스트", desc: "커스텀 플레이리스트를 관리해요." },
	{ cmd: "/즐겨찾기", desc: "즐겨찾기한 노래를 관리해요." },
	{ cmd: "/믹서", desc: "갭리스 재생과 크로스페이드를 설정해요." }
];

const LIFE_COMMANDS: CommandCard[] = [
	{ cmd: "/채팅", desc: "AI와 대화해요. 대화 기록은 채널 단위로 기억해요." },
	{ cmd: "/채팅설정", desc: "서버와 채널의 AI 채팅 설정을 관리해요." },
	{ cmd: "/날씨", desc: "현재 날씨와 예보를 확인해요." },
	{ cmd: "/택배", desc: "택배 배송 상태를 조회해요." },
	{ cmd: "/프로필", desc: "생일·별자리·음악 기록을 확인하고 관리해요." }
];

const UTILITY_COMMANDS: CommandCard[] = [
	{ cmd: "/정보", desc: "봇·서버·유저 정보를 보여줘요." },
	{ cmd: "/정보 아바타", desc: "사용자의 아바타를 보여줘요." },
	{ cmd: "/정보 봇", desc: "봇의 정보와 통계를 보여줘요." },
	{ cmd: "/정보 서버", desc: "현재 서버의 정보를 보여줘요." },
	{ cmd: "/도움말", desc: "사용 가능한 명령어 목록을 보여줘요." },
	{ cmd: "/설정", desc: "봇의 서버 설정을 관리해요." },
	{ cmd: "/청소", desc: "채널의 최근 메시지를 일괄 삭제해요. (14일 이내)" },
	{ cmd: "/초대", desc: "봇 초대 링크를 보여줘요." },
	{ cmd: "/핑", desc: "봇과 각 구간의 연결 상태를 보여드려요." }
];

const GAME_COMMANDS: CommandCard[] = [
	{ cmd: "/출석", desc: "매일 출석 체크를 해요. 연속 출석하면 스트릭이 쌓여요." },
	{ cmd: "/주사위", desc: "주사위를 굴려요. 2d20+3 같은 식도 돼요." },
	{ cmd: "/가위바위보", desc: "가위바위보로 봇과 승부해요." },
	{ cmd: "/숫자맞히기", desc: "1~100 숫자를 맞히는 게임이에요. 6번 안에 맞히면 이겨요!" },
	{ cmd: "/운세", desc: "오늘의 운세를 봐요. 하루에 한 번 같은 결과!" },
	{ cmd: "/오하아사", desc: "오늘의 별자리 운세를 확인해요." }
];

type CategoryKey = "music" | "life" | "utility" | "games";

const CATEGORIES: Array<{ key: CategoryKey; label: string; commands: CommandCard[] }> = [
	{ key: "music", label: "음악", commands: MUSIC_COMMANDS },
	{ key: "life", label: "채팅·생활", commands: LIFE_COMMANDS },
	{ key: "utility", label: "유틸리티", commands: UTILITY_COMMANDS },
	{ key: "games", label: "게임", commands: GAME_COMMANDS }
];

const sectionVariants = {
	hidden: { opacity: 0, y: 24 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
} as const;

export function CommandListSection() {
	const [activeCategory, setActiveCategory] = useState<CategoryKey>("music");

	const active = CATEGORIES.find((category) => category.key === activeCategory) ?? CATEGORIES[0];

	return (
		<section className="py-14 sm:py-20 lg:py-24">
			<div className="mx-auto w-full max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
				<m.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={sectionVariants} className="max-w-2xl space-y-3">
					<SectionLabel as="p">슬래시 커맨드</SectionLabel>
					<h2 className="text-3xl font-black tracking-tighter text-foreground sm:text-4xl">명령어는 많은데, 배울 건 없어요.</h2>
					<p className="text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
						음악·AI 채팅·게임·유틸까지 — 필요한 순간에 골라 쓰면 끝이에요.
					</p>
					<p className="text-2xs font-medium text-muted-foreground mt-1">실제 슬래시 커맨드 40개 · 전부 무료예요</p>
				</m.div>

				{/* 카테고리 탭 — 이 섹션의 유일한 인터랙션. 가로 넘침은 스크롤로 흘려보내요 */}
				<div role="tablist" aria-label="명령어 카테고리" className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
					{CATEGORIES.map((category) => {
						const isActive = category.key === activeCategory;
						return (
							<button
								key={category.key}
								type="button"
								role="tab"
								aria-selected={isActive}
								onClick={() => setActiveCategory(category.key)}
								className={cn(
									"shrink-0 cursor-pointer rounded-control px-3 py-2 text-sm font-bold transition-colors duration-fast",
									isActive ? "bg-primary/10 text-primary-text" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
								)}
							>
								{category.label}
							</button>
						);
					})}
				</div>

				{/* 명령어 보드 — 카드가 아니라 헤어라인으로 나뉜 메뉴판. gap-px + 보드 배경(border-subtle)이
				    셀 사이 1px 줄이 되고, 셀만 surface-2를 채워요. 카테고리 셀 수가 달라도 min 높이 없이
				    자연 높이로 흐르게 둬요 */}
				<div role="tabpanel" aria-label={active.label} className="grid grid-cols-1 gap-px rounded-card border border-border-subtle bg-border-subtle sm:grid-cols-2">
					{active.commands.map((command) => (
						<div key={command.cmd} className="flex flex-col gap-1 bg-surface-2 px-3.5 py-3 transition-colors hover:bg-surface-1">
							{/* 명령어 텍스트는 code가 아닌 Pretendard 그대로 — 한글이 mono 스택으로 폴백하지 않게 해요 */}
							<p className="text-sm font-bold text-primary-text">{command.cmd}</p>
							<p className="text-xs font-medium leading-relaxed text-muted-foreground">{command.desc}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}