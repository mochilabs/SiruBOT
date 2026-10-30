"use client";

import { useState } from "react";
import Link from "next/link";
import type { BotAdminEmojiItem, BotAdminNodeItem, BotAdminReloadStore } from "@sirubot/utils/botAdmin";
import { formatUptime } from "@sirubot/utils/time";
import {
	Activity,
	Bell,
	Brain,
	Database,
	ExternalLink,
	ListMusic,
	Music,
	PlugZap,
	PowerOff,
	RadioTower,
	RefreshCw,
	RotateCcw,
	Search,
	Server,
	Settings2,
	SlidersHorizontal,
	Smile,
	Ticket,
	Trash2,
	UserRound,
} from "lucide-react";
import useSWR from "swr";

import { StatCard } from "@/components/data/stat-card";
import { DataApiSection } from "@/components/data-api-section";
import { EmptyState } from "@/components/primitives/empty-state";
import { Field } from "@/components/primitives/field";
import { StatusDot } from "@/components/primitives/status-dot";
import { ProcessCard } from "@/components/process-card";
import { ServerFeatureSidebar } from "@/components/servers/server-feature-sidebar";
import { InfoBox, PanelHeader, RetryLink, WarningBox } from "@/components/servers/settings-shared";
import { ShardStats } from "@/components/shard-stats";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { VoiceServerSection } from "@/components/voice-server-section";
import type { DataApiStatus } from "@/lib/data-api/types";
import { formatMemory, formatRelativeTime } from "@/lib/format";
import { notifyApiError, notifySaved } from "@/lib/notify";
import type { ShardsResponse } from "@/lib/shard-api";
import { createApiFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

const ADMIN_TABS = [
	{ key: "overview", label: "전체 현황", icon: <Activity size={16} /> },
	{ key: "nodes", label: "노드·봇 제어", icon: <RadioTower size={16} /> },
	{ key: "guilds", label: "길드 데이터", icon: <Server size={16} /> },
	{ key: "users", label: "유저·기억 데이터", icon: <UserRound size={16} /> },
	{ key: "social", label: "소셜 알림 구독", icon: <Bell size={16} /> },
] as const;

type AdminTabKey = (typeof ADMIN_TABS)[number]["key"];

interface OverviewData {
	counts: {
		guilds: number;
		users: number;
		tracks: number;
		playlists: number;
		customCommands: number;
		openTickets: number;
		totalTickets: number;
		activeSocialSubs: number;
		failedSocialSubs: number;
		disabledSocialSubs: number;
		userMemories: number;
	};
	shards: ShardsResponse | null;
	dataApi: DataApiStatus | null;
}

interface AdminGuildSummary {
	id: string;
	volume: number;
	ttsVolume: number;
	ttsDuckLevel: number;
	repeat: string;
	related: boolean;
	enableController: boolean;
	aiMode: string;
	ttsMode: string;
	customCommandPrefix: string;
	jtcEnabled: boolean;
	gaplessEnabled: boolean;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
	normalizationEnabled: boolean;
	countingEnabled: boolean;
	ticketEnabled: boolean;
	counts: {
		customCommands: number;
		assets: number;
		tickets: number;
		history: number;
		socialSubscriptions: number;
	};
	createdAt: string;
	updatedAt: string;
}

interface AdminGuildDetail {
	id: string;
	volume: number;
	ttsVolume: number;
	ttsDuckLevel: number;
	repeat: "off" | "track" | "queue";
	related: boolean;
	enableController: boolean;
	djRoleId: string | null;
	textChannelId: string | null;
	voiceChannelId: string | null;
	pinnedChannelId: string | null;
	pinnedChannelMode: "play" | "select";
	pinnedChannelDeleteInput: boolean;
	jtcEnabled: boolean;
	jtcCategoryId: string | null;
	jtcMarkerChannelId: string | null;
	jtcTemplate: string;
	jtcUserLimit: number;
	gaplessEnabled: boolean;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
	normalizationEnabled: boolean;
	ttsAnnounceMode: "sequential" | "parallel" | "interrupt";
	aiMode: "all" | "channels" | "off";
	ttsMode: "all" | "channels" | "off";
	customCommandPrefix: string;
	emojiEnlargeMode: "all" | "channels" | "off";
	quoteMode: "all" | "channels" | "off";
	embedFixMode: "all" | "channels" | "off";
	embedFixSuppressOriginal: boolean;
	embedFixTranslateLang: "off" | "ko" | "ja" | "en";
	countingEnabled: boolean;
	countingChannelId: string | null;
	counts: {
		customCommands: number;
		assets: number;
		tickets: number;
		history: number;
		chatHistoryChannels: number;
		socialSubscriptions: number;
	};
	createdAt: string;
	updatedAt: string;
}

interface AdminUserSummary {
	id: string;
	birthMonth: number | null;
	birthDay: number | null;
	intro: string | null;
	hasLongTermMemory: boolean;
	shortTermTurns: number;
	counts: {
		playlists: number;
		gameRecords: number;
		history: number;
	};
	createdAt: string;
	updatedAt: string;
}

interface AdminUserDetail {
	id: string;
	birthMonth: number | null;
	birthDay: number | null;
	intro: string | null;
	longTermMemory: string;
	shortTermTurns: Array<{ q: string; a: string; at: number; channelId: string }>;
	tidiedAt: string | null;
	counts: {
		playlists: number;
		gameRecords: number;
		history: number;
		ttsSettings: number;
	};
	createdAt: string | null;
	updatedAt: string | null;
}

interface AdminSocialSubscription {
	id: string;
	guildId: string;
	platform: string;
	sourcePlatformId: string;
	sourceName: string;
	targetChannelId: string;
	messageTemplate: string | null;
	webhookName: string | null;
	webhookAvatarUrl: string | null;
	showThumbnail: boolean;
	status: "active" | "failed" | "disabled";
	createdAt: string;
	updatedAt: string;
}

const overviewFetcher = createApiFetcher<OverviewData>("현황 데이터를 불러오지 못했어요.");
const botNodesFetcher = createApiFetcher<{ nodes: BotAdminNodeItem[] }>("노드 상태를 불러오지 못했어요.");
const guildsFetcher = createApiFetcher<{ guilds: AdminGuildSummary[] }>("서버 목록을 불러오지 못했어요.");
const guildDetailFetcher = createApiFetcher<{ guild: AdminGuildDetail }>("서버 상세 정보를 불러오지 못했어요.");
const usersFetcher = createApiFetcher<{ users: AdminUserSummary[] }>("유저 목록을 불러오지 못했어요.");
const userDetailFetcher = createApiFetcher<{ user: AdminUserDetail }>("유저 상세 정보를 불러오지 못했어요.");
const socialFetcher = createApiFetcher<{ subscriptions: AdminSocialSubscription[] }>("소셜 구독 목록을 불러오지 못했어요.");

function OverviewPanel() {
	const { data, error, isLoading, mutate } = useSWR<OverviewData>("/api/admin/overview", overviewFetcher, {
		refreshInterval: 15_000,
	});

	if (isLoading && !data) {
		return (
			<div className="space-y-6">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<SkeletonCard className="h-28" />
					<SkeletonCard className="h-28" />
					<SkeletonCard className="h-28" />
					<SkeletonCard className="h-28" />
				</div>
				<SkeletonCard className="h-64" />
			</div>
		);
	}

	if (error && !data) {
		return (
			<WarningBox>
				운영자 현황을 불러오지 못했어요. ({error.message}) <RetryLink onRetry={() => void mutate()} />
			</WarningBox>
		);
	}

	if (!data) return null;

	const { counts, shards } = data;

	return (
		<div className="space-y-8">
			<Card padding="md" className="space-y-6">
				<PanelHeader
					icon={<Database size={20} />}
					title="데이터베이스 집계 현황"
					description="등록된 길드·유저·트랙·명령어·티켓·소셜 알림 구독 현황이에요."
					action={
						<Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => void mutate()}>
							새로고침
						</Button>
					}
				/>

				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<StatCard
						icon={Server}
						label="DB 등록 서버"
						value={counts.guilds}
						sub={shards ? `실시간 샤드 길드 ${shards.stats.totalGuilds.toLocaleString("ko-KR")}개` : undefined}
					/>
					<StatCard
						icon={UserRound}
						label="등록 유저"
						value={counts.users}
						sub={`AI 기억 보유 ${counts.userMemories.toLocaleString("ko-KR")}명`}
					/>
					<StatCard
						icon={Music}
						label="누적 트랙"
						value={counts.tracks}
						sub={`플레이리스트 ${counts.playlists.toLocaleString("ko-KR")}개`}
					/>
					<StatCard
						icon={SlidersHorizontal}
						label="커스텀 명령어"
						value={counts.customCommands}
						sub="길드 접두사·슬래시 명령어 합계"
					/>
					<StatCard
						icon={Ticket}
						label="열린 티켓"
						value={counts.openTickets}
						sub={`전체 누적 ${counts.totalTickets.toLocaleString("ko-KR")}건`}
					/>
					<StatCard
						icon={Bell}
						label="소셜 알림 구독 (정상)"
						value={counts.activeSocialSubs}
						sub={`실패 ${counts.failedSocialSubs}건 · 일시정지 ${counts.disabledSocialSubs}건`}
					/>
					<StatCard
						icon={ListMusic}
						label="활성 플레이어"
						value={shards?.stats.totalPlayers ?? 0}
						sub={shards ? `샤드 ${shards.stats.allocatedShards}/${shards.stats.shardCount} 가동` : "샤드 매니저 미연결"}
					/>
					<StatCard
						icon={Brain}
						label="봇 총 메모리"
						value={`${shards?.stats.totalMemoryMB ?? 0} MB`}
						sub={shards ? `프로세스 ${shards.stats.processCount}개 연결됨` : undefined}
					/>
				</div>
			</Card>

			{shards && (
				<section className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="text-base font-bold text-foreground">샤드 클러스터 요약</h3>
						<Link href="/shards" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}>
							<span>시스템 상태 전체 보기</span>
							<ExternalLink size={14} />
						</Link>
					</div>
					<ShardStats stats={shards.stats} />
					{shards.processes.length > 0 && (
						<div className="grid gap-4 md:grid-cols-2">
							{shards.processes.map((proc, index) => (
								<ProcessCard key={proc.wsId} process={proc} index={index} />
							))}
						</div>
					)}
				</section>
			)}

			<DataApiSection />
			<VoiceServerSection />
		</div>
	);
}

