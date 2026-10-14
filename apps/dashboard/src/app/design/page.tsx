"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
	Activity,
	ChevronDown,
	Command,
	Cpu,
	Home,
	Layers,
	MessageSquare,
	Moon,
	Palette,
	PanelLeft,
	RadioTower,
	Search,
	Server,
	Settings,
	Sun,
	Table2,
	Tags,
	Trash2,
	Users,
	Zap,
} from "lucide-react";

import { type Column, DataTable } from "@/components/data/data-table";
import { StatCard } from "@/components/data/stat-card";
import { TagInput } from "@/components/data/tag-input";
import { ChannelMessage } from "@/components/discord/channel-message";
import { EmbedPreview } from "@/components/discord/embed-preview";
import { DISCORD_PERMISSIONS, PermissionList } from "@/components/discord/permission-list";
import { type DiscordRole, RoleSelect } from "@/components/discord/role-select";
import { EmptyState } from "@/components/primitives/empty-state";
import { Field } from "@/components/primitives/field";
import { SectionLabel } from "@/components/primitives/section-label";
import { StatusDot } from "@/components/primitives/status-dot";
import { SearchableSelect } from "@/components/servers/searchable-select";
import { SaveBar } from "@/components/servers/settings-shared";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { SkeletonCard, SkeletonCircle, SkeletonLine } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const SECTIONS = [
	{ id: "foundation", label: "Foundation", icon: <Palette size={14} /> },
	{ id: "tokens", label: "Tokens", icon: <Tags size={14} /> },
	{ id: "surfaces", label: "Surfaces", icon: <Layers size={14} /> },
	{ id: "primitives", label: "Primitives", icon: <Zap size={14} /> },
	{ id: "data", label: "Data", icon: <Table2 size={14} /> },
	{ id: "overlay", label: "Overlay", icon: <PanelLeft size={14} /> },
	{ id: "discord", label: "Discord", icon: <MessageSquare size={14} /> },
];

const COLOR_TOKENS = [
	"background",
	"foreground",
	"card",
	"popover",
	"primary",
	"primary-control",
	"primary-text",
	"secondary",
	"muted",
	"accent",
	"destructive",
	"success",
	"warning",
	"info",
	"border",
	"surface-1",
	"surface-2",
	"surface-3",
	"discord-embed",
	"discord-text",
];

function SectionHeader({ id, title, description }: { id: string; title: string; description: string }) {
	return (
		<div id={id} className="scroll-mt-28 space-y-2 mb-6">
			<div className="flex items-center gap-6">
				<div className="h-0.5 w-12 bg-primary/40 rounded-full" />
				<h2 className="text-2xl font-black tracking-tighter text-foreground whitespace-nowrap">{title}</h2>
				<div className="h-px flex-1 bg-gradient-to-r from-border/80 to-transparent" />
			</div>
			<p className="text-sm text-muted-foreground font-medium ml-[72px]">{description}</p>
		</div>
	);
}

function Showcase({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<Card className={cn("mb-12", className)} padding="lg">
			{children}
		</Card>
	);
}

function ShowcaseRow({ label, children, block = false }: { label: string; children: React.ReactNode; block?: boolean }) {
	return (
		<div className="space-y-3">
			<p className="text-xs font-medium text-muted-foreground">{label}</p>
			{block ? (
				<div className="space-y-4">{children}</div>
			) : (
				<div className="flex flex-wrap items-center gap-3">{children}</div>
			)}
		</div>
	);
}

// Tailwind v4는 `bg-${token}` 같은 동적 클래스 문자열을 CSS에 포함시키지 않아요 — 토큰별 명시적 맵을 써요
const COLOR_TOKEN_BG: Record<string, string> = {
	background: "bg-background",
	foreground: "bg-foreground",
	card: "bg-card",
	popover: "bg-popover",
	primary: "bg-primary",
	"primary-control": "bg-primary-control",
	"primary-text": "bg-primary-text",
	secondary: "bg-secondary",
	muted: "bg-muted",
	accent: "bg-accent",
	destructive: "bg-destructive",
	success: "bg-success",
	warning: "bg-warning",
	info: "bg-info",
	border: "bg-border",
	"surface-1": "bg-surface-1",
	"surface-2": "bg-surface-2",
	"surface-3": "bg-surface-3",
	"discord-embed": "bg-discord-embed",
	"discord-text": "bg-discord-text",
};

