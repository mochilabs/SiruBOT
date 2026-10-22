"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { formatDuration } from "@sirubot/utils/time";
import { ListMusic, Loader2, Play, Search, X } from "lucide-react";

import { PlayerClient, type PlayerTrack } from "@/app/player/[id]/player-client";
import PlayerLiveTab from "@/components/player/player-live-tab";
import { EmptyState } from "@/components/primitives/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SkeletonLine } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useDebounce } from "@/hooks/use-debounce";
import { playerErrorMessage } from "@/lib/player-error";
import { createApiFetcher, useGuildResource } from "@/lib/swr";
import { prettySourceName } from "@/utils";
interface VoiceContext {
	inVoice: boolean;
	voiceChannelName: string | null;
	canControl: boolean;
}

interface VoiceContextResponse {
	voice: VoiceContext | null;
}

const voiceContextFetcher = createApiFetcher<VoiceContextResponse>("음성 연결 상태를 불러오지 못했어요.");

interface TrackSummary {
	title: string;
	author: string;
	durationMs: number;
	artworkUrl: string | null;
	uri: string;
	sourceName: string | null;
	isStream: boolean;
}

const isPlayableUrl = (value: string) => /^https?:\/\//i.test(value.trim());

function VoiceStatusBadge({ guildId }: { guildId: string }) {
	const { data, error, isLoading } = useGuildResource<VoiceContextResponse>(guildId, "/player/voice-context", { fetcher: voiceContextFetcher });

	if (isLoading) return <SkeletonLine width="72px" height="h-6" />;
	if (error || !data?.voice) {
		// 봇 미접속·권한 불확실 — 재생 요청은 실패 이유를 응답으로 알려주므로 확정 안내 대신 경고 상태만
		return (
			<Badge variant="warning" dot>
				음성 상태 확인 불가
			</Badge>
		);
	}

	const { voice } = data;
	return (
		<span className="flex flex-wrap items-center gap-2">
			{voice.inVoice ? (
				<Badge variant="success" dot>
					{voice.voiceChannelName ?? "음성 채널"} 접속 중
				</Badge>
			) : (
				<Badge variant="warning" dot>
					음성 채널 미접속
				</Badge>
			)}
			{!voice.canControl && (
				<Badge variant="warning">재생 제어는 관리자 또는 DJ 역할이 필요해요</Badge>
			)}
		</span>
	);
}

function SearchResultRow({
	index,
	track,
	playing,
	onPlay,
}: {
	index: number;
	track: TrackSummary;
	playing: boolean;
	onPlay: (uri: string) => void;
}) {
	return (
		<div className="flex min-w-0 items-center gap-3 rounded-card bg-surface-2 px-3 py-2.5">
			<span className="w-4 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{index + 1}</span>
			{track.artworkUrl ? (
				<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
					<Image src={track.artworkUrl} alt="" fill className="object-cover" sizes="40px" unoptimized />
				</div>
			) : (
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-1 text-muted-foreground">
					<ListMusic size={14} aria-hidden />
				</div>
			)}
			<div className="min-w-0 flex-1">
				<p className="line-clamp-1 text-sm font-semibold text-foreground">{track.title}</p>
				<p className="truncate text-xs text-muted-foreground">
					{track.author}
					{track.sourceName ? ` · ${prettySourceName(track.sourceName)}` : ""}
				</p>
			</div>
			<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
				{track.isStream ? "스트림" : formatDuration(track.durationMs)}
			</span>
			<Button
				variant="secondary"
				size="sm"
				icon={<Play size={13} />}
				onClick={() => onPlay(track.uri)}
				loading={playing}
				disabled={playing}
				aria-label={`${track.title} 재생`}
			>
				재생
			</Button>
		</div>
	);
}

