"use client";

import { useState } from "react";
import { Search, Settings2, UserRound } from "lucide-react";
import useSWR from "swr";

import { UserEditDialog } from "@/components/admin/user-edit-dialog";
import { EmptyState } from "@/components/primitives/empty-state";
import { PanelHeader, RetryLink, WarningBox } from "@/components/servers/settings-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { SkeletonCard } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { createApiFetcher } from "@/lib/swr";

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

const usersFetcher = createApiFetcher<{ users: AdminUserSummary[] }>("유저 목록을 불러오지 못했어요.");

export function UsersDataPanel() {
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
