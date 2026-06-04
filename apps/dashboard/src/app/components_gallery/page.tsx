"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { m } from "framer-motion";
import {
	Activity,
	Bell,
	Calendar,
	ChevronDown,
	Command,
	Cpu,
	CreditCard,
	Globe,
	Hash,
	Home,
	Layers,
	Layout,
	List,
	Mail,
	MessageSquare,
	Palette,
	PanelLeft,
	RadioTower,
	Search,
	Server,
	Settings,
	Shield,
	Sliders,
	SquareTerminal,
	Table2,
	Tags,
	ToggleLeft,
	Trash2,
	User,
	Users,
	Zap,
} from "lucide-react";

import Container from "@/components/container";
import { type Column,DataTable } from "@/components/data/data-table";
import { StatCard } from "@/components/data/stat-card";
import { TagInput } from "@/components/data/tag-input";
import { ChannelMessage } from "@/components/discord/channel-message";
import { EmbedPreview } from "@/components/discord/embed-preview";
import { DISCORD_PERMISSIONS,PermissionList } from "@/components/discord/permission-list";
import { type DiscordRole,RoleSelect } from "@/components/discord/role-select";
import { type NotificationItem,NotificationStack } from "@/components/feedback/notification";
import { ToastProvider, useToast } from "@/components/feedback/toast";
import { Navigation } from "@/components/layout/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { CommandPalette } from "@/components/overlay/command-palette";
import { DatePicker } from "@/components/overlay/date-picker";
import { Drawer } from "@/components/overlay/drawer";
import { Dropdown } from "@/components/overlay/dropdown";
import { Modal, ModalBody, ModalFooter,ModalHeader } from "@/components/overlay/modal";
import { Select } from "@/components/overlay/select";
import { Avatar } from "@/components/primitives/avatar";
import { Badge } from "@/components/primitives/badge";
/* ── Import all components ── */
import { Button } from "@/components/primitives/button";
import { Skeleton, SkeletonCard,SkeletonCircle, SkeletonLine } from "@/components/primitives/skeleton";
import { Slider } from "@/components/primitives/slider";
import { StatusDot } from "@/components/primitives/status-dot";
import { Switch } from "@/components/primitives/switch";

/* ═══════════════════════════════════════════════════════════
   Gallery sections
   ═══════════════════════════════════════════════════════════ */

const SECTIONS = [
	{ id: "button", label: "Button", icon: <Zap size={14} /> },
	{ id: "badge", label: "Badge", icon: <Tags size={14} /> },
	{ id: "avatar", label: "Avatar", icon: <User size={14} /> },
	{ id: "status-dot", label: "StatusDot", icon: <Activity size={14} /> },
	{ id: "skeleton", label: "Skeleton", icon: <Layers size={14} /> },
	{ id: "switch", label: "Switch", icon: <ToggleLeft size={14} /> },
	{ id: "slider", label: "Slider", icon: <Sliders size={14} /> },
	{ id: "toast", label: "Toast", icon: <Bell size={14} /> },
	{ id: "notification", label: "Notification", icon: <Mail size={14} /> },
	{ id: "modal", label: "Modal", icon: <Layout size={14} /> },
	{ id: "drawer", label: "Drawer", icon: <PanelLeft size={14} /> },
	{ id: "dropdown", label: "Dropdown", icon: <ChevronDown size={14} /> },
	{ id: "select", label: "Select", icon: <List size={14} /> },
	{ id: "date-picker", label: "DatePicker", icon: <Calendar size={14} /> },
	{ id: "command-palette", label: "CommandPalette", icon: <Command size={14} /> },
	{ id: "navigation", label: "Navigation", icon: <Globe size={14} /> },
	{ id: "data-table", label: "DataTable", icon: <Table2 size={14} /> },
	{ id: "stat-card", label: "StatCard", icon: <CreditCard size={14} /> },
	{ id: "tag-input", label: "TagInput", icon: <Hash size={14} /> },
	{ id: "embed-preview", label: "EmbedPreview", icon: <MessageSquare size={14} /> },
	{ id: "channel-message", label: "ChannelMessage", icon: <MessageSquare size={14} /> },
	{ id: "permission-list", label: "PermissionList", icon: <Shield size={14} /> },
	{ id: "role-select", label: "RoleSelect", icon: <Users size={14} /> },
];

