"use client";

import { useEffect, useRef, useState } from "react";

const W = 368;
const H = 168;
const GROUND = 140;
const SIZE = 24;
const PLAYER_X = 44;
const GRAVITY = 2600;
const JUMP_V = 800;
const BEST_KEY = "sirubot:404-best";

type Phase = "ready" | "running" | "over";

interface Obstacle {
	x: number;
	w: number;
	h: number;
}

function readBest() {
	try {
		return Number(localStorage.getItem(BEST_KEY)) || 0;
	} catch {
		return 0;
	}
}

function writeBest(score: number) {
	try {
		localStorage.setItem(BEST_KEY, String(score));
	} catch {
		// 저장 실패는 무시해요
	}
}

/**
 * 404 모니터 속 미니게임 — 시루(네모)가 달려오는 404 블록을 뛰어넘어요.
 * 스페이스/위 화살표/화면 터치로 점프하고, Esc나 닫기 버튼으로 모니터를 꺼요.
 * 색은 캔버스가 CSS 변수를 직접 읽어 테마를 따라가요.
 */
export function NotFoundGame({ onExit }: { onExit: () => void }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [phase, setPhase] = useState<Phase>("ready");
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const jumpRef = useRef<() => void>(() => {});

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return undefined;

		const css = getComputedStyle(document.documentElement);
		const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
		const bg = color("--background", "#1c1416");
		const accent = color("--primary-control", "#f98aa0");
		const fg = color("--foreground", "#ffffff");
		const muted = color("--muted-foreground", "#b8a5a9");

		let state: Phase = "ready";
		let y = GROUND - SIZE;
		let vy = 0;
		let obstacles: Obstacle[] = [];
		let distance = 0;
		let spawnIn = 0.8;
		let last = performance.now();
		let raf = 0;
		let bestScore = readBest();
		setBest(bestScore);

		const reset = () => {
			y = GROUND - SIZE;
			vy = 0;
			obstacles = [];
			distance = 0;
			spawnIn = 0.9;
		};

		const jump = () => {
			if (state === "over") {
				reset();
				state = "running";
				setPhase("running");
				return;
			}
			if (state === "ready") {
				state = "running";
				setPhase("running");
			}
			if (y >= GROUND - SIZE - 0.5) vy = -JUMP_V;
		};
		jumpRef.current = jump;

		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onExit();
				return;
			}
			if (event.code === "Space" || event.key === "ArrowUp") {
				event.preventDefault();
				jump();
			}
		};
		window.addEventListener("keydown", onKey);

		const draw = () => {
			ctx.fillStyle = bg;
			ctx.fillRect(0, 0, W, H);
			ctx.fillStyle = muted;
			ctx.globalAlpha = 0.5;
			ctx.fillRect(0, GROUND, W, 2);
			ctx.globalAlpha = 1;

			// 장애물 — 404 블록
			for (const o of obstacles) {
				ctx.fillStyle = muted;
				ctx.beginPath();
				ctx.roundRect(o.x, GROUND - o.h, o.w, o.h, 4);
				ctx.fill();
			}

			// 시루 — 둥근 네모와 눈
			ctx.fillStyle = accent;
			ctx.beginPath();
			ctx.roundRect(PLAYER_X, y, SIZE, SIZE, 7);
			ctx.fill();
			ctx.fillStyle = bg;
			ctx.beginPath();
			ctx.arc(PLAYER_X + 8, y + 10, 2.2, 0, Math.PI * 2);
			ctx.arc(PLAYER_X + 17, y + 10, 2.2, 0, Math.PI * 2);
			ctx.fill();

			ctx.fillStyle = fg;
			ctx.font = "700 18px sans-serif";
			ctx.textAlign = "right";
			ctx.fillText(String(Math.floor(distance / 10)).padStart(4, "0"), W - 14, 26);

			if (state !== "running") {
				ctx.textAlign = "center";
				ctx.font = "700 20px sans-serif";
				ctx.fillStyle = fg;
				ctx.fillText(state === "over" ? "게임 오버" : "스페이스나 화면을 눌러요", W / 2, 76);
				if (state === "over") {
					ctx.font = "500 15px sans-serif";
					ctx.fillStyle = muted;
					ctx.fillText("다시 누르면 이어서 달려요", W / 2, 100);
				}
			}
		};

		const tick = (now: number) => {
			const dt = Math.min((now - last) / 1000, 0.05);
			last = now;

			if (state === "running") {
				const speed = 300 + Math.min(distance / 40, 260);
				distance += speed * dt;
				vy += GRAVITY * dt;
				y = Math.min(y + vy * dt, GROUND - SIZE);
				if (y >= GROUND - SIZE) vy = 0;

				spawnIn -= dt;
				if (spawnIn <= 0) {
					const h = 22 + Math.random() * 20;
					obstacles.push({ x: W + 10, w: 14 + Math.random() * 12, h });
					spawnIn = 0.8 + Math.random() * 0.9 + 60 / speed;
				}
				for (const o of obstacles) o.x -= speed * dt;
				obstacles = obstacles.filter((o) => o.x + o.w > -10);

				// 충돌 — 살짝 너그럽게(2px)
				const hit = obstacles.some((o) => PLAYER_X + SIZE - 2 > o.x && PLAYER_X + 2 < o.x + o.w && y + SIZE - 2 > GROUND - o.h);
				setScore(Math.floor(distance / 10));
				if (hit) {
					state = "over";
					setPhase("over");
					const final = Math.floor(distance / 10);
					if (final > bestScore) {
						bestScore = final;
						writeBest(final);
						setBest(final);
					}
				}
			}
			draw();
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("keydown", onKey);
		};
	}, [onExit]);

	return (
		<div className="absolute inset-0 overflow-hidden rounded-[7px]">
			<canvas
				ref={canvasRef}
				width={W}
				height={H}
				onPointerDown={() => jumpRef.current()}
				aria-label={`404 미니게임. 점수 ${score}, 최고 ${best}. 스페이스나 위 화살표로 점프, Esc로 닫기`}
				role="application"
				className="h-full w-full cursor-pointer touch-none"
			/>
			<button
				type="button"
				onClick={onExit}
				aria-label="미니게임 닫기"
				className="absolute top-1 left-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-muted-foreground transition-colors duration-fast hover:text-foreground"
			>
				✕
			</button>
			<span className="sr-only" aria-live="polite">
				{phase === "over" ? `게임 오버. 점수 ${score}` : ""}
			</span>
		</div>
	);
}
