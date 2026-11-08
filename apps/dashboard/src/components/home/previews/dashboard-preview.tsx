"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { AnimatePresence, m } from "framer-motion";
import { ChevronDown, LayoutDashboard, MousePointer2 } from "lucide-react";

import { motionBase } from "@/components/motion/durations";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";


type Value = boolean | string | number;

/** 설정 컨트롤 — 실제 대시보드 폼처럼 스위치·선택 칩·슬라이더를 만져볼 수 있어요. from → to 는 자동 재생 연출용 값 */
type Control =
	| { kind: "toggle"; id: string; name: string; from: boolean; to: boolean }
	| { kind: "choice"; id: string; name: string; options: string[]; from: string; to: string }
	| { kind: "slider"; id: string; name: string; min: number; max: number; step: number; unit: string; from: number; to: number };

interface SettingTab {
	id: string;
	label: string;
	controls: Control[];
}

const SETTING_TABS: SettingTab[] = [
	{
		id: "ai",
		label: "AI 채팅 설정",
		controls: [
			{ kind: "choice", id: "scope", name: "응답 범위", options: ["모든 채널", "#ai-라운지만"], from: "모든 채널", to: "#ai-라운지만" },
			{ kind: "toggle", id: "tools", name: "도구 사용", from: false, to: true },
			{ kind: "toggle", id: "memory", name: "대화 기억", from: false, to: true },
		],
	},
	{
		id: "music",
		label: "음악 설정",
		controls: [
			{ kind: "slider", id: "volume", name: "기본 볼륨", min: 0, max: 100, step: 5, unit: "%", from: 80, to: 100 },
			{ kind: "choice", id: "repeat", name: "반복 모드", options: ["반복 없음", "한 곡", "전체"], from: "반복 없음", to: "한 곡" },
			{ kind: "toggle", id: "related", name: "관련곡 추가", from: false, to: true },
		],
	},
	{
		id: "channel",
		label: "채널·권한 설정",
		controls: [
			{ kind: "choice", id: "musicChannel", name: "음악 채널", options: ["미지정", "#음악-라운지", "#봇-명령"], from: "미지정", to: "#음악-라운지" },
			{ kind: "choice", id: "djRole", name: "DJ 역할", options: ["없음", "DJ", "관리자"], from: "없음", to: "DJ" },
			{ kind: "choice", id: "search", name: "검색 동작", options: ["선택 재생", "즉시 재생"], from: "선택 재생", to: "즉시 재생" },
		],
	},
	{
		id: "temp",
		label: "임시 음성 채널",
		controls: [
			{ kind: "toggle", id: "enabled", name: "사용", from: false, to: true },
			{ kind: "choice", id: "place", name: "생성 위치", options: ["미지정", "게임 카테고리", "잡담 카테고리"], from: "미지정", to: "게임 카테고리" },
			{ kind: "slider", id: "limit", name: "인원 제한", min: 0, max: 10, step: 1, unit: "명", from: 0, to: 5 },
		],
	},
	{
		id: "filter",
		label: "오디오 필터",
		controls: [
			{ kind: "choice", id: "preset", name: "프리셋", options: ["표준", "베이스부스트", "나이트코어"], from: "표준", to: "베이스부스트" },
			{ kind: "toggle", id: "gapless", name: "갭리스 재생", from: false, to: true },
			{ kind: "slider", id: "crossfade", name: "크로스페이드", min: 0, max: 10, step: 1, unit: "초", from: 0, to: 4 },
		],
	},
];

const ROW_H = 56;
const ROW_GAP = 8;
const STEP_MS = 1500;

const controlKey = (tabId: string, controlId: string) => `${tabId}.${controlId}`;

/** 슬라이더 값 표기 — 0은 "끄기"/"제한 없음"처럼 읽혀요 */
function formatSlider(control: Extract<Control, { kind: "slider" }>, value: number) {
	if (value === 0) return control.id === "limit" ? "제한 없음" : "끄기";
	return `${value}${control.unit}`;
}