function NodesAndControlPanel() {
	const { data, error, isLoading, mutate } = useSWR<{ nodes: BotAdminNodeItem[] }>(
		"/api/admin/bot-control",
		botNodesFetcher,
		{ refreshInterval: 10_000 },
	);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [emojis, setEmojis] = useState<BotAdminEmojiItem[] | null>(null);
	const [reloadStores, setReloadStores] = useState<BotAdminReloadStore[] | null>(null);

	async function runBotAction(
		actionKey: string,
		payload: {
			kind: "node-reconnect" | "node-disconnect" | "emojis-list" | "emojis-sync" | "reload-stores";
			nodeId?: string;
		},
		fallbackError: string,
	) {
		setBusyKey(actionKey);
		try {
			const res = await fetch("/api/admin/bot-control", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body?.error ?? fallbackError);
				return;
			}
			if (body.nodes) {
				await mutate({ nodes: body.nodes }, { revalidate: false });
			} else {
				void mutate();
			}
			if (body.emojis) {
				setEmojis(body.emojis);
			}
			if (body.stores) {
				setReloadStores(body.stores);
			}
			if (body.message) {
				toast.success(body.message);
			}
		} catch (err) {
			notifyApiError(err, fallbackError);
		} finally {
			setBusyKey(null);
		}
	}

	const nodes = data?.nodes ?? [];

	return (
		<div className="space-y-6">
			<Card padding="md" className="space-y-5">
				<PanelHeader
					icon={<RadioTower size={20} />}
					title="봇 Lavalink 노드 연결 제어"
					description="봇 프로세스에 직접 연결된 Lavalink 노드의 세션·핑·부하를 확인하고 즉시 재연결하거나 연결을 해제해요."
					action={
						<Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => void mutate()}>
							상태 새로고침
						</Button>
					}
				/>

				{isLoading && !data ? (
					<div className="grid gap-4 md:grid-cols-2">
						<SkeletonCard className="h-44" />
						<SkeletonCard className="h-44" />
					</div>
				) : error && !data ? (
					<WarningBox>
						봇 노드 상태를 조회하지 못했어요. ({error.message}) <RetryLink onRetry={() => void mutate()} />
					</WarningBox>
				) : nodes.length === 0 ? (
					<EmptyState
						icon={RadioTower}
						size="sm"
						title="등록된 Lavalink 노드가 없어요."
						description="봇이 아직 오디오 노드를 초기화하지 않았거나 응답하지 않았어요."
					/>
				) : (
					<div className="grid gap-4 md:grid-cols-2">
						{nodes.map((node) => {
							const reconnectKey = `reconnect:${node.id}`;
							const disconnectKey = `disconnect:${node.id}`;
							const cpuPercent = (node.cpuLavalinkLoad * 100).toFixed(1);
							const sysPercent = (node.cpuSystemLoad * 100).toFixed(1);

							return (
								<Card key={node.id} variant="raised" padding="md" className="space-y-4">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 space-y-1">
											<div className="flex items-center gap-2">
												<StatusDot status={node.connected ? "ready" : "disconnected"} />
												<span className="font-bold text-foreground">{node.id}</span>
												<Badge variant={node.connected ? "success" : "danger"} size="sm">
													{node.connected ? "연결됨" : "연결 끊김"}
												</Badge>
											</div>
											<p className="font-mono text-xs text-muted-foreground">
												{node.host}:{node.port}
											</p>
										</div>

										<div className="flex shrink-0 items-center gap-2">
											<Button
												variant="secondary"
												size="sm"
												loading={busyKey === reconnectKey}
												disabled={busyKey !== null}
												icon={<PlugZap size={14} />}
												onClick={() =>
													void runBotAction(
														reconnectKey,
														{ kind: "node-reconnect", nodeId: node.id },
														"노드 재연결 요청에 실패했어요.",
													)
												}
											>
												재연결
											</Button>
											{node.connected && (
												<Button
													variant="danger"
													size="sm"
													loading={busyKey === disconnectKey}
													disabled={busyKey !== null}
													icon={<PowerOff size={14} />}
													onClick={() =>
														void runBotAction(
															disconnectKey,
															{ kind: "node-disconnect", nodeId: node.id },
															"노드 연결 해제에 실패했어요.",
														)
													}
												>
													해제
												</Button>
											)}
										</div>
									</div>

									<div className="grid grid-cols-2 gap-3 rounded-control bg-surface-2 p-3 text-xs sm:grid-cols-4">
										<div>
											<p className="text-muted-foreground">플레이어</p>
											<p className="mt-0.5 font-bold tabular-nums text-foreground">
												{node.playingPlayers} / {node.players}
											</p>
										</div>
										<div>
											<p className="text-muted-foreground">CPU (Lavalink/Sys)</p>
											<p className="mt-0.5 font-bold tabular-nums text-foreground">
												{cpuPercent}% / {sysPercent}%
											</p>
										</div>
										<div>
											<p className="text-muted-foreground">메모리</p>
											<p className="mt-0.5 font-bold tabular-nums text-foreground">
												{formatMemory(node.memoryUsedBytes)}
											</p>
										</div>
										<div>
											<p className="text-muted-foreground">핑 / 가동시간</p>
											<p className="mt-0.5 font-bold tabular-nums text-foreground">
												{node.pingMs != null ? `${node.pingMs}ms` : "-"} · {formatUptime(node.uptimeMs)}
											</p>
										</div>
									</div>

									{node.sessionId && (
										<p className="truncate font-mono text-2xs text-muted-foreground">
											Session: {node.sessionId}
										</p>
									)}
								</Card>
							);
						})}
					</div>
				)}
			</Card>

			<div className="grid gap-6 lg:grid-cols-2">
				<Card padding="md" className="space-y-4">
					<PanelHeader
						icon={<Smile size={20} />}
						title="앱 이모지(Application Emoji) 관리"
						description="디스코드 애플리케이션에 등록된 커스텀 이모지를 조회하거나 로컬 리소스와 동기화해요."
						action={
							<div className="flex items-center gap-2">
								<Button
									variant="secondary"
									size="sm"
									loading={busyKey === "emojis-list"}
									disabled={busyKey !== null}
									onClick={() =>
										void runBotAction("emojis-list", { kind: "emojis-list" }, "앱 이모지 조회에 실패했어요.")
									}
								>
									목록 조회
								</Button>
								<Button
									variant="primary"
									size="sm"
									loading={busyKey === "emojis-sync"}
									disabled={busyKey !== null}
									icon={<RefreshCw size={14} />}
									onClick={() =>
										void runBotAction("emojis-sync", { kind: "emojis-sync" }, "앱 이모지 동기화에 실패했어요.")
									}
								>
									동기화 실행
								</Button>
							</div>
						}
					/>

					{emojis ? (
						<div className="space-y-2">
							<p className="text-xs font-medium text-muted-foreground">
								등록된 이모지 총 <span className="font-bold text-primary-text tabular-nums">{emojis.length}</span>개
							</p>
							<div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto rounded-control bg-surface-2 p-3">
								{emojis.map((item) => (
									<Badge key={item.id} variant="secondary" size="sm" className="font-mono">
										:{item.name}: ({item.id})
									</Badge>
								))}
							</div>
						</div>
					) : (
						<InfoBox>
							목록 조회를 누르면 현재 봇에 로드된 앱 이모지 이름과 ID 매핑을 확인할 수 있어요.
						</InfoBox>
					)}
				</Card>

				<Card padding="md" className="space-y-4">
					<PanelHeader
						icon={<RotateCcw size={20} />}
						title="Sapphire 스토어 리로드"
						description="모든 봇 프로세스의 명령어·리스너·프리컨디션·인터랙션 핸들러 스토어를 재시작 없이 리로드해요."
						action={
							<Button
								variant="secondary"
								size="sm"
								loading={busyKey === "reload-stores"}
								disabled={busyKey !== null}
								icon={<RotateCcw size={14} />}
								onClick={() =>
									void runBotAction("reload-stores", { kind: "reload-stores" }, "스토어 리로드에 실패했어요.")
								}
							>
								전체 스토어 리로드
							</Button>
						}
					/>

					{reloadStores ? (
						<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
							{reloadStores.map((st) => (
								<div key={st.storeName} className="rounded-control bg-surface-2 px-3 py-2 text-xs">
									<p className="font-bold text-foreground">{st.storeName}</p>
									<p className="mt-0.5 text-muted-foreground tabular-nums">
										성공 {st.succeeded}/{st.total}
										{st.failed > 0 ? ` · 실패 ${st.failed}` : ""}
									</p>
								</div>
							))}
						</div>
					) : (
						<InfoBox>
							봇의 `/리로드` 개발 명령어와 동일한 동작을 웹에서 실행하고 스토어별 결과를 확인해요.
						</InfoBox>
					)}
				</Card>
			</div>
		</div>
	);
}

