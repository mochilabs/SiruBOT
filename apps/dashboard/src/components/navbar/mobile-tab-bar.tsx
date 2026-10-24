"use client";

import { type ComponentType, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { animate, m, type MotionValue, type Transition, useMotionValue, useReducedMotion } from "framer-motion";
import { Activity, BarChart3, LayoutGrid, ListMusic, User } from "lucide-react";

import { getNavHref, navLinks } from "./links";
import { boxAtIndex, clamp, DRAG_THRESHOLD, fractionalIndex, rubberBand, type TabBox } from "./tab-bar-math";

const tabIcons: Record<string, ComponentType<{ size?: number; className?: string }>> = {
	"/shards": Activity,
	"/track": BarChart3,
	"/profile": User,
	"/playlists": ListMusic,
	"/servers": LayoutGrid
};

/* iOS 26식 드래그 필 모션 — 누르기 눌림은 빠르게, 놓기 바운스는 살짝 넘치게, 탭 전환은 단정하게. */
const PRESS_SCALE = { x: 0.955, y: 0.9 };
const PRESS_SPRING: Transition = { type: "spring", stiffness: 900, damping: 42, mass: 0.5 };
const RELEASE_SPRING: Transition = { type: "spring", stiffness: 520, damping: 22, mass: 0.7 };
const SETTLE_SPRING: Transition = { type: "spring", stiffness: 420, damping: 26, mass: 0.85 };
const SWITCH_SPRING: Transition = { type: "spring", stiffness: 500, damping: 34, mass: 1 };
/** 드래그 속도에 따라 알약이 잠깐 늘어나는 폭 (초당 8000px에서 최대 4.5%). */
const STRETCH_VELOCITY = 8000;
const STRETCH_MAX = 0.045;

type AnimControls = ReturnType<typeof animate>;
type AnimPair = [value: MotionValue<number>, target: number, transition: Transition];

/** 값마다 진행 중인 애니메이션 — 같은 값을 다시 애니메이션할 때만 이전 것을 멈춰요. */
interface RunningAnim {
	controls: AnimControls;
	target: number;
}

interface DragState {
	pointerId: number;
	startX: number;
	lastX: number;
	lastTime: number;
	grabOffset: number;
	pillWidth: number;
	moved: boolean;
}

/**
 * 모바일 하단 탭바 — 콘텐츠 위에 떠 있는 알약 형태(backdrop blur + 반투명 표면)로
 * 엄지 도달 범위에 메인 메뉴를 상시 노출해요 (md 이상에서 숨겨지고 데스크톱 네비가 대신해요).
 *
 * 현재 탭 알약은 드래그할 수 있어요 (iOS 26 탭바 느낌):
 * - 누르면 알약이 살짝 눌리고, 손가락을 따라가면서 탭 사이에서는 폭이 부드럽게 변해요.
 * - 탭바 밖으로 나가면 저항이 걸려(고무줄) 알약이 한 번에 튕겨 나가지 않아요.
 * - 놓으면 손끝 아래 탭으로 스프링이 살짝 넘치며 안착하고, 눌림이 되돌아오면서 그 탭으로 이동해요.
 * - 움직임이 임계값 미만이면 그냥 탭으로 취급해 링크 기본 동작을 그대로 둬요.
 * 좌표·보간 계산은 tab-bar-math.ts에 있고, reduced-motion에서는 스프링·스쿼시 없이 즉시 스냅해요
 * (Providers의 MotionConfig(reducedMotion="user")와 별개로 imperative 애니메이션이라 직접 확인해요).
 * 알약 x 기준점은 컨테이너 padding box라 pointer 좌표도 clientLeft를 빼 맞춰요.
 * safe-area와 하단 고정 요소(SaveBar·맨 위로)는 각각 env()와 별도 offset으로 피해요.
 */
export function MobileTabBar({ status }: { status: "authenticated" | "unauthenticated" | "loading" }) {
	const pathname = usePathname();
	const router = useRouter();
	const reduced = useReducedMotion() ?? false;

	const containerRef = useRef<HTMLDivElement | null>(null);
	const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
	const x = useMotionValue(0);
	const width = useMotionValue(0);
	const scaleX = useMotionValue(1);
	const scaleY = useMotionValue(1);
	const animsRef = useRef(new Map<MotionValue<number>, RunningAnim>());
	const dragRef = useRef<DragState | null>(null);
	const detachRef = useRef<() => void>(() => {});
	const clickGuardRef = useRef<((event: Event) => void) | null>(null);
	const tabsRef = useRef<TabBox[] | null>(null);
	const initialSyncRef = useRef(false);
	const previewRef = useRef<number | null>(null);
	const activeIndexRef = useRef(-1);
	const statusRef = useRef(status);

	const [tabs, setTabs] = useState<TabBox[] | null>(null);
	const [previewIndex, setPreviewIndex] = useState<number | null>(null);

	const activeIndex = navLinks.findIndex(
		(link) => pathname === link.href || pathname.startsWith(`${link.href}/`)
	);
	activeIndexRef.current = activeIndex;
	statusRef.current = status;
	tabsRef.current = tabs;

	const stopAnims = useCallback(() => {
		for (const running of animsRef.current.values()) running.controls.stop();
		animsRef.current.clear();
	}, []);

	const runAnims = useCallback(
		(pairs: AnimPair[]) => {
			for (const [value, target, transition] of pairs) {
				const running = animsRef.current.get(value);
				// 같은 목표로 이미 날아가는 중이면 그대로 두어요 — 탭 전환이 눌림 해제 바운스를 잘라내지 않도록
				if (running?.target === target) continue;
				running?.controls.stop();
				animsRef.current.set(value, {
					controls: reduced ? animate(value, target, { duration: 0 }) : animate(value, target, transition),
					target
				});
			}
		},
		[reduced]
	);

	const clearClickGuard = () => {
		const guard = clickGuardRef.current;
		if (!guard) return;
		window.removeEventListener("click", guard, { capture: true });
		clickGuardRef.current = null;
	};

	/** 드래그가 남긴 클릭은 한 번 삼켜요 — 놓은 자리의 링크·버튼이 눌리지 않도록, 다음 pointerdown에서 해제돼요. */
	const armClickGuard = () => {
		clearClickGuard();
		const guard = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			clearClickGuard();
		};
		clickGuardRef.current = guard;
		window.addEventListener("click", guard, { capture: true });
	};

	useEffect(() => {
		const measure = () => {
			const container = containerRef.current;
			if (!container || itemRefs.current.some((item) => item === null)) return;
			const origin = container.getBoundingClientRect().left + container.clientLeft;
			const boxes = itemRefs.current.map((item) => {
				const rect = item!.getBoundingClientRect();
				return { x: rect.left - origin, width: rect.width };
			});
			tabsRef.current = boxes;
			setTabs(boxes);
			const active = boxes[activeIndexRef.current];
			if (!initialSyncRef.current && active) {
				// 첫 측정 전에는 알약을 렌더하지 않으니 여기서 바로 꽂아요 (왼쪽에서 미끄러 들어오는 것 방지)
				initialSyncRef.current = true;
				x.set(active.x);
				width.set(active.width);
			}
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [x, width]);

	useEffect(() => {
		if (dragRef.current) return;
		const box = tabs?.[activeIndex];
		if (!box) return;
		runAnims([
			[x, box.x, SWITCH_SPRING],
			[width, box.width, SWITCH_SPRING]
		]);
	}, [activeIndex, tabs, runAnims, x, width]);

	useEffect(
		() => () => {
			detachRef.current();
			for (const running of animsRef.current.values()) running.controls.stop();
			animsRef.current.clear();
			const guard = clickGuardRef.current;
			if (guard) window.removeEventListener("click", guard, { capture: true });
		},
		[]
	);

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		const container = containerRef.current;
		const boxes = tabsRef.current;
		const active = boxes?.[activeIndexRef.current];
		if (!container || !boxes || !active) return;

		clearClickGuard();
		stopAnims();

		const origin = container.getBoundingClientRect().left + container.clientLeft;
		const startX = event.clientX - origin;
		const drag: DragState = {
			pointerId: event.pointerId,
			startX,
			lastX: startX,
			lastTime: performance.now(),
			grabOffset: startX - active.x,
			pillWidth: active.width,
			moved: false
		};
		dragRef.current = drag;

		if (!reduced) {
			runAnims([
				[scaleX, PRESS_SCALE.x, PRESS_SPRING],
				[scaleY, PRESS_SCALE.y, PRESS_SPRING]
			]);
		}

		const onMove = (moveEvent: PointerEvent) => {
			const current = dragRef.current;
			const liveBoxes = tabsRef.current;
			if (!current || !liveBoxes || moveEvent.pointerId !== current.pointerId) return;
			const localX = moveEvent.clientX - origin;
			if (!current.moved) {
				if (Math.abs(localX - current.startX) < DRAG_THRESHOLD) return;
				current.moved = true;
			}

			const now = performance.now();
			const velocity = ((localX - current.lastX) / Math.max(now - current.lastTime, 1)) * 1000;
			current.lastX = localX;
			current.lastTime = now;

			const t = fractionalIndex(liveBoxes, localX - current.grabOffset + current.pillWidth / 2);
			const box = boxAtIndex(liveBoxes, t);
			current.pillWidth = box.width;
			const last = liveBoxes.length - 1;
			x.set(rubberBand(localX - current.grabOffset, liveBoxes[0].x, liveBoxes[last].x + liveBoxes[last].width - box.width));
			width.set(box.width);
			if (!reduced) {
				const stretch = Math.min(Math.abs(velocity) / STRETCH_VELOCITY, STRETCH_MAX);
				scaleX.set(PRESS_SCALE.x * (1 + stretch));
				scaleY.set(PRESS_SCALE.y * (1 - stretch));
			}

			const near = clamp(Math.round(t), 0, last);
			if (near !== previewRef.current) {
				previewRef.current = near;
				setPreviewIndex(near);
			}
		};

		const settleToActive = () => {
			const box = tabsRef.current?.[activeIndexRef.current];
			if (!box) return;
			runAnims([
				[x, box.x, SETTLE_SPRING],
				[width, box.width, SETTLE_SPRING],
				[scaleX, 1, RELEASE_SPRING],
				[scaleY, 1, RELEASE_SPRING]
			]);
		};

		const onUp = (upEvent: PointerEvent) => {
			const current = dragRef.current;
			if (!current || upEvent.pointerId !== current.pointerId) return;
			detachRef.current();
			dragRef.current = null;
			if (previewRef.current !== null) {
				previewRef.current = null;
				setPreviewIndex(null);
			}

			if (!current.moved) {
				// 누르기만 한 경우 — 링크 기본 동작에 맡기고 눌림만 되돌려요
				runAnims([
					[scaleX, 1, RELEASE_SPRING],
					[scaleY, 1, RELEASE_SPRING]
				]);
				return;
			}

			armClickGuard();
			const liveBoxes = tabsRef.current;
			const target = liveBoxes ? clamp(Math.round(fractionalIndex(liveBoxes, x.get() + width.get() / 2)), 0, liveBoxes.length - 1) : activeIndexRef.current;
			const box = liveBoxes?.[target] ?? { x: x.get(), width: width.get() };
			runAnims([
				[x, box.x, SETTLE_SPRING],
				[width, box.width, SETTLE_SPRING],
				[scaleX, 1, RELEASE_SPRING],
				[scaleY, 1, RELEASE_SPRING]
			]);
			if (target !== activeIndexRef.current) {
				router.push(getNavHref(navLinks[target], statusRef.current));
			}
		};

		const onCancel = () => {
			detachRef.current();
			dragRef.current = null;
			if (previewRef.current !== null) {
				previewRef.current = null;
				setPreviewIndex(null);
			}
			settleToActive();
		};

		detachRef.current = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onCancel);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
	};

	const highlightIndex = previewIndex ?? activeIndex;

	return (
		<nav
			aria-label="모바일 탭 바로가기"
			className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-overlay) flex justify-center px-2.5 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden"
		>
			<div
				ref={containerRef}
				onPointerDown={handlePointerDown}
				// 링크를 잡고 끌면 브라우저가 네이티브 링크 드래그를 시작해 pointercancel로 제스처가 끊겨요
				onDragStart={(event) => event.preventDefault()}
				className="pointer-events-auto relative flex w-full max-w-[26rem] touch-pan-y select-none rounded-full border border-border-subtle bg-background/60 p-1.5 shadow-lg backdrop-blur-xl"
			>
				{tabs && activeIndex >= 0 && (
					<m.span
						aria-hidden
						className="absolute top-1.5 bottom-1.5 left-0 rounded-full bg-primary-control/15 will-change-transform"
						style={{ x, width, scaleX, scaleY }}
					/>
				)}
				{navLinks.map((link, index) => {
					const Icon = tabIcons[link.href] ?? Activity;
					const active = index === highlightIndex;
					return (
						<Link
							key={link.href}
							ref={(el) => {
								itemRefs.current[index] = el;
							}}
							href={getNavHref(link, status)}
							aria-current={index === activeIndex ? "page" : undefined}
							className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 py-1.5 text-2xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
								active ? "text-primary-text" : "text-muted-foreground"
							}`}
						>
							<Icon size={20} aria-hidden />
							<span className="max-w-full truncate">{link.label}</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}