/** 값 표시는 위로 밀려 올라가며 바뀌어요 */
function AnimatedValue({ text }: { text: string }) {
	return (
		<span className="relative inline-flex overflow-hidden">
			<AnimatePresence mode="popLayout" initial={false}>
				<m.span
					key={text}
					className="whitespace-nowrap"
					initial={{ y: 12, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: -12, opacity: 0 }}
					transition={{ duration: motionBase, ease: "easeOut" }}
				>
					{text}
				</m.span>
			</AnimatePresence>
		</span>
	);
}

function ControlRow({ control, value }: { control: Control; value: Value }) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-3 rounded-control bg-surface-1 px-3" style={{ height: ROW_H }}>
			<span className="min-w-0 truncate text-sm font-medium text-foreground">{control.name}</span>
			{control.kind === "toggle" && (
				<span aria-hidden data-target className="pointer-events-none">
					<Switch size="sm" checked={value === true} tabIndex={-1} aria-label={control.name} />
				</span>
			)}
			{control.kind === "choice" && (
				<span data-target className="flex shrink-0 items-center gap-1 rounded-control bg-surface-2 px-2.5 py-1 text-xs font-semibold text-primary-text">
					<AnimatedValue text={String(value)} />
					<ChevronDown size={12} className="text-muted-foreground" aria-hidden />
				</span>
			)}
			{control.kind === "slider" && (
				<span className="flex min-w-0 shrink-0 items-center gap-2.5">
					<span data-target className="relative h-1.5 w-20 overflow-hidden rounded-full bg-surface-3 sm:w-24">
						<m.span
							className="absolute inset-y-0 left-0 rounded-full bg-primary-control"
							animate={{ width: `${((Number(value) - control.min) / (control.max - control.min)) * 100}%` }}
							transition={{ duration: 0.5, ease: "easeOut" }}
						/>
					</span>
					<span className="w-14 text-right text-xs font-semibold text-primary-text">
						<AnimatedValue text={formatSlider(control, Number(value))} />
					</span>
				</span>
			)}
		</div>
	);
}

/**
 * 대시보드 프리뷰 — 좌측 설정 탭이 자동 순환하고, 오른쪽 패널에선 커서가 각 항목으로 가서
 * 클릭하면 값이 바뀐 뒤 "저장됨"이 떠요. 조작 UI가 아니라 "웹에서 바꾸는 장면"만 추상적으로 보여줘요.
 * 화면에 보일 때만 재생돼요(useInView). 탭을 누르면 그 탭부터 다시 재생해요.
 */
