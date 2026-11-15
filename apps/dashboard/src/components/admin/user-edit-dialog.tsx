"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import useSWR from "swr";

import { Field } from "@/components/primitives/field";
import { WarningBox } from "@/components/servers/settings-shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { notifyApiError, notifySaved } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";

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

const userDetailFetcher = createApiFetcher<{ user: AdminUserDetail }>("유저 상세 정보를 불러오지 못했어요.");

export function UserEditDialog({
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