function ColorSwatch({ token }: { token: string }) {
	return (
		<div className="flex items-center gap-2">
			<div className={cn("h-8 w-8 shrink-0 rounded-menu border border-border shadow-sm", COLOR_TOKEN_BG[token])} />
			<span className="text-xs font-medium text-muted-foreground">{token}</span>
		</div>
	);
}

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

function ToastDemo() {
	const toast = useToast();

	return (
		<ShowcaseRow label="토스트 트리거">
			<Button variant="ghost" size="sm" onClick={() => toast.success("저장 완료!", "변경사항이 저장되었어요.")}>
				성공
			</Button>
			<Button variant="ghost" size="sm" onClick={() => toast.error("오류 발생", "네트워크 에러입니다.")}>
				에러
			</Button>
			<Button variant="ghost" size="sm" onClick={() => toast.info("안내", "새로운 업데이트가 있어요.")}>
				정보
			</Button>
			<Button variant="ghost" size="sm" onClick={() => toast.warning("주의", "쿨타임이 거의 끝났어요.")}>
				경고
			</Button>
		</ShowcaseRow>
	);
}

export default function DesignPage() {
	const [switchVal, setSwitchVal] = useState(true);
	const [sliderVal, setSliderVal] = useState(60);
	const [modalOpen, setModalOpen] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [cmdOpen, setCmdOpen] = useState(false);
	const [selectValue, setSelectValue] = useState<string>("");
	const [tags, setTags] = useState(["음악", "봇"]);
	const [permissions, setPermissions] = useState(0);
	const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
	const [searchableValue, setSearchableValue] = useState<string>("");
	const [selectedChannels, setSelectedChannels] = useState<string[]>(["general", "music"]);
	const [saveBarDemo, setSaveBarDemo] = useState(false);
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

	const sampleRoles: DiscordRole[] = [
		{ id: "1", name: "관리자", color: 0xe74c3c, position: 10 },
		{ id: "2", name: "모더레이터", color: 0x3498db, position: 8 },
		{ id: "3", name: "DJ", color: 0x9b59b6, position: 6 },
		{ id: "4", name: "멤버", color: 0x2ecc71, position: 4 },
		{ id: "5", name: "봇", color: 0x95a5a6, position: 2 },
	];

	interface TableRow {
		id: string;
		name: string;
		artist: string;
		plays: number;
		duration: string;
	}

	const tableColumns: Column<TableRow>[] = [
		{ key: "id", header: "#", width: "60px", align: "center" },
		{ key: "name", header: "트랙명", sortable: true },
		{ key: "artist", header: "아티스트", sortable: true },
		{
			key: "plays",
			header: "재생 수",
			sortable: true,
			align: "right",
			render: (r) => <span className="text-primary-text font-black tabular-nums">{r.plays.toLocaleString()}</span>,
		},
		{ key: "duration", header: "길이", align: "right" },
	];

	const tableData: TableRow[] = [
		{ id: "1", name: "Blinding Lights", artist: "The Weeknd", plays: 12840, duration: "3:22" },
		{ id: "2", name: "Dynamite", artist: "BTS", plays: 9521, duration: "3:19" },
		{ id: "3", name: "Levitating", artist: "Dua Lipa", plays: 8432, duration: "3:23" },
		{ id: "4", name: "Peaches", artist: "Justin Bieber", plays: 7214, duration: "3:18" },
		{ id: "5", name: "좋은 날", artist: "IU", plays: 6891, duration: "3:56" },
	];

	const commandItems = [
		{ id: "home", label: "홈으로 이동", icon: <Home size={16} />, group: "페이지", onSelect: () => setCmdOpen(false) },
		{ id: "shards", label: "샤드 상태", icon: <Server size={16} />, group: "페이지", onSelect: () => setCmdOpen(false) },
		{ id: "track", label: "재생 순위", icon: <RadioTower size={16} />, group: "페이지", onSelect: () => setCmdOpen(false) },
		{ id: "settings", label: "설정 열기", icon: <Settings size={16} />, group: "명령어", shortcut: "⌘,", onSelect: () => setCmdOpen(false) },
		{ id: "search", label: "검색", icon: <Search size={16} />, group: "명령어", shortcut: "⌘F", onSelect: () => setCmdOpen(false) },
	];

	const tabItems = [
		{ value: "overview", label: "개요", icon: <Home size={14} /> },
		{ value: "settings", label: "설정", icon: <Settings size={14} /> },
		{ value: "logs", label: "로그", badge: <Badge size="sm">3</Badge> },
	];

	return (
		<>
			{/* 고정 navbar(h-16) 클리어런스는 Container 컨벤션(pt-16 lg:pt-24)과 동일하게 — 겹침 방지 */}
			<div className="container mx-auto max-w-7xl px-4 pb-8 pt-16 lg:pt-24">
				<div className="flex items-start justify-between gap-4 mb-8">
					<div>
						<h1 className="text-3xl font-black tracking-tighter text-foreground">Design System</h1>
						<p className="text-sm text-muted-foreground font-medium mt-1">SiruBOT 대시보드 UI 토큰과 컴포넌트 갤러리</p>
					</div>
					<ThemeToggle />
				</div>

				<div className="flex gap-8">
					<nav className="hidden lg:block w-52 shrink-0">
						<div className="sticky top-28 space-y-1 max-h-[calc(100svh-8rem)] overflow-y-auto pr-2">
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
						<SectionHeader
							id="foundation"
							title="Foundation"
							description="Tailwind v4 + shadcn registry CSS 통합 기반의 디자인 시스템"
						/>
						<Showcase>
							<p className="text-sm text-muted-foreground font-medium leading-relaxed">
								SiruBOT Dashboard uses Tailwind v4 + shadcn registry CSS integration. UI components are customized in{" "}
								<code className="rounded-control bg-muted px-1.5 py-0.5 text-xs text-foreground">src/components/ui/</code>{" "}
								to match our tokens.
							</p>
							<div className="rounded-card bg-muted p-4 overflow-x-auto">
								<pre className="text-xs text-muted-foreground font-medium">
									{JSON.stringify(
										{
											style: "base-nova",
											rsc: true,
											tsx: true,
											iconLibrary: "lucide",
											aliases: {
												components: "@/components",
												utils: "@/lib/utils",
												ui: "@/components/ui",
												lib: "@/lib",
												hooks: "@/hooks",
											},
										},
										null,
										2,
									)}
								</pre>
							</div>
						</Showcase>

						<SectionHeader
							id="tokens"
							title="Tokens"
							description="색상, 타이포그래피, 반경, 그림자, 모션 토큰"
						/>
						<Showcase className="space-y-8">
							<ShowcaseRow label="Colors">
								{COLOR_TOKENS.map((token) => (
									<ColorSwatch key={token} token={token} />
								))}
							</ShowcaseRow>

							<ShowcaseRow label="Typography">
								<div className="space-y-2">
									<p className="text-2xs text-muted-foreground">text-2xs</p>
									<p className="text-xs text-muted-foreground">text-xs</p>
									<p className="text-sm text-muted-foreground">text-sm</p>
									<p className="text-base text-foreground">text-base</p>
									<p className="text-lg text-foreground">text-lg</p>
									<p className="text-xl text-foreground">text-xl</p>
									<p className="text-2xl text-foreground">text-2xl</p>
									<p className="text-3xl text-foreground">text-3xl</p>
									<p className="text-4xl text-foreground">text-4xl</p>
									<p className="text-4xl font-black tracking-tighter text-primary-text">Title Sample</p>
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="Radius">
								<div className="h-16 w-32 rounded-control border border-border bg-surface-1 p-3 text-xs font-medium text-muted-foreground">rounded-control</div>
								<div className="h-16 w-32 rounded-card border border-border bg-surface-1 p-3 text-xs font-medium text-muted-foreground">rounded-card</div>
								<div className="h-16 w-32 rounded-menu border border-border bg-surface-1 p-3 text-xs font-medium text-muted-foreground">rounded-menu</div>
								<div className="h-16 w-32 rounded-dialog border border-border bg-surface-1 p-3 text-xs font-medium text-muted-foreground">rounded-dialog</div>
							</ShowcaseRow>

							<ShowcaseRow label="Shadows">
								<div className="h-16 w-32 rounded-card border border-border bg-card p-3 text-xs font-medium text-muted-foreground shadow-sm">shadow-sm</div>
								<div className="h-16 w-32 rounded-card border border-border bg-card p-3 text-xs font-medium text-muted-foreground shadow-md">shadow-md</div>
								<div className="h-16 w-32 rounded-card border border-border bg-card p-3 text-xs font-medium text-muted-foreground shadow-lg">shadow-lg</div>
								<div className="h-16 w-32 rounded-card border border-border bg-card p-3 text-xs font-medium text-muted-foreground shadow-2xl">shadow-2xl</div>
							</ShowcaseRow>

							<ShowcaseRow label="Motion">
								<div className="h-12 w-24 rounded-control border border-border bg-surface-1 flex items-center justify-center text-xs font-medium text-muted-foreground transition-colors duration-fast hover:bg-primary">fast</div>
								<div className="h-12 w-24 rounded-control border border-border bg-surface-1 flex items-center justify-center text-xs font-medium text-muted-foreground transition-colors duration-base hover:bg-primary">base</div>
								<div className="h-12 w-24 rounded-control border border-border bg-surface-1 flex items-center justify-center text-xs font-medium text-muted-foreground transition-colors duration-slow hover:bg-primary">slow</div>
							</ShowcaseRow>
						</Showcase>

						<SectionHeader
							id="surfaces"
							title="Surfaces"
							description="배경과 표면 위계"
						/>
						<Showcase>
							<ShowcaseRow label="Surface layers" block>
								<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
									<div className="h-24 rounded-card border border-border bg-background p-3 text-xs font-medium text-muted-foreground">bg-background</div>
									<div className="h-24 rounded-card border border-border bg-card p-3 text-xs font-medium text-muted-foreground">bg-card</div>
									<div className="h-24 rounded-card border border-border bg-surface-1 p-3 text-xs font-medium text-muted-foreground">bg-surface-1</div>
									<div className="h-24 rounded-card border border-border bg-surface-2 p-3 text-xs font-medium text-muted-foreground">bg-surface-2</div>
									<div className="h-24 rounded-card border border-border bg-surface-3 p-3 text-xs font-medium text-muted-foreground">bg-surface-3</div>
									<div className="h-24 rounded-card border border-border bg-popover p-3 text-xs font-medium text-muted-foreground">bg-popover</div>
									<div className="h-24 rounded-card border border-border bg-input p-3 text-xs font-medium text-muted-foreground">bg-input</div>
									<div className="h-24 rounded-card border border-border bg-muted p-3 text-xs font-medium text-muted-foreground">bg-muted</div>
								</div>
							</ShowcaseRow>
						</Showcase>

						<SectionHeader
							id="primitives"
							title="Primitives"
							description="shadcn 기반 UI 컴포넌트"
						/>
						<Showcase className="space-y-8">
							<ShowcaseRow label="Button variants">
								<Button>default</Button>
								<Button variant="primary">primary</Button>
								<Button variant="secondary">secondary</Button>
								<Button variant="ghost">ghost</Button>
								<Button variant="danger">danger</Button>
								<Button variant="outline">outline</Button>
								<Button variant="icon" icon={<Settings size={18} />} />
								<Button variant="state-toggle" active>
									active
								</Button>
								<Button variant="cta">cta</Button>
								<Button variant="link">link</Button>
							</ShowcaseRow>

							<ShowcaseRow label="Button sizes">
								<Button size="sm">sm</Button>
								<Button size="md">md</Button>
								<Button size="lg">lg</Button>
							</ShowcaseRow>

							<ShowcaseRow label="Card" block>
								{/* 카드는 실제 페이지처럼 page background 위에서 보여줘요 — 쇼케이스 카드와 같은 색이면 경계가 안 보여요 */}
								<div className="flex flex-wrap items-start gap-4 rounded-card bg-background p-4">
									<Card className="max-w-xs">
										<CardHeader>
											<CardTitle>Card title</CardTitle>
											<CardDescription>Card description</CardDescription>
										</CardHeader>
										<CardContent>
											<p className="text-sm text-muted-foreground">카드 콘텐츠 영역</p>
										</CardContent>
										<CardFooter>
											<Button size="sm">확인</Button>
										</CardFooter>
									</Card>
									<Card variant="muted" className="max-w-xs">
										<CardHeader>
											<CardTitle>Muted</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-sm text-muted-foreground">bg-muted</p>
										</CardContent>
									</Card>
									<Card variant="raised" className="max-w-xs">
										<CardHeader>
											<CardTitle>Raised</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-sm text-muted-foreground">shadow-sm</p>
										</CardContent>
									</Card>
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="Input / Textarea">
								<Input placeholder="텍스트 입력" className="max-w-xs" />
								<Input placeholder="비활성화" disabled className="max-w-xs" />
								<Input defaultValue="잘못된 값" aria-invalid className="max-w-xs" />
								<Textarea placeholder="여러 줄 입력" className="max-w-md" />
							</ShowcaseRow>

							<ShowcaseRow label="Field" block>
								{/* 설명/오류 문구가 달라도 인풋 라인이 일직선이 되도록 위 정렬 */}
								<div className="grid items-start gap-4 sm:grid-cols-3">
									<Field label="기본 필드" description="설명 문구가 아래에 표시돼요.">
										{({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} placeholder="값 입력" />}
									</Field>
									<Field label="필수 필드" required>
										{({ id, invalid }) => <Input id={id} aria-invalid={invalid || undefined} placeholder="반드시 입력" />}
									</Field>
									<Field label="오류 필드" error="값이 올바르지 않아요.">
										{({ id, describedBy, invalid }) => (
											<Input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} defaultValue="오류" />
										)}
									</Field>
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="Badge">
								<Badge>default</Badge>
								<Badge variant="primary">primary</Badge>
								<Badge variant="success" dot>
									success
								</Badge>
								<Badge variant="warning" dot>
									warning
								</Badge>
								<Badge variant="danger" dot>
									danger
								</Badge>
								<Badge variant="info">info</Badge>
								<Badge variant="discord">BOT</Badge>
								<Badge variant="primary" dismissible onDismiss={() => {}}>
									dismissible
								</Badge>
							</ShowcaseRow>

							<ShowcaseRow label="StatusDot">
								<StatusDot status="ready" label="READY" />
								<StatusDot status="idle" label="IDLE" />
								<StatusDot status="connecting" label="CONNECTING" />
								<StatusDot status="disconnected" label="DISCONNECTED" />
								<StatusDot status="errored" label="ERRORED" />
								<div className="flex items-center gap-2">
									<StatusDot size="sm" status="ready" />
									<StatusDot size="md" status="ready" />
									<StatusDot size="lg" status="ready" />
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="SectionLabel">
								<SectionLabel as="p">최근 재생</SectionLabel>
								<SectionLabel as="p">플레이리스트</SectionLabel>
								<SectionLabel as="p" className="px-0">
									패딩 없음
								</SectionLabel>
							</ShowcaseRow>

							<ShowcaseRow label="EmptyState" block>
								<div className="grid items-start gap-4 md:grid-cols-2">
									<EmptyState title="아직 곡이 없어요." description="플레이리스트를 채워보세요." />
									<EmptyState
										size="sm"
										icon={Search}
										title="검색 결과가 없어요."
										description="다른 키워드로 다시 검색해보세요."
										action={<Button size="sm">다시 검색</Button>}
										secondaryAction={<Button size="sm" variant="ghost">초기화</Button>}
									/>
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="Avatar">
								<Avatar fallback="시" size="xs" />
								<Avatar fallback="시" size="sm" />
								<Avatar fallback="시" size="md" ring />
								<Avatar fallback="시" size="lg" ring />
								<Avatar fallback="A" size="md" status="online" />
								<Avatar fallback="B" size="md" status="idle" />
								<Avatar fallback="C" size="md" status="dnd" />
								<Avatar fallback="D" size="md" status="offline" />
							</ShowcaseRow>

							<ShowcaseRow label="Skeleton" block>
								{/* 스켈레톤은 실제 페이지처럼 page background 위에서 — 쇼케이스 표면과 같은 색이면 대비가 없어요 */}
								<div className="rounded-card bg-background p-4">
									<div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
										<SkeletonCard lines={3} avatar />
										<SkeletonCard lines={2} avatar={false} />
									</div>
									<div className="mt-4 flex items-center gap-3">
										<SkeletonLine width="200px" />
										<SkeletonCircle size="h-12 w-12" />
									</div>
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="Tabs">
								<Tabs defaultValue="overview">
									<TabsList>
										{tabItems.map((item) => (
											<TabsTrigger key={item.value} value={item.value}>
												<span className="inline-flex items-center gap-1.5">
													{item.icon}
													{item.label}
													{item.badge}
												</span>
											</TabsTrigger>
										))}
									</TabsList>
									<TabsContent value="overview">
										<p className="text-sm text-muted-foreground">개요 패널 내용입니다.</p>
									</TabsContent>
									<TabsContent value="settings">
										<p className="text-sm text-muted-foreground">설정 패널 내용입니다.</p>
									</TabsContent>
									<TabsContent value="logs">
										<p className="text-sm text-muted-foreground">로그 패널 내용입니다.</p>
									</TabsContent>
								</Tabs>
							</ShowcaseRow>

							<ShowcaseRow label="Slider" block>
								<div className="w-full max-w-sm space-y-6">
									<Slider value={sliderVal} onChange={setSliderVal} label="볼륨" showValue formatValue={(v) => `${v}%`} />
									<Slider value={30} onChange={() => {}} min={0} max={60} step={5} label="쿨다운" showValue formatValue={(v) => `${v}초`} />
									<Slider value={50} onChange={() => {}} disabled label="비활성" />
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="Switch">
								<Switch checked={switchVal} onChange={setSwitchVal} label="알림 받기" />
								<Switch checked={!switchVal} onChange={(v) => setSwitchVal(!v)} label="자동 재생" />
								<Switch checked disabled label="활성화" size="sm" />
								<Switch checked={false} disabled label="비활성화" size="sm" />
							</ShowcaseRow>
						</Showcase>

						<SectionHeader
							id="data"
							title="Data"
							description="데이터 표시와 입력 컴포넌트"
						/>
						<Showcase className="space-y-8">
							<ShowcaseRow label="DataTable" block>
								<DataTable columns={tableColumns} data={tableData} keyExtractor={(r) => r.id} />
							</ShowcaseRow>

							<ShowcaseRow label="TagInput" block>
								<div className="w-full max-w-md">
									<TagInput value={tags} onChange={setTags} placeholder="태그 입력 후 Enter" maxTags={8} />
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="StatCard" block>
								<div className="flex items-center gap-2 mb-4">
									<Badge size="sm">예시</Badge>
									<p className="text-xs font-medium text-muted-foreground">이 값들은 실제 측정이 아닌 컴포넌트 데모예요.</p>
								</div>
								<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
									<StatCard icon={Server} label="서버" value={1234} sub="전체 서버 수" trend="up" trendValue="+12%" />
									<StatCard icon={RadioTower} label="재생 중" value={89} sub="현재 재생" trend="down" trendValue="-3%" />
									<StatCard icon={Cpu} label="메모리" value="512MB" sub="사용 중" trend="neutral" trendValue="0%" />
									<StatCard icon={Activity} label="업타임" value="99.9%" sub="30일 평균" />
								</div>
							</ShowcaseRow>
						</Showcase>

						<SectionHeader
							id="overlay"
							title="Overlay"
							description="모달, 드로어, 메뉴, 토스트, 커맨드 팔레트"
						/>
						<Showcase className="space-y-8">
							<ShowcaseRow label="Modal (Dialog)">
								<Dialog open={modalOpen} onOpenChange={setModalOpen}>
									<DialogTrigger render={<Button variant="ghost" size="sm">모달 열기</Button>} />
									<DialogContent>
										<DialogHeader>
											<DialogTitle>설정 저장</DialogTitle>
											<DialogDescription>변경된 서버 설정을 저장하시겠어요? 이 작업은 즉시 적용됩니다.</DialogDescription>
										</DialogHeader>
										<DialogFooter>
											<Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
												취소
											</Button>
											<Button size="sm" onClick={() => setModalOpen(false)}>
												저장하기
											</Button>
										</DialogFooter>
									</DialogContent>
								</Dialog>
							</ShowcaseRow>

							<ShowcaseRow label="Drawer (Sheet)">
								<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
									<SheetTrigger render={<Button variant="ghost" size="sm">드로어 열기</Button>} />
									<SheetContent>
										<SheetHeader>
											<SheetTitle>서버 설정</SheetTitle>
											<SheetDescription>서버 설정 내용이 여기에 표시됩니다.</SheetDescription>
										</SheetHeader>
										<div className="space-y-6 px-4">
											<Switch checked disabled={false} label="자동 DJ 모드" />
											<Switch checked={false} label="24시간 재생" />
											<Slider value={80} onChange={() => {}} label="기본 볼륨" showValue formatValue={(v) => `${v}%`} />
										</div>
										<SheetFooter>
											<Button size="sm" onClick={() => setSheetOpen(false)}>
												닫기
											</Button>
										</SheetFooter>
									</SheetContent>
								</Sheet>
							</ShowcaseRow>

							<ShowcaseRow label="DropdownMenu">
								<DropdownMenu>
									<DropdownMenuTrigger
										render={
											<Button variant="secondary" size="sm" icon={<ChevronDown size={14} />}>
												메뉴
											</Button>
										}
									/>
									<DropdownMenuContent>
										<DropdownMenuGroup>
											<DropdownMenuLabel>일반</DropdownMenuLabel>
											<DropdownMenuItem onClick={() => {}}>
												<Settings size={14} />
												서버 설정
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => {}}>
												<Users size={14} />
												멤버 관리
											</DropdownMenuItem>
										</DropdownMenuGroup>
										<DropdownMenuSeparator />
										<DropdownMenuGroup>
											<DropdownMenuItem variant="destructive" onClick={() => {}}>
												<Trash2 size={14} />
												서버 나가기
											</DropdownMenuItem>
										</DropdownMenuGroup>
									</DropdownMenuContent>
								</DropdownMenu>
							</ShowcaseRow>

							<ShowcaseRow label="Select">
								<Select value={selectValue} onValueChange={(value) => setSelectValue(value ?? "")}>
									<SelectTrigger className="w-56">
										<SelectValue placeholder="언어 선택" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectLabel>아시아</SelectLabel>
											<SelectItem value="kr">한국어</SelectItem>
											<SelectItem value="jp">日本語</SelectItem>
										</SelectGroup>
										<SelectGroup>
											<SelectLabel>유럽</SelectLabel>
											<SelectItem value="en">English</SelectItem>
											<SelectItem value="de">Deutsch</SelectItem>
											<SelectItem value="fr">Français</SelectItem>
										</SelectGroup>
									</SelectContent>
								</Select>
							</ShowcaseRow>

							<ShowcaseRow label="Command dialog">
								<Button variant="ghost" size="sm" icon={<Command size={14} />} onClick={() => setCmdOpen(true)}>
									커맨드 팔레트 열기
								</Button>
								<CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
									<CommandInput placeholder="명령어 검색..." />
									<CommandList>
										<CommandEmpty>결과가 없어요</CommandEmpty>
										{["페이지", "명령어"].map((group) => (
											<CommandGroup key={group} heading={group}>
												{commandItems
													.filter((item) => item.group === group)
													.map((item) => (
														<CommandItem key={item.id} onSelect={item.onSelect}>
															<span className="inline-flex items-center gap-2">
																{item.icon}
																{item.label}
															</span>
															{item.shortcut && <span className="text-xs text-muted-foreground">{item.shortcut}</span>}
														</CommandItem>
													))}
											</CommandGroup>
										))}
										</CommandList>
									</CommandDialog>
								</ShowcaseRow>

							<ShowcaseRow label="SaveBar (설정 저장 바)" block>
								<div className="space-y-3">
									<div className="flex gap-2">
										<Button variant="secondary" size="sm" onClick={() => setSaveBarDemo(true)}>
											저장 바 보기
										</Button>
										<Button variant="ghost" size="sm" onClick={() => setSaveBarDemo(false)}>
											숨기기
										</Button>
									</div>
									<p className="text-xs text-muted-foreground">
										실제 설정 페이지에서는 저장하지 않은 변경이 있을 때 화면 하단에 플로팅으로 떠요.
									</p>
								</div>
								<SaveBar dirty={saveBarDemo} saving={false} onSave={() => setSaveBarDemo(false)} />
							</ShowcaseRow>

							<ToastDemo />
						</Showcase>

						<SectionHeader
							id="discord"
							title="Discord"
							description="Discord 스타일 UI 컴포넌트"
						/>
						<Showcase className="space-y-8">
							<ShowcaseRow label="EmbedPreview">
								<EmbedPreview
									embed={{
										color: "var(--primary)",
										author: { name: "시루" },
										title: "지금 재생 중",
										titleUrl: "#",
										description: "Blinding Lights · The Weeknd",
										fields: [
											{ name: "요청자", value: "@음악러버", inline: true },
											{ name: "길이", value: "3:22", inline: true },
											{ name: "대기열", value: "4곡", inline: true },
										],
										footer: { text: "시루 뮤직", timestamp: "오늘 오후 3:42" },
									}}
								/>
							</ShowcaseRow>

							<ShowcaseRow label="ChannelMessage" block>
								<div className="w-full max-w-xl overflow-hidden rounded-xl bg-discord-bg py-2">
									<ChannelMessage
										author={{ id: "bot", username: "시루", bot: true }}
										content="🎵 지금 재생 중: **Blinding Lights** · The Weeknd"
										timestamp="오후 3:42"
									>
										<div className="mt-2">
											<EmbedPreview
												embed={{
													color: "var(--primary)",
													title: "Blinding Lights",
													description: "The Weeknd · After Hours · 2020",
													footer: { text: "3:22 · 대기열 4곡" },
												}}
											/>
										</div>
									</ChannelMessage>
									<ChannelMessage
										author={{ id: "user1", username: "음악러버" }}
										content="좋은 노래 감사합니다! 다음 곡도 기대됩니다 😊"
										timestamp="오후 3:43"
									/>
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="PermissionList" block>
								<div className="w-full max-w-xl">
									<PermissionList categories={DISCORD_PERMISSIONS.slice(0, 2)} value={permissions} onChange={setPermissions} />
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="RoleSelect" block>
								<div className="w-full max-w-sm">
									<RoleSelect roles={sampleRoles} value={selectedRoles} onChange={setSelectedRoles} />
								</div>
							</ShowcaseRow>

							<ShowcaseRow label="SearchableSelect" block>
								<div className="w-full max-w-sm space-y-3">
									<SearchableSelect
										options={[
											{ value: "kr", label: "한국어", group: "아시아" },
											{ value: "jp", label: "日本語", group: "아시아" },
											{ value: "en", label: "English", group: "유럽" },
											{ value: "de", label: "Deutsch", group: "유럽" },
										]}
										value={searchableValue}
										onChange={(value) => setSearchableValue(value)}
										placeholder="언어 선택 (검색 가능)"
									/>
									<SearchableSelect
										multiple
										options={[
											{ value: "general", label: "일반", group: "텍스트 채널" },
											{ value: "music", label: "음악", group: "텍스트 채널" },
											{ value: "notice", label: "공지", group: "텍스트 채널" },
											{ value: "voice", label: "기본 음성", group: "음성 채널" },
											{ value: "lounge", label: "라운지", group: "음성 채널" },
										]}
										value={selectedChannels}
										onChange={setSelectedChannels}
										placeholder="채널 선택 (다중 · 태그가 트리거 안쪽에 들어가요)"
									/>
								</div>
							</ShowcaseRow>
						</Showcase>

						<div className="h-24" />
					</main>
				</div>
			</div>
		</>
	);
}