export function DashboardPreview() {
	const [activeTab, setActiveTab] = useState(0);
	const [cursorRow, setCursorRow] = useState<number | null>(null);
	const [clickTick, setClickTick] = useState(0);
	const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
	const [pressed, setPressed] = useState(false);
	const stageRef = useRef<HTMLDivElement>(null);
	const [values, setValues] = useState<Record<string, Value>>(() => {
		const initial: Record<string, Value> = {};
		for (const tab of SETTING_TABS) for (const control of tab.controls) initial[controlKey(tab.id, control.id)] = control.from;
		return initial;
	});
	const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });
	const tab = SETTING_TABS[activeTab];

	useEffect(() => {
		if (!inView) return undefined;
		const current = SETTING_TABS[activeTab];
		const setAll = (pick: "from" | "to") =>
			setValues((prev) => {
				const next = { ...prev };
				for (const control of current.controls) next[controlKey(current.id, control.id)] = control[pick];
				return next;
			});
		// reduced-motion에선 커서 없이 바뀐 결과만 보여줘요
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setAll("to");
			return undefined;
		}
		setAll("from");
		setCursorRow(null);
		const timers: Array<ReturnType<typeof setTimeout>> = [];
		current.controls.forEach((control, index) => {
			const start = 500 + index * STEP_MS;
			timers.push(
				setTimeout(() => {
					const stage = stageRef.current;
					const target = stage?.querySelectorAll<HTMLElement>("[data-target]")[index];
					if (stage && target) {
						const s = stage.getBoundingClientRect();
						const t = target.getBoundingClientRect();
						setCursorPos({ x: t.left - s.left + t.width / 2, y: t.top - s.top + t.height / 2 });
					}
					setCursorRow(index);
				}, start),
			);
			timers.push(setTimeout(() => setPressed(true), start + 600));
			timers.push(setTimeout(() => setPressed(false), start + 800));
			timers.push(
				setTimeout(() => {
					setClickTick((tick) => tick + 1);
					setValues((prev) => ({ ...prev, [controlKey(current.id, control.id)]: control.to }));
				}, start + 650),
			);
		});
		const end = 500 + current.controls.length * STEP_MS + 1200;
		timers.push(setTimeout(() => setCursorRow(null), end - 600));
		timers.push(setTimeout(() => setActiveTab((prev) => (prev + 1) % SETTING_TABS.length), end));
		return () => {
			for (const timer of timers) clearTimeout(timer);
		};
	}, [activeTab, inView]);

	return (
		// 다른 기능 프리뷰와 같은 바깥 프레임(테두리 + 머리줄)에 담아요. 안은 Discord가 아니라 웹 대시보드라 surface 토큰을 써요
		<div ref={ref} className="relative overflow-hidden rounded-card border border-border-subtle bg-card">
			<div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
				<LayoutDashboard size={14} className="text-muted-foreground" aria-hidden />
				<span className="text-xs font-semibold text-foreground">서버 설정</span>
				<span className="ml-auto text-2xs text-muted-foreground">웹 대시보드</span>
			</div>
			<div className="flex flex-col gap-3 p-3 sm:flex-row sm:p-4">
				<div className="flex min-w-0 shrink-0 flex-wrap gap-1.5 sm:flex-col" role="tablist" aria-label="설정 예시">
					{SETTING_TABS.map((candidate, index) => (
						<button
							key={candidate.id}
							type="button"
							role="tab"
							aria-selected={activeTab === index}
							onClick={() => setActiveTab(index)}
							className={cn(
								"flex shrink-0 cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-xs font-bold transition-colors duration-fast",
								activeTab === index ? "bg-primary/10 text-primary-text" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
							)}
						>
							<span
								className={cn("rounded-full transition-all duration-base", activeTab === index ? "h-2 w-2 bg-primary-control" : "h-1.5 w-1.5 bg-border")}
							/>
							{candidate.label}
						</button>
					))}
				</div>

				<div className="relative min-w-0 flex-1 overflow-hidden rounded-control bg-surface-2 p-3">
					<p className="mb-2 flex h-5 items-center text-2xs font-medium text-muted-foreground">{tab.label}</p>

					<div ref={stageRef} className="relative" style={{ minHeight: ROW_H * 3 + ROW_GAP * 2 }}>
						<AnimatePresence mode="popLayout" initial={false}>
							<m.div
								key={tab.id}
								className="space-y-2"
								initial={{ opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -12 }}
								transition={{ duration: motionBase, ease: "easeOut" }}
							>
								{tab.controls.map((control) => (
									<ControlRow key={control.id} control={control} value={values[controlKey(tab.id, control.id)]} />
								))}
							</m.div>
						</AnimatePresence>

						{/* 가짜 커서 — 장식이라 스크린리더에서 숨겨요. 실제 컨트롤 위치를 재서 정확히 그 위에 멈춰요 */}
						<m.div
							aria-hidden
							className="pointer-events-none absolute top-0 left-0 z-10"
							initial={false}
							animate={{ x: cursorPos.x, y: cursorPos.y, opacity: cursorRow === null ? 0 : 1 }}
							transition={{ x: { duration: 0.6, ease: "easeInOut" }, y: { duration: 0.6, ease: "easeInOut" }, opacity: { duration: 0.2 } }}
						>
							<m.span
								key={clickTick}
								className="absolute -top-4 -left-4 h-8 w-8 rounded-full border-2 border-primary-control"
								initial={{ scale: 0.3, opacity: clickTick === 0 ? 0 : 1 }}
								animate={{ scale: 1.6, opacity: 0 }}
								transition={{ duration: 0.55, ease: "easeOut" }}
							/>
							<m.span className="block origin-top-left" animate={{ scale: pressed ? 0.8 : 1 }} transition={{ duration: 0.12 }}>
								<MousePointer2 size={26} strokeWidth={1.75} className="fill-foreground stroke-background drop-shadow-md" />
							</m.span>
						</m.div>
					</div>
				</div>
			</div>
		</div>
	);
}