/* ─── Section header ─── */
function SectionHeader({ id, title, description }: { id: string; title: string; description: string }) {
	return (
		<div id={id} className="scroll-mt-28 space-y-2 mb-6">
			<div className="flex items-center gap-6">
				<div className="h-[2px] w-12 bg-primary/40 rounded-full" />
				<h2 className="text-2xl font-black tracking-tighter text-foreground whitespace-nowrap">
					{title}
				</h2>
				<div className="h-px flex-1 bg-gradient-to-r from-border/80 to-transparent" />
			</div>
			<p className="text-sm text-muted-foreground/60 font-medium ml-[72px]">{description}</p>
		</div>
	);
}

/* ─── Showcase wrapper ─── */
function Showcase({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<div className={`glass-panel p-6 space-y-6 mb-12 ${className}`}>
			{children}
		</div>
	);
}

function ShowcaseRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="space-y-3">
			<p className="text-xs font-black uppercase tracking-[0.15em] text-muted-foreground/40">
				{label}
			</p>
			<div className="flex flex-wrap items-center gap-3">
				{children}
			</div>
		</div>
	);
}

/* ═══════════════════════════════════════════════════════════
   Demo sub-components (with state)
   ═══════════════════════════════════════════════════════════ */

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

/* ─── Notification demo ─── */
function NotificationDemo() {
	const [items, setItems] = useState<NotificationItem[]>([]);
	const counter = useRef(0);

	const add = (variant: "success" | "error" | "info" | "warning") => {
		const id = `notif-${++counter.current}`;
		setItems((prev) => [
			...prev,
			{
				id,
				variant,
				title: variant === "success" ? "배포 완료" : variant === "error" ? "빌드 실패" : variant === "info" ? "새 버전" : "경고",
				description: "상세 설명이 여기에 표시됩니다.",
				action: { label: "자세히 보기", onClick: () => { } },
			},
		]);
		setTimeout(() => setItems((prev) => prev.filter((n) => n.id !== id)), 5000);
	};

	return (
		<>
			<ShowcaseRow label="알림 트리거">
				<Button variant="ghost" size="sm" onClick={() => add("success")}>성공</Button>
				<Button variant="ghost" size="sm" onClick={() => add("error")}>에러</Button>
				<Button variant="ghost" size="sm" onClick={() => add("info")}>정보</Button>
				<Button variant="ghost" size="sm" onClick={() => add("warning")}>경고</Button>
			</ShowcaseRow>
			<NotificationStack items={items} onDismiss={(id) => setItems((p) => p.filter((n) => n.id !== id))} />
		</>
	);
}

/* ═══════════════════════════════════════════════════════════
   Main gallery page
   ═══════════════════════════════════════════════════════════ */