export default function WebPlayerSection({ guildId }: { guildId: string }) {
	const toast = useToast();
	const [query, setQuery] = useState("");
	const trimmedQuery = query.trim();
	const debouncedQuery = useDebounce(trimmedQuery, 400);
	const [searching, setSearching] = useState(false);
	const [results, setResults] = useState<TrackSummary[] | null>(null);
	const [searchNotice, setSearchNotice] = useState<string | null>(null);
	/** 클릭한 트랙 uri — 재생 대기 중 표시. 봇이 상태를 퍼블리시하면 라이브 카드가 이을 거예요 */
	const [playingUri, setPlayingUri] = useState<string | null>(null);
	const playPendingRef = useRef(false);
	const searchAbortRef = useRef<AbortController | null>(null);
	const lastSearchedRef = useRef<string>("");
	const { data: voiceData } = useGuildResource<VoiceContextResponse>(guildId, "/player/voice-context", { fetcher: voiceContextFetcher });
	const canControl = voiceData?.voice?.canControl ?? true;
	const inVoice = voiceData?.voice?.inVoice ?? true;

	const showToastError = useCallback(
		(message: string | null | undefined, fallback: string) => {
			toast.error(playerErrorMessage(message, fallback));
		},
		[toast],
	);

	const playTrack = useCallback(
		async (uri: string) => {
			if (playPendingRef.current) return;
			if (!canControl) {
				showToastError("재생 제어는 서버 관리자 또는 DJ 역할이 필요해요.", "재생 제어 권한이 없어요.");
				return;
			}
			playPendingRef.current = true;
			setPlayingUri(uri);
			try {
				const res = await fetch(`/api/servers/${guildId}/player/play`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ uri }),
				});
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				if (res.ok) {
					toast.success("재생을 요청했어요.", "봇이 음성 채널에 접속해 재생해요.");
					return;
				}
				showToastError(body?.error, "재생을 시작하지 못했어요.");
			} catch {
				showToastError(null, "재생을 시작하지 못했어요.");
			} finally {
				playPendingRef.current = false;
				setPlayingUri(null);
			}
		},
		[canControl, guildId, showToastError, toast],
	);

	const runSearch = useCallback(
		async (targetQuery: string, options?: { notifyOnError?: boolean }) => {
			const trimmed = targetQuery.trim();
			if (!trimmed || isPlayableUrl(trimmed)) return;

			searchAbortRef.current?.abort();
			const controller = new AbortController();
			searchAbortRef.current = controller;
			lastSearchedRef.current = trimmed;
			setSearching(true);
			setSearchNotice(null);

			try {
				const res = await fetch(`/api/servers/${guildId}/player/search`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query: trimmed }),
					signal: controller.signal,
				});
				const body = (await res.json().catch(() => null)) as { tracks?: TrackSummary[]; error?: string } | null;
				if (controller.signal.aborted) return;

				if (!res.ok) {
					const cleaned = playerErrorMessage(body?.error, "검색을 처리하지 못했어요.");
					if (cleaned.includes("검색 결과가 없어요")) {
						setResults([]);
						return;
					}
					setResults(null);
					setSearchNotice(cleaned);
					if (options?.notifyOnError) {
						toast.error(cleaned);
					}
					return;
				}
				setResults(body?.tracks ?? []);
			} catch (err) {
				if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
				const fallback = "검색을 처리하지 못했어요.";
				setSearchNotice(fallback);
				if (options?.notifyOnError) {
					showToastError(null, fallback);
				}
			} finally {
				if (searchAbortRef.current === controller) {
					setSearching(false);
				}
			}
		},
		[guildId, showToastError, toast],
	);

	// 타이핑 시 400ms 디바운스 자동 검색 (링크 입력이거나 비어 있으면 초기화)
	useEffect(() => {
		if (!trimmedQuery || isPlayableUrl(trimmedQuery)) {
			searchAbortRef.current?.abort();
			lastSearchedRef.current = "";
			setSearching(false);
			setResults(null);
			setSearchNotice(null);
			return;
		}
		if (!debouncedQuery || isPlayableUrl(debouncedQuery)) return;
		if (!inVoice || !canControl) return;
		if (lastSearchedRef.current === debouncedQuery) return;

		void runSearch(debouncedQuery, { notifyOnError: false });
	}, [canControl, debouncedQuery, inVoice, runSearch, trimmedQuery]);

	useEffect(() => {
		return () => {
			searchAbortRef.current?.abort();
		};
	}, []);

	const handleSubmit = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault();
			if (!trimmedQuery) return;

			// URL이면 검색 없이 바로 재생 — 다시 재생 링크·유튜브 링크를 붙여넣는 가장 빠른 경로예요
			if (isPlayableUrl(trimmedQuery)) {
				await playTrack(trimmedQuery);
				return;
			}

			await runSearch(trimmedQuery, { notifyOnError: true });
		},
		[playTrack, runSearch, trimmedQuery],
	);

	const handleHistoryPlay = useCallback(
		async (track: PlayerTrack) => {
			await playTrack(track.url);
		},
		[playTrack],
	);

	const isUrl = isPlayableUrl(trimmedQuery);
	const isTypingDebounce = Boolean(trimmedQuery && !isUrl && inVoice && canControl && trimmedQuery !== debouncedQuery);
	const showLoading = searching || isTypingDebounce;

	return (
		<div className="space-y-8">
			<Card padding="lg" className="gap-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="flex items-center gap-2 text-base font-black tracking-tight text-foreground">
						<span className="text-primary-text">
							<Search size={15} aria-hidden />
						</span>
						곡 검색 · 바로 재생
					</h2>
					<VoiceStatusBadge guildId={guildId} />
				</div>

				<form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<div className="relative min-w-0 flex-1">
						<Search
							size={15}
							className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
							aria-hidden
						/>
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="곡 제목·아티스트를 입력하면 자동으로 검색돼요 (또는 유튜브 링크)"
							aria-label="재생할 곡 검색어"
							maxLength={200}
							className="pl-9 pr-9"
						/>
						{showLoading ? (
							<Loader2
								size={15}
								className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
								aria-label="검색 중"
							/>
						) : query ? (
							<button
								type="button"
								onClick={() => setQuery("")}
								className="absolute right-2.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="검색어 지우기"
							>
								<X size={13} aria-hidden />
							</button>
						) : null}
					</div>
					{isUrl && (
						<Button type="submit" loading={playingUri !== null} disabled={playingUri !== null}>
							바로 재생
						</Button>
					)}
				</form>

				{!inVoice && (
					<p className="rounded-card bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
						음성 채널에 접속한 상태라면 검색 결과에서 바로 재생할 수 있어요.
					</p>
				)}
				{!canControl && (
					<p className="rounded-card border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
						재생 제어는 서버 관리자 또는 DJ 역할이 필요해요.
					</p>
				)}
				{searchNotice && (
					<p className="rounded-card bg-surface-2 px-4 py-3 text-sm text-muted-foreground" role="status">
						{searchNotice}
					</p>
				)}

				{results && (
					<div className="space-y-2" aria-live="polite">
						{results.length === 0 ? (
							<EmptyState
								icon={ListMusic}
								size="sm"
								title="검색 결과가 없어요."
								description="다른 검색어로 다시 시도해 주세요."
							/>
						) : (
							results.map((track, index) => (
								<SearchResultRow
									key={`${track.uri}-${index}`}
									index={index}
									track={track}
									playing={playingUri !== null}
									onPlay={playTrack}
								/>
							))
						)}
					</div>
				)}
			</Card>

			<PlayerLiveTab guildId={guildId} />
			<PlayerClient guildId={guildId} onPlay={handleHistoryPlay} />
		</div>
	);
}
