"use client";

import { useState } from "react";
import { isTransitionMode, TRANSITION_LABELS, TRANSITION_MODES, transitionFlags, transitionMode } from "@sirubot/utils/mixerTransition";
import { Trash2 } from "lucide-react";
import useSWR from "swr";

import { Field } from "@/components/primitives/field";
import { WarningBox } from "@/components/servers/settings-shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { notifyApiError, notifySaved } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";

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
	automixEnabled: boolean;
	automixMaxTempoChange: number;
	automixMinConfidence: number;
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

const guildDetailFetcher = createApiFetcher<{ guild: AdminGuildDetail }>("서버 상세 정보를 불러오지 못했어요.");

export function GuildEditDialog({
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
				automixEnabled: current.automixEnabled,
				automixMaxTempoChange: current.automixMaxTempoChange,
				automixMinConfidence: current.automixMinConfidence,
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

                        <Field label="곡 전환 방식">
                            <Select value={transitionMode(current)} disabled={saving}
                                onValueChange={(value) => { if (isTransitionMode(value)) setDraft((prev) => ({ ...prev, ...transitionFlags(value) })); }}>
                                <SelectTrigger aria-label="곡 전환 방식"><SelectValue>{(value) => isTransitionMode(value) ? TRANSITION_LABELS[value] : "끄기"}</SelectValue></SelectTrigger>
                                <SelectContent>{TRANSITION_MODES.map((mode) => <SelectItem key={mode} value={mode}>{TRANSITION_LABELS[mode]}</SelectItem>)}</SelectContent>
                            </Select>
                        </Field>

                        <Field label="AutoMix 최대 템포 변경" description="비트 맞춤에 허용할 템포 변경 범위예요.">
                            <Slider value={current.automixMaxTempoChange * 100} min={0} max={12} step={1}
                                label="AutoMix 최대 템포 변경" showValue formatValue={(value) => `${value.toFixed(0)}%`}
                                disabled={saving || !current.automixEnabled}
                                onChange={(value) => setDraft((prev) => ({ ...prev, automixMaxTempoChange: value / 100 }))} />
                        </Field>
                        <Field label="AutoMix 최소 분석 신뢰도" description="높일수록 박자가 확실한 곡에만 적용해요.">
                            <Slider value={current.automixMinConfidence} min={0} max={1} step={0.05}
                                label="AutoMix 최소 분석 신뢰도" showValue formatValue={(value) => value.toFixed(2)}
                                disabled={saving || !current.automixEnabled}
                                onChange={(value) => setDraft((prev) => ({ ...prev, automixMinConfidence: value }))} />
                        </Field>

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
