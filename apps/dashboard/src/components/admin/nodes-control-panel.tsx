"use client";

import { useState } from "react";
import type { BotAdminEmojiItem, BotAdminNodeItem, BotAdminReloadStore } from "@sirubot/utils/botAdmin";
import { formatUptime } from "@sirubot/utils/time";
import { PlugZap, PowerOff, RadioTower, RefreshCw, RotateCcw, Smile } from "lucide-react";
import useSWR from "swr";

import { EmptyState } from "@/components/primitives/empty-state";
import { StatusDot } from "@/components/primitives/status-dot";
import { InfoBox, PanelHeader, RetryLink, WarningBox } from "@/components/servers/settings-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { formatMemory } from "@/lib/format";
import { notifyApiError } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";

const botNodesFetcher = createApiFetcher<{ nodes: BotAdminNodeItem[] }>("노드 상태를 불러오지 못했어요.");

export function NodesAndControlPanel() {
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