function GuildsDataPanel() {
	const [query, setQuery] = useState("");
	const [directId, setDirectId] = useState("");
	const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);

	const swrKey = `/api/admin/guilds${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`;
	const { data, error, isLoading, mutate } = useSWR<{ guilds: AdminGuildSummary[] }>(swrKey, guildsFetcher);

	const guilds = data?.guilds ?? [];

	return (
		<div className="space-y-6">
			<Card padding="md" className="space-y-5">
				<PanelHeader
					icon={<Server size={20} />}
					title="길드(서버) 데이터 조회·수정"
					description="DB에 저장된 모든 서버의 오디오·AI·믹서·채널·접두사 설정을 직접 편집하거나 초기화해요."
				/>

				<div className="flex flex-col gap-3 sm:flex-row">
					<InputGroup className="flex-1">
						<InputGroupAddon>
							<Search size={16} />
						</InputGroupAddon>
						<InputGroupInput
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="서버 ID로 검색..."
							aria-label="서버 ID 검색"
						/>
					</InputGroup>

					<form
						className="flex gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							const trimmed = directId.trim();
							if (/^\d{17,20}$/.test(trimmed)) {
								setSelectedGuildId(trimmed);
							} else {
								toast.error("올바른 17~20자리 Discord 서버 ID를 입력해 주세요.");
							}
						}}
					>
						<Input
							value={directId}
							onChange={(e) => setDirectId(e.target.value)}
							placeholder="서버 ID 직접 열기 (17~20자리)"
							className="w-56 font-mono text-xs"
							aria-label="서버 ID 직접 열기"
						/>
						<Button type="submit" variant="secondary" size="md">
							열기
						</Button>
					</form>
				</div>

				{isLoading && !data ? (
					<div className="space-y-2">
						<SkeletonCard className="h-20" />
						<SkeletonCard className="h-20" />
						<SkeletonCard className="h-20" />
					</div>
				) : error && !data ? (
					<WarningBox>
						서버 목록을 불러오지 못했어요. ({error.message}) <RetryLink onRetry={() => void mutate()} />
					</WarningBox>
				) : guilds.length === 0 ? (
					<EmptyState
						icon={Server}
						size="sm"
						title="일치하는 서버 데이터가 없어요."
						description="검색어를 지우거나 위 입력창에 서버 ID를 직접 입력해 열 수 있어요."
					/>
				) : (
					<div className="divide-y divide-border-subtle rounded-card bg-surface-2">
						{guilds.map((g) => (
							<div
								key={g.id}
								className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
							>
								<div className="min-w-0 space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-mono text-sm font-bold text-foreground">{g.id}</span>
										<Badge variant="secondary" size="sm">
											접두사 {g.customCommandPrefix}
										</Badge>
										<Badge variant={g.aiMode === "off" ? "default" : "primary"} size="sm">
											AI: {g.aiMode}
										</Badge>
										{g.jtcEnabled && (
											<Badge variant="info" size="sm">
												JTC 켜짐
											</Badge>
										)}
										{g.ticketEnabled && (
											<Badge variant="success" size="sm">
												티켓 켜짐
											</Badge>
										)}
									</div>
									<p className="text-xs text-muted-foreground">
										볼륨 {g.volume}% · TTS {g.ttsVolume}% · 커스텀 명령어 {g.counts.customCommands}개 · 에셋{" "}
										{g.counts.assets}개 · 소셜 알림 {g.counts.socialSubscriptions}개 · 재생 이력{" "}
										{g.counts.history.toLocaleString("ko-KR")}건 · 수정 {formatRelativeTime(Date.parse(g.updatedAt))}
									</p>
								</div>

								<div className="flex shrink-0 items-center gap-2">
									<Link
										href={`/servers/${g.id}`}
										className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
									>
										<span>대시보드</span>
										<ExternalLink size={14} />
									</Link>
									<Button
										variant="secondary"
										size="sm"
										icon={<Settings2 size={14} />}
										onClick={() => setSelectedGuildId(g.id)}
									>
										데이터 수정
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</Card>

			{selectedGuildId && (
				<GuildEditDialog
					guildId={selectedGuildId}
					open={Boolean(selectedGuildId)}
					onOpenChange={(open) => {
						if (!open) setSelectedGuildId(null);
					}}
					onSaved={() => void mutate()}
				/>
			)}
		</div>
	);
}

function GuildEditDialog({
	guildId,
	open,
	onOpenChange,
	onSaved,
}: {
	guildId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const { data, error, isLoading, mutate } = useSWR<{ guild: AdminGuildDetail }>(
		open ? `/api/admin/guilds/${guildId}` : null,
		guildDetailFetcher,
	);

	const guild = data?.guild;
	const [draft, setDraft] = useState<Partial<AdminGuildDetail>>({});
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [clearingChat, setClearingChat] = useState(false);

	const current = guild ? { ...guild, ...draft } : null;

	async function handleSave() {
		if (!current) return;
		setSaving(true);
		try {
			const payload = {
				volume: current.volume,
				ttsVolume: current.ttsVolume,
				repeat: current.repeat,
				related: current.related,
				enableController: current.enableController,
				aiMode: current.aiMode,
				ttsMode: current.ttsMode,
				customCommandPrefix: current.customCommandPrefix,
				jtcEnabled: current.jtcEnabled,
				jtcTemplate: current.jtcTemplate,
				jtcUserLimit: current.jtcUserLimit,
				gaplessEnabled: current.gaplessEnabled,
				crossfadeEnabled: current.crossfadeEnabled,
				crossfadeMs: current.crossfadeMs,
				normalizationEnabled: current.normalizationEnabled,
				ttsAnnounceMode: current.ttsAnnounceMode,
				emojiEnlargeMode: current.emojiEnlargeMode,
				quoteMode: current.quoteMode,
				embedFixMode: current.embedFixMode,
				embedFixSuppressOriginal: current.embedFixSuppressOriginal,
				embedFixTranslateLang: current.embedFixTranslateLang,
				countingEnabled: current.countingEnabled,
				djRoleId: current.djRoleId?.trim() || null,
				textChannelId: current.textChannelId?.trim() || null,
				voiceChannelId: current.voiceChannelId?.trim() || null,
				pinnedChannelId: current.pinnedChannelId?.trim() || null,
				countingChannelId: current.countingChannelId?.trim() || null,
			};

			const res = await fetch(`/api/admin/guilds/${guildId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body?.error ?? "서버 데이터 저장에 실패했어요.");
				return;
			}
			setDraft({});
			await mutate(body, { revalidate: false });
			onSaved();
			notifySaved("서버 데이터를 저장했어요.");
		} catch (err) {
			notifyApiError(err, "서버 데이터 저장에 실패했어요.");
		} finally {
			setSaving(false);
		}
	}

	async function handleClearChatHistory() {
		setClearingChat(true);
		try {
			const res = await fetch(`/api/admin/guilds/${guildId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ clearChatHistory: true }),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body?.error ?? "대화 기록 삭제에 실패했어요.");
				return;
			}
			await mutate(body, { revalidate: false });
			onSaved();
			toast.success("이 서버의 AI 채널 대화 기록을 모두 비웠어요.");
		} catch (err) {
			notifyApiError(err, "대화 기록 삭제에 실패했어요.");
		} finally {
			setClearingChat(false);
		}
	}

	async function handleDeleteGuild() {
		setDeleting(true);
		try {
			const res = await fetch(`/api/admin/guilds/${guildId}`, {
				method: "DELETE",
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body?.error ?? "서버 데이터 삭제에 실패했어요.");
				return;
			}
			onSaved();
			onOpenChange(false);
			toast.success(`서버(${guildId}) 데이터를 초기화했어요.`);
		} catch (err) {
			notifyApiError(err, "서버 데이터 삭제에 실패했어요.");
		} finally {
			setDeleting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[88svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="font-mono">서버 데이터 편집 · {guildId}</DialogTitle>
					<DialogDescription>
						변경 사항은 저장 즉시 DB에 반영되고 Redis를 통해 봇 캐시가 무효화돼요.
					</DialogDescription>
				</DialogHeader>

				{isLoading && !current ? (
					<div className="space-y-3 py-4">
						<SkeletonCard className="h-24" />
						<SkeletonCard className="h-36" />
					</div>
				) : error && !current ? (
					<WarningBox>
						서버 상세 정보를 불러오지 못했어요. ({error.message})
					</WarningBox>
				) : current ? (
					<div className="space-y-5 py-2">
						<div className="grid grid-cols-2 gap-2 rounded-control bg-surface-2 p-3 text-xs sm:grid-cols-3">
							<div>
								<span className="text-muted-foreground">커스텀 명령어:</span>{" "}
								<span className="font-bold tabular-nums">{current.counts.customCommands}개</span>
							</div>
							<div>
								<span className="text-muted-foreground">업로드 에셋:</span>{" "}
								<span className="font-bold tabular-nums">{current.counts.assets}개</span>
							</div>
							<div>
								<span className="text-muted-foreground">티켓:</span>{" "}
								<span className="font-bold tabular-nums">{current.counts.tickets}건</span>
							</div>
							<div>
								<span className="text-muted-foreground">소셜 알림:</span>{" "}
								<span className="font-bold tabular-nums">{current.counts.socialSubscriptions}개</span>
							</div>
							<div>
								<span className="text-muted-foreground">AI 대화 채널:</span>{" "}
								<span className="font-bold tabular-nums">{current.counts.chatHistoryChannels}개</span>
							</div>
							<div>
								<span className="text-muted-foreground">재생 기록:</span>{" "}
								<span className="font-bold tabular-nums">{current.counts.history.toLocaleString("ko-KR")}건</span>
							</div>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<Slider
								label="기본 음악 볼륨"
								min={0}
								max={150}
								step={1}
								value={current.volume}
								showValue
								formatValue={(v) => `${v}%`}
								onChange={(v) => setDraft((prev) => ({ ...prev, volume: v }))}
							/>
							<Slider
								label="TTS 볼륨"
								min={0}
								max={200}
								step={5}
								value={current.ttsVolume}
								showValue
								formatValue={(v) => `${v}%`}
								onChange={(v) => setDraft((prev) => ({ ...prev, ttsVolume: v }))}
							/>
						</div>

						<div className="grid gap-4 sm:grid-cols-3">
							<Field label="반복 모드">
								<Select
									value={current.repeat}
									onValueChange={(val) =>
										val && setDraft((prev) => ({ ...prev, repeat: val as AdminGuildDetail["repeat"] }))
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="off">끄기 (off)</SelectItem>
										<SelectItem value="track">한 곡 반복 (track)</SelectItem>
										<SelectItem value="queue">대기열 반복 (queue)</SelectItem>
									</SelectContent>
								</Select>
							</Field>

							<Field label="AI 채팅 모드">
								<Select
									value={current.aiMode}
									onValueChange={(val) =>
										val && setDraft((prev) => ({ ...prev, aiMode: val as AdminGuildDetail["aiMode"] }))
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">모든 채널 (all)</SelectItem>
										<SelectItem value="channels">지정 채널만 (channels)</SelectItem>
										<SelectItem value="off">끄기 (off)</SelectItem>
									</SelectContent>
								</Select>
							</Field>

							<Field label="채팅 TTS 모드">
								<Select
									value={current.ttsMode}
									onValueChange={(val) =>
										val && setDraft((prev) => ({ ...prev, ttsMode: val as AdminGuildDetail["ttsMode"] }))
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="off">끄기 (off)</SelectItem>
										<SelectItem value="channels">지정 채널만 (channels)</SelectItem>
										<SelectItem value="all">모든 채널 (all)</SelectItem>
									</SelectContent>
								</Select>
							</Field>
						</div>

						<div className="grid gap-4 sm:grid-cols-3">
							<Field label="커스텀 명령어 접두사">
								<Input
									value={current.customCommandPrefix}
									onChange={(e) => setDraft((prev) => ({ ...prev, customCommandPrefix: e.target.value }))}
									maxLength={5}
									className="font-mono"
								/>
							</Field>

							<Field label="임베드 복구 모드">
								<Select
									value={current.embedFixMode}
									onValueChange={(val) =>
										val &&
										setDraft((prev) => ({ ...prev, embedFixMode: val as AdminGuildDetail["embedFixMode"] }))
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="off">끄기 (off)</SelectItem>
										<SelectItem value="channels">지정 채널만 (channels)</SelectItem>
										<SelectItem value="all">모든 채널 (all)</SelectItem>
									</SelectContent>
								</Select>
							</Field>

							<Field label="TTS 안내 방식">
								<Select
									value={current.ttsAnnounceMode}
									onValueChange={(val) =>
										val &&
										setDraft((prev) => ({
											...prev,
											ttsAnnounceMode: val as AdminGuildDetail["ttsAnnounceMode"],
										}))
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="sequential">순차 재생 (sequential)</SelectItem>
										<SelectItem value="parallel">동시 재생 (parallel)</SelectItem>
										<SelectItem value="interrupt">최신 우선 (interrupt)</SelectItem>
									</SelectContent>
								</Select>
							</Field>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<Field label="DJ 역할 ID (비우면 해제)">
								<Input
									value={current.djRoleId ?? ""}
									onChange={(e) => setDraft((prev) => ({ ...prev, djRoleId: e.target.value || null }))}
									placeholder="Discord 역할 Snowflake ID"
									className="font-mono text-xs"
								/>
							</Field>
							<Field label="고정 음악 채널 ID (비우면 해제)">
								<Input
									value={current.pinnedChannelId ?? ""}
									onChange={(e) => setDraft((prev) => ({ ...prev, pinnedChannelId: e.target.value || null }))}
									placeholder="Discord 텍스트 채널 Snowflake ID"
									className="font-mono text-xs"
								/>
							</Field>
							<Field label="명령어 허용 텍스트 채널 ID">
								<Input
									value={current.textChannelId ?? ""}
									onChange={(e) => setDraft((prev) => ({ ...prev, textChannelId: e.target.value || null }))}
									placeholder="비우면 모든 텍스트 채널 허용"
									className="font-mono text-xs"
								/>
							</Field>
							<Field label="고정 음성 채널 ID">
								<Input
									value={current.voiceChannelId ?? ""}
									onChange={(e) => setDraft((prev) => ({ ...prev, voiceChannelId: e.target.value || null }))}
									placeholder="비우면 모든 음성 채널 허용"
									className="font-mono text-xs"
								/>
							</Field>
						</div>

						<div className="grid grid-cols-2 gap-3 rounded-control bg-surface-2 p-3 sm:grid-cols-3">
							<Switch
								label="추천곡 자동재생"
								size="sm"
								checked={current.related}
								onChange={(checked) => setDraft((prev) => ({ ...prev, related: checked }))}
							/>
							<Switch
								label="뮤직 컨트롤러 표시"
								size="sm"
								checked={current.enableController}
								onChange={(checked) => setDraft((prev) => ({ ...prev, enableController: checked }))}
							/>
							<Switch
								label="갭리스(Gapless)"
								size="sm"
								checked={current.gaplessEnabled}
								onChange={(checked) => setDraft((prev) => ({ ...prev, gaplessEnabled: checked }))}
							/>
							<Switch
								label="크로스페이드"
								size="sm"
								checked={current.crossfadeEnabled}
								onChange={(checked) => setDraft((prev) => ({ ...prev, crossfadeEnabled: checked }))}
							/>
							<Switch
								label="볼륨 정규화"
								size="sm"
								checked={current.normalizationEnabled}
								onChange={(checked) => setDraft((prev) => ({ ...prev, normalizationEnabled: checked }))}
							/>
							<Switch
								label="임시 음성방(JTC)"
								size="sm"
								checked={current.jtcEnabled}
								onChange={(checked) => setDraft((prev) => ({ ...prev, jtcEnabled: checked }))}
							/>
						</div>

						<div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2 p-3">
							<div className="space-y-0.5 text-xs">
								<p className="font-bold text-foreground">위험 작업 · 데이터 초기화</p>
								<p className="text-muted-foreground">
									AI 대화 기록을 비우거나 이 서버의 DB 행 전체를 삭제할 수 있어요.
								</p>
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="secondary"
									size="sm"
									loading={clearingChat}
									onClick={() => void handleClearChatHistory()}
								>
									AI 대화 기록 비우기 ({current.counts.chatHistoryChannels})
								</Button>
								<Button
									variant="danger"
									size="sm"
									loading={deleting}
									icon={<Trash2 size={14} />}
									onClick={() => void handleDeleteGuild()}
								>
									서버 데이터 삭제
								</Button>
							</div>
						</div>
					</div>
				) : null}

				<DialogFooter>
					<DialogClose render={<Button variant="ghost" />}>닫기</DialogClose>
					<Button
						variant="primary"
						loading={saving}
						disabled={!current}
						onClick={() => void handleSave()}
					>
						저장하기
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function UsersDataPanel() {
	const [query, setQuery] = useState("");
	const [directId, setDirectId] = useState("");
	const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

	const swrKey = `/api/admin/users${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`;
	const { data, error, isLoading, mutate } = useSWR<{ users: AdminUserSummary[] }>(swrKey, usersFetcher);

	const users = data?.users ?? [];

	return (
		<div className="space-y-6">
			<Card padding="md" className="space-y-5">
				<PanelHeader
					icon={<UserRound size={20} />}
					title="유저 프로필 · AI 기억 데이터 수정"
					description="유저별 한줄 소개·생일과 시루 AI 장기 기억(MEMORY.md)·단기 대화 기억을 조회하고 직접 편집해요."
				/>

				<div className="flex flex-col gap-3 sm:flex-row">
					<InputGroup className="flex-1">
						<InputGroupAddon>
							<Search size={16} />
						</InputGroupAddon>
						<InputGroupInput
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="유저 ID 또는 한줄 소개로 검색..."
							aria-label="유저 검색"
						/>
					</InputGroup>

					<form
						className="flex gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							const trimmed = directId.trim();
							if (/^\d{17,20}$/.test(trimmed)) {
								setSelectedUserId(trimmed);
							} else {
								toast.error("올바른 17~20자리 Discord 유저 ID를 입력해 주세요.");
							}
						}}
					>
						<Input
							value={directId}
							onChange={(e) => setDirectId(e.target.value)}
							placeholder="유저 ID 직접 열기 (17~20자리)"
							className="w-56 font-mono text-xs"
							aria-label="유저 ID 직접 열기"
						/>
						<Button type="submit" variant="secondary" size="md">
							열기
						</Button>
					</form>
				</div>

				{isLoading && !data ? (
					<div className="space-y-2">
						<SkeletonCard className="h-20" />
						<SkeletonCard className="h-20" />
					</div>
				) : error && !data ? (
					<WarningBox>
						유저 목록을 불러오지 못했어요. ({error.message}) <RetryLink onRetry={() => void mutate()} />
					</WarningBox>
				) : users.length === 0 ? (
					<EmptyState
						icon={UserRound}
						size="sm"
						title="일치하는 유저 데이터가 없어요."
						description="검색어를 바꾸거나 유저 ID를 직접 입력해 편집 창을 열 수 있어요."
					/>
				) : (
					<div className="divide-y divide-border-subtle rounded-card bg-surface-2">
						{users.map((u) => (
							<div
								key={u.id}
								className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
							>
								<div className="min-w-0 space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-mono text-sm font-bold text-foreground">{u.id}</span>
										{u.birthMonth && u.birthDay && (
											<Badge variant="secondary" size="sm">
												생일 {u.birthMonth}월 {u.birthDay}일
											</Badge>
										)}
										{u.hasLongTermMemory && (
											<Badge variant="primary" size="sm">
												장기 기억 보유
											</Badge>
										)}
										{u.shortTermTurns > 0 && (
											<Badge variant="info" size="sm">
												단기 기억 {u.shortTermTurns}턴
											</Badge>
										)}
									</div>
									{u.intro && <p className="truncate text-xs text-foreground/80">“{u.intro}”</p>}
									<p className="text-xs text-muted-foreground">
										플레이리스트 {u.counts.playlists}개 · 미니게임 기록 {u.counts.gameRecords}건 · 재생 요청{" "}
										{u.counts.history.toLocaleString("ko-KR")}회
									</p>
								</div>

								<div className="flex shrink-0 items-center gap-2">
									<Button
										variant="secondary"
										size="sm"
										icon={<Settings2 size={14} />}
										onClick={() => setSelectedUserId(u.id)}
									>
										데이터 수정
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</Card>

			{selectedUserId && (
				<UserEditDialog
					userId={selectedUserId}
					open={Boolean(selectedUserId)}
					onOpenChange={(open) => {
						if (!open) setSelectedUserId(null);
					}}
					onSaved={() => void mutate()}
				/>
			)}
		</div>
	);
}

function UserEditDialog({
	userId,
	open,
	onOpenChange,
	onSaved,
}: {
	userId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const { data, error, isLoading, mutate } = useSWR<{ user: AdminUserDetail }>(
		open ? `/api/admin/users/${userId}` : null,
		userDetailFetcher,
	);

	const user = data?.user;
	const [birthMonth, setBirthMonth] = useState<string | null>(null);
	const [birthDay, setBirthDay] = useState<string | null>(null);
	const [intro, setIntro] = useState<string | null>(null);
	const [longTermMemory, setLongTermMemory] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [purging, setPurging] = useState(false);

	const currentMonth = birthMonth !== null ? birthMonth : user?.birthMonth != null ? String(user.birthMonth) : "";
	const currentDay = birthDay !== null ? birthDay : user?.birthDay != null ? String(user.birthDay) : "";
	const currentIntro = intro !== null ? intro : (user?.intro ?? "");
	const currentMemory = longTermMemory !== null ? longTermMemory : (user?.longTermMemory ?? "");

	async function handleSave(extra?: {
		clearShortTermMemory?: boolean;
		clearGameRecords?: boolean;
		clearTtsSettings?: boolean;
	}) {
		setSaving(true);
		try {
			const parsedMonth = currentMonth.trim() ? Number.parseInt(currentMonth.trim(), 10) : null;
			const parsedDay = currentDay.trim() ? Number.parseInt(currentDay.trim(), 10) : null;

			const res = await fetch(`/api/admin/users/${userId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					birthMonth: parsedMonth,
					birthDay: parsedDay,
					intro: currentIntro.trim() || null,
					longTermMemory: currentMemory,
					...extra,
				}),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body?.error ?? "유저 데이터 저장에 실패했어요.");
				return;
			}
			setBirthMonth(null);
			setBirthDay(null);
			setIntro(null);
			setLongTermMemory(null);
			await mutate(body, { revalidate: false });
			onSaved();
			notifySaved("유저 데이터를 저장했어요.", null);
		} catch (err) {
			notifyApiError(err, "유저 데이터 저장에 실패했어요.");
		} finally {
			setSaving(false);
		}
	}

	async function handlePurgeUser() {
		setPurging(true);
		try {
			const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body?.error ?? "유저 개인정보 초기화에 실패했어요.");
				return;
			}
			onSaved();
			onOpenChange(false);
			toast.success(`유저(${userId}) 개인 데이터를 모두 초기화했어요.`);
		} catch (err) {
			notifyApiError(err, "유저 개인정보 초기화에 실패했어요.");
		} finally {
			setPurging(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[88svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="font-mono">유저 데이터 편집 · {userId}</DialogTitle>
					<DialogDescription>
						유저의 프로필 정보와 AI 장기 기억(MEMORY.md 마크다운)을 수정하거나 초기화해요.
					</DialogDescription>
				</DialogHeader>

				{isLoading && !user ? (
					<div className="space-y-3 py-4">
						<SkeletonCard className="h-24" />
						<SkeletonCard className="h-40" />
					</div>
				) : error && !user ? (
					<WarningBox>유저 정보를 불러오지 못했어요. ({error.message})</WarningBox>
				) : user ? (
					<div className="space-y-5 py-2">
						<div className="grid grid-cols-2 gap-2 rounded-control bg-surface-2 p-3 text-xs sm:grid-cols-4">
							<div>
								<span className="text-muted-foreground">플레이리스트:</span>{" "}
								<span className="font-bold tabular-nums">{user.counts.playlists}개</span>
							</div>
							<div>
								<span className="text-muted-foreground">게임 기록:</span>{" "}
								<span className="font-bold tabular-nums">{user.counts.gameRecords}건</span>
							</div>
							<div>
								<span className="text-muted-foreground">TTS 설정:</span>{" "}
								<span className="font-bold tabular-nums">{user.counts.ttsSettings}개 서버</span>
							</div>
							<div>
								<span className="text-muted-foreground">단기 기억:</span>{" "}
								<span className="font-bold tabular-nums">{user.shortTermTurns.length}턴</span>
							</div>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<Field label="생일 (월 1~12)">
								<Input
									type="number"
									min={1}
									max={12}
									value={currentMonth}
									onChange={(e) => setBirthMonth(e.target.value)}
									placeholder="비우면 미설정"
								/>
							</Field>
							<Field label="생일 (일 1~31)">
								<Input
									type="number"
									min={1}
									max={31}
									value={currentDay}
									onChange={(e) => setBirthDay(e.target.value)}
									placeholder="비우면 미설정"
								/>
							</Field>
						</div>

						<Field label="프로필 한줄 소개 (최대 120자)">
							<Input
								value={currentIntro}
								maxLength={120}
								onChange={(e) => setIntro(e.target.value)}
								placeholder="프로필 카드에 표시되는 한 줄 소개"
							/>
						</Field>

						<Field
							label="AI 장기 기억 (MEMORY.md)"
							description="## Facts, ## Preferences, ## Commitments 섹션 아래 `- 항목` 형식으로 저장돼요."
						>
							<Textarea
								value={currentMemory}
								onChange={(e) => setLongTermMemory(e.target.value)}
								rows={10}
								className="font-mono text-xs"
							/>
						</Field>

						<div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2 p-3">
							<div className="space-y-0.5 text-xs">
								<p className="font-bold text-foreground">세부 데이터 비우기</p>
								<p className="text-muted-foreground">
									단기 대화 기억, 미니게임 전적, 개인정보 전체(/개인정보 삭제와 동일)를 초기화할 수 있어요.
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									variant="secondary"
									size="sm"
									disabled={saving}
									onClick={() => void handleSave({ clearShortTermMemory: true })}
								>
									단기 기억 비우기 ({user.shortTermTurns.length})
								</Button>
								<Button
									variant="secondary"
									size="sm"
									disabled={saving}
									onClick={() => void handleSave({ clearGameRecords: true })}
								>
									게임 전적 초기화 ({user.counts.gameRecords})
								</Button>
								<Button
									variant="danger"
									size="sm"
									loading={purging}
									icon={<Trash2 size={14} />}
									onClick={() => void handlePurgeUser()}
								>
									개인 데이터 전체 초기화
								</Button>
							</div>
						</div>
					</div>
				) : null}

				<DialogFooter>
					<DialogClose render={<Button variant="ghost" />}>닫기</DialogClose>
					<Button
						variant="primary"
						loading={saving}
						disabled={!user}
						onClick={() => void handleSave()}
					>
						저장하기
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function SocialSubscriptionsPanel() {
	const [query, setQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [editingSub, setEditingSub] = useState<AdminSocialSubscription | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	const params = new URLSearchParams();
	if (query.trim()) params.set("q", query.trim());
	if (statusFilter !== "all") params.set("status", statusFilter);
	const swrKey = `/api/admin/social${params.toString() ? `?${params.toString()}` : ""}`;

	const { data, error, isLoading, mutate } = useSWR<{ subscriptions: AdminSocialSubscription[] }>(
		swrKey,
		socialFetcher,
	);

	const subscriptions = data?.subscriptions ?? [];

	async function quickUpdateStatus(subId: string, nextStatus: "active" | "disabled") {
		setBusyId(subId);
		try {
			const res = await fetch(`/api/admin/social/${subId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: nextStatus }),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body?.error ?? "구독 상태 변경에 실패했어요.");
				return;
			}
			await mutate();
			toast.success(nextStatus === "active" ? "구독을 정상(active) 상태로 복구했어요." : "구독을 일시정지했어요.");
		} catch (err) {
			notifyApiError(err, "구독 상태 변경에 실패했어요.");
		} finally {
			setBusyId(null);
		}
	}

	async function deleteSubscription(subId: string) {
		setBusyId(subId);
		try {
			const res = await fetch(`/api/admin/social/${subId}`, { method: "DELETE" });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body?.error ?? "구독 삭제에 실패했어요.");
				return;
			}
			await mutate();
			toast.success("소셜 알림 구독을 삭제했어요.");
		} catch (err) {
			notifyApiError(err, "구독 삭제에 실패했어요.");
		} finally {
			setBusyId(null);
		}
	}

	return (
		<div className="space-y-6">
			<Card padding="md" className="space-y-5">
				<PanelHeader
					icon={<Bell size={20} />}
					title="소셜 알림 구독 전역 관리"
					description="유튜브·치지직·트위치 알림 구독의 배달 상태(active/failed/disabled)와 메시지 템플릿을 관리해요."
				/>

				<div className="flex flex-col gap-3 sm:flex-row">
					<InputGroup className="flex-1">
						<InputGroupAddon>
							<Search size={16} />
						</InputGroupAddon>
						<InputGroupInput
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="채널명, 플랫폼 ID, 서버 ID 검색..."
							aria-label="소셜 알림 검색"
						/>
					</InputGroup>

					<Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
						<SelectTrigger className="w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">전체 상태 (all)</SelectItem>
							<SelectItem value="active">정상 (active)</SelectItem>
							<SelectItem value="failed">배달 실패 (failed)</SelectItem>
							<SelectItem value="disabled">일시정지 (disabled)</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{isLoading && !data ? (
					<div className="space-y-2">
						<SkeletonCard className="h-20" />
						<SkeletonCard className="h-20" />
					</div>
				) : error && !data ? (
					<WarningBox>
						소셜 알림 구독 목록을 불러오지 못했어요. ({error.message}) <RetryLink onRetry={() => void mutate()} />
					</WarningBox>
				) : subscriptions.length === 0 ? (
					<EmptyState
						icon={Bell}
						size="sm"
						title="조건에 맞는 소셜 알림 구독이 없어요."
						description="필터나 검색어를 변경해 보세요."
					/>
				) : (
					<div className="divide-y divide-border-subtle rounded-card bg-surface-2">
						{subscriptions.map((sub) => (
							<div
								key={sub.id}
								className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
							>
								<div className="min-w-0 space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<Badge
											variant={
												sub.status === "active"
													? "success"
													: sub.status === "failed"
														? "danger"
														: "secondary"
											}
											size="sm"
										>
											{sub.status}
										</Badge>
										<Badge variant="outline" size="sm">
											{sub.platform}
										</Badge>
										<span className="font-bold text-foreground">{sub.sourceName}</span>
										<span className="font-mono text-xs text-muted-foreground">({sub.sourcePlatformId})</span>
									</div>
									<p className="font-mono text-xs text-muted-foreground">
										서버: {sub.guildId} · 알림 채널: {sub.targetChannelId}
									</p>
								</div>

								<div className="flex shrink-0 flex-wrap items-center gap-2">
									{sub.status !== "active" ? (
										<Button
											variant="secondary"
											size="sm"
											loading={busyId === sub.id}
											onClick={() => void quickUpdateStatus(sub.id, "active")}
										>
											정상 복구
										</Button>
									) : (
										<Button
											variant="ghost"
											size="sm"
											loading={busyId === sub.id}
											onClick={() => void quickUpdateStatus(sub.id, "disabled")}
										>
											일시정지
										</Button>
									)}
									<Button
										variant="secondary"
										size="sm"
										icon={<Settings2 size={14} />}
										onClick={() => setEditingSub(sub)}
									>
										수정
									</Button>
									<Button
										variant="danger"
										size="sm"
										loading={busyId === sub.id}
										icon={<Trash2 size={14} />}
										onClick={() => void deleteSubscription(sub.id)}
									>
										삭제
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</Card>

			{editingSub && (
				<SocialEditDialog
					sub={editingSub}
					open={Boolean(editingSub)}
					onOpenChange={(open) => {
						if (!open) setEditingSub(null);
					}}
					onSaved={() => void mutate()}
				/>
			)}
		</div>
	);
}

function SocialEditDialog({
	sub,
	open,
	onOpenChange,
	onSaved,
}: {
	sub: AdminSocialSubscription;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [sourceName, setSourceName] = useState(sub.sourceName);
	const [status, setStatus] = useState<"active" | "failed" | "disabled">(sub.status);
	const [messageTemplate, setMessageTemplate] = useState(sub.messageTemplate ?? "");
	const [webhookName, setWebhookName] = useState(sub.webhookName ?? "");
	const [showThumbnail, setShowThumbnail] = useState(sub.showThumbnail);
	const [saving, setSaving] = useState(false);

	async function handleSave() {
		setSaving(true);
		try {
			const res = await fetch(`/api/admin/social/${sub.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sourceName: sourceName.trim(),
					status,
					messageTemplate: messageTemplate.trim() || null,
					webhookName: webhookName.trim() || null,
					showThumbnail,
				}),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body?.error ?? "구독 수정에 실패했어요.");
				return;
			}
			onSaved();
			onOpenChange(false);
			notifySaved("소셜 알림 구독을 수정했어요.", null);
		} catch (err) {
			notifyApiError(err, "구독 수정에 실패했어요.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>소셜 알림 구독 수정 · {sub.sourceName}</DialogTitle>
					<DialogDescription className="font-mono text-xs">
						서버 {sub.guildId} · 채널 {sub.targetChannelId}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<Field label="표시 채널 이름">
						<Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} maxLength={120} />
					</Field>

					<Field label="배달 상태">
						<Select
							value={status}
							onValueChange={(v) => v && setStatus(v as "active" | "failed" | "disabled")}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="active">정상 (active)</SelectItem>
								<SelectItem value="failed">배달 실패 (failed)</SelectItem>
								<SelectItem value="disabled">일시정지 (disabled)</SelectItem>
							</SelectContent>
						</Select>
					</Field>

					<Field label="웹훅 표시 이름 오버라이드 (비우면 기본값)">
						<Input value={webhookName} onChange={(e) => setWebhookName(e.target.value)} maxLength={80} />
					</Field>

					<Field label="알림 메시지 템플릿 ({title}, {url}, {author} 사용 가능)">
						<Textarea
							value={messageTemplate}
							onChange={(e) => setMessageTemplate(e.target.value)}
							rows={3}
							maxLength={1000}
						/>
					</Field>

					<Switch
						label="라이브 섬네일 이미지 표시"
						size="sm"
						checked={showThumbnail}
						onChange={setShowThumbnail}
					/>
				</div>

				<DialogFooter>
					<DialogClose render={<Button variant="ghost" />}>취소</DialogClose>
					<Button variant="primary" loading={saving} onClick={() => void handleSave()}>
						저장하기
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function AdminDashboard() {
	const [activeTab, setActiveTab] = useState<AdminTabKey>("overview");

	function renderActivePanel() {
		switch (activeTab) {
			case "overview":
				return <OverviewPanel />;
			case "nodes":
				return <NodesAndControlPanel />;
			case "guilds":
				return <GuildsDataPanel />;
			case "users":
				return <UsersDataPanel />;
			case "social":
				return <SocialSubscriptionsPanel />;
		}
	}

	return (
		<div className="space-y-6">
			{/* 모바일/태블릿 가로 탭 */}
			<div className="lg:hidden">
				<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AdminTabKey)}>
					<TabsList className="w-full justify-start overflow-x-auto scrollbar-none">
						{ADMIN_TABS.map((tab) => (
							<TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
								{tab.icon}
								<span>{tab.label}</span>
							</TabsTrigger>
						))}
					</TabsList>
					{ADMIN_TABS.map((tab) => (
						<TabsContent key={tab.key} value={tab.key} className="mt-4">
							{activeTab === tab.key ? renderActivePanel() : null}
						</TabsContent>
					))}
				</Tabs>
			</div>

			{/* 데스크톱 사이드바 + 본문 */}
			<div className="hidden lg:flex lg:items-start lg:gap-8">
				<ServerFeatureSidebar
					items={ADMIN_TABS}
					active={activeTab}
					onSelect={(key) => setActiveTab(key as AdminTabKey)}
				/>
				<div className="min-w-0 flex-1">{renderActivePanel()}</div>
			</div>
		</div>
	);
}
