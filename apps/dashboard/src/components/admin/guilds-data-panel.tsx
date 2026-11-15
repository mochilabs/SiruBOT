"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Search, Server, Settings2 } from "lucide-react";
import useSWR from "swr";

import { GuildEditDialog } from "@/components/admin/guild-edit-dialog";
import { EmptyState } from "@/components/primitives/empty-state";
import { PanelHeader, RetryLink, WarningBox } from "@/components/servers/settings-shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { SkeletonCard } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { formatRelativeTime } from "@/lib/format";
import { createApiFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

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
	automixEnabled: boolean;
	automixMaxTempoChange: number;
	automixMinConfidence: number;
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

const guildsFetcher = createApiFetcher<{ guilds: AdminGuildSummary[] }>("서버 목록을 불러오지 못했어요.");

export function GuildsDataPanel() {
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
