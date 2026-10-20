"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Layers, MessageSquare, Moon, Palette, PanelLeft, Sun, Table2, Tags, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { DataSection } from "./_sections/data-section";
import { DiscordSection } from "./_sections/discord-section";
import { FoundationSection } from "./_sections/foundation-section";
import { OverlaySection } from "./_sections/overlay-section";
import { PrimitivesSection } from "./_sections/primitives-section";
import { SurfacesSection } from "./_sections/surfaces-section";
import { TokensSection } from "./_sections/tokens-section";

const SECTIONS = [
	{ id: "foundation", label: "Foundation", icon: <Palette size={14} /> },
	{ id: "tokens", label: "Tokens", icon: <Tags size={14} /> },
	{ id: "surfaces", label: "Surfaces", icon: <Layers size={14} /> },
	{ id: "primitives", label: "Primitives", icon: <Zap size={14} /> },
	{ id: "data", label: "Data", icon: <Table2 size={14} /> },
	{ id: "overlay", label: "Overlay", icon: <PanelLeft size={14} /> },
	{ id: "discord", label: "Discord", icon: <MessageSquare size={14} /> },
];

function ThemeToggle() {
	const { theme, setTheme, resolvedTheme } = useTheme();
	const [mounted, setMounted] = React.useState(false);
	const currentTheme = resolvedTheme ?? theme;
	const isDark = currentTheme === "dark";

	React.useEffect(() => setMounted(true), []);

	if (!mounted) {
		return (
			<Button variant="ghost" size="sm" icon={<Moon size={16} />} disabled>
				테마
			</Button>
		);
	}

	return (
		<Button
			variant="ghost"
			size="sm"
			icon={isDark ? <Sun size={16} /> : <Moon size={16} />}
			onClick={() => setTheme(isDark ? "light" : "dark")}
		>
			{isDark ? "라이트 모드" : "다크 모드"}
		</Button>
	);
}

export default function DesignPage() {
	const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

	const tocRefs = useRef<(HTMLAnchorElement | null)[]>([]);
	// 클릭으로 시작된 smooth 스크롤이 끝날 때까지 스크롤 핸들러의 활성 섹션 재계산을 잠가요.
	// 잠그지 않으면 스크롤 비행 중간 위치 샘플로 이전 섹션이 다시 활성화돼 "클릭한 것의 하나 위"가 선택돼 보여요.
	const clickTargetRef = useRef<string | null>(null);
	const clickLockTimerRef = useRef<number>(undefined);

	useEffect(() => {
		const handleScroll = () => {
			if (clickTargetRef.current) return;
			const sectionElements = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
			let activeId = SECTIONS[0].id;

			for (const el of sectionElements) {
				const rect = el.getBoundingClientRect();
				if (rect.top <= 160) {
					activeId = el.id;
				}
			}

			setActiveSection(activeId);
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		setTimeout(handleScroll, 100);
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	const handleTocClick = (id: string) => {
		clickTargetRef.current = id;
		setActiveSection(id);
		// 앵커 이동은 기본 동작(href)에 맡기고, smooth 스크롤 완료 여유(1s) 후 잠금 해제
		window.clearTimeout(clickLockTimerRef.current);
		clickLockTimerRef.current = window.setTimeout(() => {
			clickTargetRef.current = null;
		}, 1000);
	};

	return (
		<>
			{/* 스티키 navbar은 흐름 공간을 차지하므로 별도 클리어런스 없이 바로 아래에서 시작 */}
			<div className="container mx-auto max-w-7xl px-4 pb-8">
				<div className="flex items-start justify-between gap-4 mb-8">
					<div>
						<h1 className="text-3xl font-black tracking-tighter text-foreground">Design System</h1>
						<p className="text-sm text-muted-foreground font-medium mt-1">SiruBOT 대시보드 UI 토큰과 컴포넌트 갤러리</p>
					</div>
					<ThemeToggle />
				</div>

				<div className="flex gap-8">
					<nav className="hidden lg:block w-52 shrink-0">
						<div className="sticky top-[calc(var(--navbar-h)+3rem)] space-y-1 max-h-[calc(100svh-var(--navbar-h)-4rem)] overflow-y-auto pr-2">
							{SECTIONS.map((s, idx) => {
								const isActive = activeSection === s.id;
								return (
									<a
										key={s.id}
										ref={(el) => {
											tocRefs.current[idx] = el;
										}}
										href={`#${s.id}`}
										onClick={() => handleTocClick(s.id)}
										className={cn(
											"flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-fast",
											isActive
												? "text-primary-text font-bold bg-primary-control/10"
												: "text-muted-foreground hover:text-foreground hover:bg-accent/30",
										)}
									>
										{s.icon}
										{s.label}
									</a>
									);
								})}
							</div>
						</nav>

					<main className="flex-1 min-w-0 space-y-4">
						<FoundationSection />
						<TokensSection />
						<SurfacesSection />
						<PrimitivesSection />
						<DataSection />
						<OverlaySection />
						<DiscordSection />
						<div className="h-24" />
					</main>
				</div>
			</div>
		</>
	);
}