export default function ComponentsGalleryPage() {
	/* ── State ── */
	const [switchVal, setSwitchVal] = useState(true);
	const [sliderVal, setSliderVal] = useState(60);
	const [modalOpen, setModalOpen] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [cmdOpen, setCmdOpen] = useState(false);
	const [selectVal, setSelectVal] = useState("");
	const [multiSelectVal, setMultiSelectVal] = useState<string[]>([]);
	const [dateVal, setDateVal] = useState<Date | null>(null);
	const [navTab, setNavTab] = useState("overview");
	const [tags, setTags] = useState(["음악", "봇"]);
	const [permissions, setPermissions] = useState(0);
	const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
	const [activeSection, setActiveSection] = useState("button");

	/* ── TOC Sidebar Indicator & Scroll Spy ── */
	const sidebarRefs = useRef<(HTMLAnchorElement | null)[]>([]);
	const [sidebarIndicator, setSidebarIndicator] = useState<{ top: number; height: number } | null>(null);

	useEffect(() => {
		const activeIndex = SECTIONS.findIndex((s) => s.id === activeSection);
		const el = activeIndex >= 0 ? sidebarRefs.current[activeIndex] : null;
		if (!el) {
			setSidebarIndicator(null);
			return;
		}

		const update = () => {
			setSidebarIndicator({
				top: el.offsetTop,
				height: el.offsetHeight,
			});
		};

		update();

		const observer = new ResizeObserver(() => {
			update();
		});
		observer.observe(el);

		const parent = el.parentElement;
		if (parent) {
			observer.observe(parent);
		}

		return () => {
			observer.disconnect();
		};
	}, [activeSection]);

	useEffect(() => {
		const handleScroll = () => {
			const sectionElements = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
			let activeId = SECTIONS[0].id;

			for (const el of sectionElements) {
				const rect = el.getBoundingClientRect();
				// If the top of the section is above 160px from the top of the viewport, it is the active one
				if (rect.top <= 160) {
					activeId = el.id;
				}
			}

			setActiveSection(activeId);
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		// Initial check after layout/fonts stabilize
		setTimeout(handleScroll, 100);

		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	/* ── Sample data ── */
	const selectOptions = [
		{ value: "kr", label: "한국어", group: "아시아" },
		{ value: "jp", label: "日本語", group: "아시아" },
		{ value: "en", label: "English", group: "유럽" },
		{ value: "de", label: "Deutsch", group: "유럽" },
		{ value: "fr", label: "Français", group: "유럽" },
	];

	const sampleRoles: DiscordRole[] = [
		{ id: "1", name: "관리자", color: 0xe74c3c, position: 10 },
		{ id: "2", name: "모더레이터", color: 0x3498db, position: 8 },
		{ id: "3", name: "DJ", color: 0x9b59b6, position: 6 },
		{ id: "4", name: "멤버", color: 0x2ecc71, position: 4 },
		{ id: "5", name: "봇", color: 0x95a5a6, position: 2 },
	];

	interface TableRow { id: string; name: string; plays: number; duration: string; artist: string }
	const tableColumns: Column<TableRow>[] = [
		{ key: "id", header: "#", width: "60px", align: "center" },
		{ key: "name", header: "트랙명", sortable: true },
		{ key: "artist", header: "아티스트", sortable: true },
		{ key: "plays", header: "재생 수", sortable: true, align: "right", render: (r) => <span className="text-primary font-black tabular-nums">{r.plays.toLocaleString()}</span> },
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
		{ id: "home", label: "홈으로 이동", icon: <Home size={16} />, group: "페이지", onSelect: () => { } },
		{ id: "shards", label: "샤드 상태", icon: <Server size={16} />, group: "페이지", onSelect: () => { } },
		{ id: "track", label: "재생 순위", icon: <RadioTower size={16} />, group: "페이지", onSelect: () => { } },
		{ id: "settings", label: "설정 열기", icon: <Settings size={16} />, group: "명령어", shortcut: "⌘,", onSelect: () => { } },
		{ id: "search", label: "검색", icon: <Search size={16} />, group: "명령어", shortcut: "⌘F", onSelect: () => { } },
	];

	return (
		<ToastProvider>
			<Container>
				{/* ─── Page header ─── */}
				<PageHeader
					badge="컴포넌트 갤러리"
					badgeIcon={<Palette size={16} />}
					title="Components v2"
					description="SiruBOT 대시보드 디자인 시스템의 모든 컴포넌트를 한 곳에서 확인하세요."
				/>
				{/* ─── Layout: sidebar + content ─── */}
				<div className="flex gap-8">
					{/* Sidebar nav */}
					<nav className="hidden lg:block w-52 shrink-0">
						<div className="sticky top-28 space-y-1 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 relative">
							{sidebarIndicator && (
								<m.div
									className="absolute left-0 right-0 bg-primary/10 rounded-xl -z-10 shadow-sm"
									animate={{
										top: sidebarIndicator.top,
										height: sidebarIndicator.height,
									}}
									transition={{
										type: "spring",
										stiffness: 400,
										damping: 30,
									}}
								/>
							)}
							{SECTIONS.map((s, idx) => {
								const isActive = activeSection === s.id;
								return (
									<a
										key={s.id}
										ref={(el) => { sidebarRefs.current[idx] = el; }}
										href={`#${s.id}`}
										className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-200 relative z-10 ${isActive
											? "text-primary font-bold"
											: "text-muted-foreground hover:text-foreground hover:bg-accent/30"
											}`}
									>
										{s.icon}
										{s.label}
									</a>
								);
							})}
						</div>
					</nav>

					{/* Main content */}
					<main className="flex-1 min-w-0 space-y-4">

						{/* ════════════ BUTTON ════════════ */}
						<SectionHeader id="button" title="Button" description="6가지 variant, 3가지 size, 로딩 상태를 지원하는 범용 버튼" />
						<Showcase>
							<ShowcaseRow label="Variants">
								<Button variant="primary">Primary</Button>
								<Button variant="secondary">Secondary</Button>
								<Button variant="ghost">Ghost</Button>
								<Button variant="danger">Danger</Button>
								<Button variant="icon" icon={<Settings size={18} />} />
								<Button variant="state-toggle" active>Active</Button>
								<Button variant="state-toggle">Inactive</Button>
							</ShowcaseRow>
							<ShowcaseRow label="Sizes">
								<Button size="sm">Small</Button>
								<Button size="md">Medium</Button>
								<Button size="lg">Large</Button>
							</ShowcaseRow>
							<ShowcaseRow label="States">
								<Button loading>로딩 중...</Button>
								<Button disabled>비활성화</Button>
								<Button variant="danger" icon={<Trash2 size={16} />}>삭제하기</Button>
							</ShowcaseRow>
						</Showcase>

						{/* ════════════ BADGE ════════════ */}
						<SectionHeader id="badge" title="Badge" description="상태, 카테고리, 역할 등을 표시하는 태그 pill" />
						<Showcase>
							<ShowcaseRow label="Variants">
								<Badge>기본</Badge>
								<Badge variant="primary">Primary</Badge>
								<Badge variant="success" dot>온라인</Badge>
								<Badge variant="warning" dot>대기 중</Badge>
								<Badge variant="danger" dot>오프라인</Badge>
								<Badge variant="info">정보</Badge>
								<Badge variant="discord">BOT</Badge>
							</ShowcaseRow>
							<ShowcaseRow label="Sizes & 기능">
								<Badge size="sm" variant="primary">Small</Badge>
								<Badge size="md" variant="primary">Medium</Badge>
								<Badge variant="primary" dismissible onDismiss={() => { }}>제거 가능</Badge>
							</ShowcaseRow>
						</Showcase>

						{/* ════════════ AVATAR ════════════ */}
						<SectionHeader id="avatar" title="Avatar" description="유저/서버 이미지, 폴백 이니셜, 상태 인디케이터" />
						<Showcase>
							<ShowcaseRow label="Sizes">
								<Avatar fallback="시" size="xs" />
								<Avatar fallback="시" size="sm" />
								<Avatar fallback="시" size="md" ring />
								<Avatar fallback="시" size="lg" ring />
							</ShowcaseRow>
							<ShowcaseRow label="Status">
								<Avatar fallback="A" size="md" status="online" />
								<Avatar fallback="B" size="md" status="idle" />
								<Avatar fallback="C" size="md" status="dnd" />
								<Avatar fallback="D" size="md" status="offline" />
							</ShowcaseRow>
						</Showcase>

						{/* ════════════ STATUS DOT ════════════ */}
						<SectionHeader id="status-dot" title="StatusDot" description="봇/샤드/API 연결 상태 표시 인디케이터" />
						<Showcase>
							<ShowcaseRow label="States">
								<StatusDot status="ready" label="READY" />
								<StatusDot status="idle" label="IDLE" />
								<StatusDot status="connecting" label="CONNECTING" />
								<StatusDot status="disconnected" label="DISCONNECTED" />
								<StatusDot status="errored" label="ERRORED" />
							</ShowcaseRow>
							<ShowcaseRow label="Sizes">
								<StatusDot size="sm" status="ready" />
								<StatusDot size="md" status="ready" />
								<StatusDot size="lg" status="ready" />
							</ShowcaseRow>
						</Showcase>

						{/* ════════════ SKELETON ════════════ */}
						<SectionHeader id="skeleton" title="Skeleton" description="비동기 데이터 로딩 플레이스홀더" />
						<Showcase>
							<ShowcaseRow label="Shapes">
								<SkeletonLine width="200px" />
								<SkeletonCircle size="h-12 w-12" />
							</ShowcaseRow>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<SkeletonCard lines={3} avatar />
								<SkeletonCard lines={2} avatar={false} />
							</div>
						</Showcase>

						{/* ════════════ SWITCH ════════════ */}
						<SectionHeader id="switch" title="Switch" description="On/Off 토글 스위치, 스프링 애니메이션" />
						<Showcase>
							<ShowcaseRow label="인터랙티브">
								<Switch checked={switchVal} onChange={setSwitchVal} label="알림 받기" />
								<Switch checked={!switchVal} onChange={(v) => setSwitchVal(!v)} label="자동 재생" />
							</ShowcaseRow>
							<ShowcaseRow label="States">
								<Switch checked={true} onChange={() => { }} label="활성화" size="sm" />
								<Switch checked={false} onChange={() => { }} label="비활성화" size="sm" />
								<Switch checked={true} onChange={() => { }} label="비활성" disabled size="sm" />
							</ShowcaseRow>
						</Showcase>

						{/* ════════════ SLIDER ════════════ */}
						<SectionHeader id="slider" title="Slider" description="볼륨, 쿨다운, 듀레이션 등 레인지 슬라이더" />
						<Showcase>
							<div className="max-w-sm space-y-6">
								<Slider
									value={sliderVal}
									onChange={setSliderVal}
									label="볼륨"
									showValue
									formatValue={(v) => `${v}%`}
								/>
								<Slider
									value={30}
									onChange={() => { }}
									min={0}
									max={60}
									step={5}
									label="쿨다운"
									showValue
									formatValue={(v) => `${v}초`}
								/>
								<Slider value={50} onChange={() => { }} disabled label="비활성" />
							</div>
						</Showcase>

						{/* ════════════ TOAST ════════════ */}
						<SectionHeader id="toast" title="Toast" description="하단 알림 토스트 (5초 자동 닫힘)" />
						<Showcase>
							<ToastDemo />
						</Showcase>

						{/* ════════════ NOTIFICATION ════════════ */}
						<SectionHeader id="notification" title="Notification" description="우상단 알림 패널 (아이콘, 타이틀, 액션)" />
						<Showcase>
							<NotificationDemo />
						</Showcase>

						{/* ════════════ MODAL ════════════ */}
						<SectionHeader id="modal" title="Modal" description="센터 다이얼로그 (포커스 트랩, ESC 닫기)" />
						<Showcase>
							<ShowcaseRow label="인터랙티브">
								<Button variant="ghost" onClick={() => setModalOpen(true)}>모달 열기</Button>
							</ShowcaseRow>
							<Modal open={modalOpen} onClose={() => setModalOpen(false)}>
								<ModalHeader onClose={() => setModalOpen(false)}>설정 저장</ModalHeader>
								<ModalBody>
									<p className="text-sm text-muted-foreground font-medium leading-relaxed">
										변경된 서버 설정을 저장하시겠어요? 이 작업은 즉시 적용됩니다.
									</p>
								</ModalBody>
								<ModalFooter>
									<Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>취소</Button>
									<Button variant="primary" size="sm" onClick={() => setModalOpen(false)}>저장하기</Button>
								</ModalFooter>
							</Modal>
						</Showcase>

						{/* ════════════ DRAWER ════════════ */}
						<SectionHeader id="drawer" title="Drawer" description="슬라이드인 사이드 패널" />
						<Showcase>
							<ShowcaseRow label="인터랙티브">
								<Button variant="ghost" onClick={() => setDrawerOpen(true)}>드로어 열기</Button>
							</ShowcaseRow>
							<Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="서버 설정">
								<div className="space-y-4">
									<p className="text-sm text-muted-foreground font-medium">서버 설정 내용이 여기에 표시됩니다.</p>
									<Switch checked={true} onChange={() => { }} label="자동 DJ 모드" />
									<Switch checked={false} onChange={() => { }} label="24시간 재생" />
									<Slider value={80} onChange={() => { }} label="기본 볼륨" showValue formatValue={(v) => `${v}%`} />
								</div>
							</Drawer>
						</Showcase>

						{/* ════════════ DROPDOWN ════════════ */}
						<SectionHeader id="dropdown" title="Dropdown" description="트리거 기반 드롭다운 메뉴" />
						<Showcase>
							<ShowcaseRow label="인터랙티브">
								<Dropdown
									trigger={<Button variant="secondary" size="sm" icon={<ChevronDown size={14} />}>메뉴</Button>}
									groups={[
										{
											label: "일반",
											items: [
												{ key: "settings", label: "서버 설정", icon: <Settings size={14} />, onClick: () => { } },
												{ key: "members", label: "멤버 관리", icon: <Users size={14} />, onClick: () => { } },
											],
										},
										{
											items: [
												{ key: "delete", label: "서버 나가기", icon: <Trash2 size={14} />, danger: true, onClick: () => { } },
											],
										},
									]}
								/>
							</ShowcaseRow>
						</Showcase>

						{/* ════════════ SELECT ════════════ */}
						<SectionHeader id="select" title="Select" description="단일/다중 선택 콤보박스" />
						<Showcase>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div className="space-y-2">
									<p className="text-xs font-black uppercase tracking-[0.15em] text-muted-foreground/40">단일 선택</p>
									<Select
										options={selectOptions}
										value={selectVal}
										onChange={setSelectVal}
										searchable
										placeholder="언어 선택"
									/>
								</div>
								<div className="space-y-2">
									<p className="text-xs font-black uppercase tracking-[0.15em] text-muted-foreground/40">다중 선택</p>
									<Select
										options={selectOptions}
										value={multiSelectVal}
										onChange={setMultiSelectVal}
										multiple
										searchable
										placeholder="언어 선택 (다중)"
									/>
								</div>
							</div>
						</Showcase>

						{/* ════════════ DATEPICKER ════════════ */}
						<SectionHeader id="date-picker" title="DatePicker" description="캘린더 기반 날짜 선택" />
						<Showcase>
							<div className="max-w-xs">
								<DatePicker value={dateVal} onChange={setDateVal} />
							</div>
						</Showcase>

						{/* ════════════ COMMAND PALETTE ════════════ */}
						<SectionHeader id="command-palette" title="CommandPalette" description="⌘K 커맨드 팔레트 (검색, 키보드 네비게이션)" />
						<Showcase>
							<ShowcaseRow label="인터랙티브">
								<Button variant="ghost" size="sm" onClick={() => setCmdOpen(true)} icon={<Command size={14} />}>
									커맨드 팔레트 열기
								</Button>
								<span className="text-xs text-muted-foreground/40 font-medium">또는 Ctrl+K</span>
							</ShowcaseRow>
							<CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} items={commandItems} />
						</Showcase>

						{/* ════════════ NAVIGATION ════════════ */}
						<SectionHeader id="navigation" title="Navigation" description="탭 네비게이션 (3가지 variant)" />
						<Showcase>
							<ShowcaseRow label="Underline">
								<Navigation
									items={[
										{ key: "overview", label: "개요", icon: <Home size={14} /> },
										{ key: "settings", label: "설정", icon: <Settings size={14} />, badge: 3 },
										{ key: "logs", label: "로그" },
									]}
									activeKey={navTab}
									onSelect={setNavTab}
								/>
							</ShowcaseRow>
							<ShowcaseRow label="Pill">
								<Navigation
									items={[
										{ key: "overview", label: "개요" },
										{ key: "settings", label: "설정" },
										{ key: "logs", label: "로그" },
									]}
									activeKey={navTab}
									onSelect={setNavTab}
									variant="pill"
								/>
							</ShowcaseRow>
							<ShowcaseRow label="Segment">
								<Navigation
									items={[
										{ key: "overview", label: "개요" },
										{ key: "settings", label: "설정" },
										{ key: "logs", label: "로그" },
									]}
									activeKey={navTab}
									onSelect={setNavTab}
									variant="segment"
								/>
							</ShowcaseRow>
						</Showcase>

						{/* ════════════ DATA TABLE ════════════ */}
						<SectionHeader id="data-table" title="DataTable" description="정렬 가능한 데이터 테이블 (sticky header)" />
						<Showcase>
							<DataTable
								columns={tableColumns}
								data={tableData}
								keyExtractor={(r) => r.id}
							/>
						</Showcase>

						{/* ════════════ STAT CARD ════════════ */}
						<SectionHeader id="stat-card" title="StatCard" description="메트릭 카드 (아이콘, 값, 트렌드)" />
						<Showcase>
							<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
								<StatCard icon={Server} label="서버" value="1,234" sub="전체 서버 수" trend="up" trendValue="+12%" />
								<StatCard icon={RadioTower} label="재생 중" value="89" sub="현재 재생" trend="down" trendValue="-3%" />
								<StatCard icon={Cpu} label="메모리" value="512MB" sub="사용 중" trend="neutral" trendValue="0%" />
								<StatCard icon={Activity} label="업타임" value="99.9%" sub="30일 평균" />
							</div>
						</Showcase>

						{/* ════════════ TAG INPUT ════════════ */}
						<SectionHeader id="tag-input" title="TagInput" description="멀티 값 칩 입력 (블랙리스트, 키워드)" />
						<Showcase>
							<div className="max-w-md">
								<TagInput
									value={tags}
									onChange={setTags}
									placeholder="태그 입력 후 Enter"
									maxTags={8}
								/>
							</div>
						</Showcase>

						{/* ════════════ EMBED PREVIEW ════════════ */}
						<SectionHeader id="embed-preview" title="EmbedPreview" description="디스코드 임베드 메시지 프리뷰" />
						<Showcase>
							<EmbedPreview
								embed={{
									color: "#ff85c1",
									author: { name: "시루" },
									title: "지금 재생 중",
									titleUrl: "#",
									description: "Blinding Lights — The Weeknd",
									fields: [
										{ name: "요청자", value: "User#1234", inline: true },
										{ name: "길이", value: "3:22", inline: true },
										{ name: "대기열", value: "4곡", inline: true },
									],
									footer: { text: "시루 뮤직", timestamp: "오늘 오후 3:42" },
								}}
							/>
						</Showcase>

						{/* ════════════ CHANNEL MESSAGE ════════════ */}
						<SectionHeader id="channel-message" title="ChannelMessage" description="디스코드 메시지 레이아웃" />
						<Showcase>
							<div className="bg-discord-bg rounded-xl overflow-hidden py-2">
								<ChannelMessage
									author={{ id: "bot", username: "시루", bot: true }}
									content="🎵 지금 재생 중: **Blinding Lights** — The Weeknd"
									timestamp="오후 3:42"
								>
									<div className="mt-2">
										<EmbedPreview
											embed={{
												color: "#ff85c1",
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
						</Showcase>

						{/* ════════════ PERMISSION LIST ════════════ */}
						<SectionHeader id="permission-list" title="PermissionList" description="디스코드 권한 토글 (카테고리별 그룹)" />
						<Showcase>
							<div className="max-w-xl">
								<PermissionList
									categories={DISCORD_PERMISSIONS.slice(0, 2)}
									value={permissions}
									onChange={setPermissions}
								/>
							</div>
						</Showcase>

						{/* ════════════ ROLE SELECT ════════════ */}
						<SectionHeader id="role-select" title="RoleSelect" description="디스코드 역할 선택 (색상 도트, 다중 선택)" />
						<Showcase>
							<div className="max-w-sm">
								<RoleSelect
									roles={sampleRoles}
									value={selectedRoles}
									onChange={setSelectedRoles}
								/>
							</div>
						</Showcase>

						{/* ─── End spacer ─── */}
						<div className="h-24" />
					</main>
				</div>
			</Container>
		</ToastProvider>
	);
}
