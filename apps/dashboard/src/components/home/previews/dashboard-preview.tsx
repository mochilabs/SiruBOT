"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { AnimatePresence, m } from "framer-motion";

import { cn } from "@/lib/utils";

const settingRow = "flex min-w-0 items-center justify-between gap-3 rounded-control bg-surface-1 px-3 py-2";
const settingName = "truncate text-sm font-medium text-foreground";

/** 대시보드 설정 프리뷰 — 각 행이 "이전 값 → 새 값"으로 바뀌는 추상 설정 리스트. */
interface SettingToggle {
	label: string;
	rows: Array<{ name: string; from: string; to: string }>;
}

const dashboardSettingSlides: SettingToggle[] = [
	{
		label: "AI 채팅 설정",
		rows: [
			{ name: "응답 범위", from: "모든 채널", to: "#ai-라운지만" },
			{ name: "도구 사용", from: "끄기", to: "켜기" },
			{ name: "대화 기억", from: "끄기", to: "켜기" },
		],
	},
	{
		label: "음악 설정",
		rows: [
			{ name: "기본 볼륨", from: "80%", to: "100%" },
			{ name: "반복 모드", from: "반복 없음", to: "한 곡 반복" },
			{ name: "관련곡 추가", from: "끄기", to: "켜기" },
		],
	},
	{
		label: "채널·권한 설정",
		rows: [
			{ name: "음악 채널", from: "미지정", to: "#음악-라운지" },
			{ name: "DJ 역할", from: "없음", to: "DJ" },
			{ name: "검색 동작", from: "선택 재생", to: "즉시 재생" },
		],
	},
	{
		label: "임시 음성 채널",
		rows: [
			{ name: "사용", from: "끄기", to: "켜기" },
			{ name: "생성 위치", from: "미지정", to: "게임 카테고리" },
			{ name: "인원 제한", from: "제한 없음", to: "5명" },
		],
	},
	{
		label: "오디오 필터",
		rows: [
			{ name: "프리셋", from: "표준", to: "베이스부스트" },
			{ name: "갭리스 재생", from: "끄기", to: "켜기" },
			{ name: "크로스페이드", from: "끄기", to: "4초" },
		],
	},
];

/** 설정 하나가 from → to 로 슥 바뀌는 행 */
function SettingToggleRow({ name, from, to, index }: { name: string; from: string; to: string; index: number }) {
	return (
		<div className={settingRow}>
			<span className={settingName}>{name}</span>
			<span className="relative shrink-0 text-xs font-semibold">
				{/* 새 값이 폭을 결정 — from은 위로 슝 사라짐 (등장 시엔 from 노출 없이 바로 from → to 전환) */}
				<m.span className="text-primary-text">
					{to}
				</m.span>
				<m.span
					className="absolute inset-0 text-right text-muted-foreground"
					initial={{ y: 0, opacity: 1 }}
					animate={{ y: -12, opacity: 0 }}
					transition={{ delay: 0.4 + index * 0.3, duration: 0.35, ease: "easeOut" }}
				>
					{from}
				</m.span>
			</span>
		</div>
	);
}

/** 설정 카드 하나 — 행들이 순서대로 값이 바뀌고, 마치 스크롤해 설정을 바꾸는 느낌 */
function SettingScroller({ slide }: { slide: SettingToggle }) {
	return (
		<div className="space-y-2">
			{slide.rows.map((row, index) => (
				<SettingToggleRow key={`${slide.label}-${row.name}`} name={row.name} from={row.from} to={row.to} index={index} />
			))}
		</div>
	);
}

/**
 * 대시보드 프리뷰 — 좌측 설정 탭이 자동 순환하고, 행 값이 from → to 로 바뀌어요.
 * 화면에 보일 때만 7초 자동 순환이 흘러요(useInView), 탭을 직접 누르면 그 슬라이드에서 멈춰요.
 */
export function DashboardPreview() {
	const [activeSlide, setActiveSlide] = useState(0);
	const [autoPlay, setAutoPlay] = useState(true);
	const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });

	useEffect(() => {
		if (!autoPlay || !inView) return undefined;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
		const timer = setInterval(() => setActiveSlide((prev) => (prev + 1) % dashboardSettingSlides.length), 7000);
		return () => clearInterval(timer);
	}, [autoPlay, activeSlide, inView]);

	const handleSelect = (index: number) => {
		setAutoPlay(false);
		setActiveSlide(index);
	};

	return (
		<div ref={ref} className="relative">
			<div className="flex flex-col gap-3 sm:flex-row">
				<div className="flex min-w-0 shrink-0 flex-wrap gap-1.5 sm:flex-col" role="tablist" aria-label="설정 예시">
					{dashboardSettingSlides.map((slide, index) => (
						<button
							key={slide.label}
							type="button"
							role="tab"
							aria-selected={activeSlide === index}
							onClick={() => handleSelect(index)}
							className={cn(
								"flex shrink-0 cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-xs font-bold transition-colors duration-fast",
								activeSlide === index
									? "bg-primary/10 text-primary-text"
									: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
							)}
						>
							<span
								className={cn(
									"rounded-full transition-all duration-base",
									activeSlide === index ? "h-2 w-2 bg-primary-control" : "h-1.5 w-1.5 bg-border",
								)}
							/>
							{slide.label}
						</button>
					))}
				</div>
				<div className="relative min-w-0 flex-1 overflow-hidden rounded-control bg-surface-2 p-3">
					<AnimatePresence mode="popLayout" initial={false}>
						<m.div
							key={dashboardSettingSlides[activeSlide].label}
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -12 }}
							transition={{ duration: 0.25, ease: "easeOut" }}
						>
							<SettingScroller slide={dashboardSettingSlides[activeSlide]} />
						</m.div>
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}