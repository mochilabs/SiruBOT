"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { PLAYER_WEB_CODE_SEARCH_EMPTY } from "@sirubot/utils/playerWeb";
import { formatDuration } from "@sirubot/utils/time";
import { ListMusic, Loader2, Play, Search, X } from "lucide-react";

import { PlayerClient, type PlayerTrack } from "@/app/player/[id]/player-client";
import PlayerLiveTab from "@/components/player/player-live-tab";
import { EmptyState } from "@/components/primitives/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { SkeletonLine } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useDebounce } from "@/hooks/use-debounce";
import { playerErrorMessage } from "@/lib/player-error";
import { prettySourceName } from "@/utils";

import { useVoiceContext } from "./voice-context";
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
	const { data, error, isLoading } = useVoiceContext(guildId);

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
				<Badge variant="warning">제어는 봇과 같은 음성 채널에서 할 수 있어요</Badge>
			)}
		</span>
	);
}

function SearchResultRow({
	track,
	playing,
	disabled,
	onPlay,
}: {
	track: TrackSummary;
	/** 이 곡이 재생 요청 중이에요 — 이 행 버튼만 로딩으로 보여요 */
	playing: boolean;
	/** 다른 곡이 요청 중이라 잠시 눌러도 소용없어요 */
	disabled: boolean;
	onPlay: (uri: string) => void;
}) {
	const meta = [track.author, track.isStream ? "스트림" : formatDuration(track.durationMs), track.sourceName ? prettySourceName(track.sourceName) : null]
		.filter(Boolean)
		.join(" · ");
	return (
		<div className="flex min-w-0 items-center gap-3 rounded-row bg-surface-2 p-2.5">
			{track.artworkUrl ? (
				<div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-control-inner">
					<Image src={track.artworkUrl} alt="" fill className="object-cover" sizes="48px" unoptimized />
				</div>
			) : (
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control-inner bg-surface-1 text-muted-foreground">
					<ListMusic size={16} aria-hidden />
				</div>
			)}
			<div className="min-w-0 flex-1">
				{isPlayableUrl(track.uri) ? (
					<a
						href={track.uri}
						target="_blank"
						rel="noopener noreferrer"
						className="line-clamp-1 text-sm font-semibold text-foreground hover:text-primary-text hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm transition-colors duration-fast"
					>
						{track.title}
					</a>
				) : (
					<p className="line-clamp-1 text-sm font-semibold text-foreground">{track.title}</p>
				)}
				<p className="truncate text-xs tabular-nums text-muted-foreground">{meta}</p>
			</div>
			<Button
				variant="secondary"
				size="icon-lg"
				className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
				icon={<Play size={15} />}
				onClick={() => onPlay(track.uri)}
				loading={playing}
				disabled={playing || disabled}
				aria-label={`${track.title} 재생`}
			/>
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
	const { data: voiceData } = useVoiceContext(guildId);
	// 곡 추가 가능 여부 — 봇이 실제 인가와 같은 정책으로 계산해요. 음성 상태를 아직 못 받은 로딩 중에만 열어 두고 봇의 거절 안내에 맡겨요.
	const canPlay = voiceData?.voice ? voiceData.voice.canPlay : true;

	const showToastError = useCallback(
		(message: string | null | undefined, fallback: string) => {
			toast.error(playerErrorMessage(message, fallback));
		},
		[toast],
	);

	const playTrack = useCallback(
		async (uri: string) => {
			if (playPendingRef.current) return;
			if (!canPlay) {
				showToastError("봇과 같은 음성 채널에 접속하면 곡을 추가할 수 있어요.", "지금은 곡을 추가할 수 없어요.");
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
		[canPlay, guildId, showToastError, toast],
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
				const body = (await res.json().catch(() => null)) as { tracks?: TrackSummary[]; error?: string; code?: string } | null;
				if (controller.signal.aborted) return;

				if (!res.ok) {
					// 안내 문구가 아니라 오류 코드로 "결과 없음"을 가려요
					if (body?.code === PLAYER_WEB_CODE_SEARCH_EMPTY) {
						setResults([]);
						return;
					}
					const cleaned = playerErrorMessage(body?.error, "검색을 처리하지 못했어요.");
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
		if (!canPlay) return;
		if (lastSearchedRef.current === debouncedQuery) return;

		void runSearch(debouncedQuery, { notifyOnError: false });
	}, [canPlay, debouncedQuery, runSearch, trimmedQuery]);

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
	const isTypingDebounce = Boolean(trimmedQuery && !isUrl && canPlay && trimmedQuery !== debouncedQuery);
	const showLoading = searching || isTypingDebounce;

	return (
		// 데스크톱은 왼쪽에 라이브(지금 곡·대기열), 오른쪽 위에 검색, 아래에 기록을 둬요.
		// 모바일은 검색을 맨 위로 올려 긴 라이브 패널 아래로 밀리지 않게 하고, 라이브 → 기록 순으로 이어져요.
		<div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-x-8">
			<div className="order-2 min-w-0 lg:order-none lg:row-span-2">
				<PlayerLiveTab guildId={guildId} />
			</div>

			<Card padding="lg" className="order-1 min-w-0 gap-4 p-4 sm:gap-5 sm:p-6 lg:order-none" >
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="flex items-center gap-2 text-base font-extrabold tracking-tight text-foreground">
						<span className="text-primary-text">
							<Search size={15} aria-hidden />
						</span>
						곡 검색
					</h2>
					<VoiceStatusBadge guildId={guildId} />
				</div>

				<form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<InputGroup className="h-9 min-w-0 flex-1 pointer-coarse:h-11">
						<InputGroupAddon>
							<Search size={16} aria-hidden />
						</InputGroupAddon>
						<InputGroupInput
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="곡 제목·아티스트 또는 링크"
							aria-label="재생할 곡 검색어"
							maxLength={200}
						/>
						<InputGroupAddon align="inline-end">
							{showLoading ? (
								<span role="status" className="inline-flex">
									<Loader2 size={16} className="animate-spin text-muted-foreground" aria-hidden />
									<span className="sr-only">검색 중</span>
								</span>
							) : query ? (
								<InputGroupButton size="icon-xs" onClick={() => setQuery("")} aria-label="검색어 지우기">
									<X size={14} aria-hidden />
								</InputGroupButton>
							) : null}
						</InputGroupAddon>
					</InputGroup>
					{isUrl && (
						<Button type="submit" className="pointer-coarse:min-h-11" loading={playingUri !== null} disabled={playingUri !== null}>
							바로 재생
						</Button>
					)}
				</form>

				{!query && !results && canPlay && (
					<p className="text-sm text-muted-foreground">곡 이름을 입력하면 자동으로 검색돼요.</p>
				)}

				{!canPlay && (
					<p className="rounded-row bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
						봇과 같은 음성 채널에 접속하면 검색 결과에서 바로 재생할 수 있어요.
					</p>
				)}
				{searchNotice && (
					<p className="rounded-row bg-surface-2 px-4 py-3 text-sm text-muted-foreground" role="status">
						{searchNotice}
					</p>
				)}

				{results && (
					<div className="space-y-2" aria-live="polite">
							{results.length > 0 && (
								<p className="text-xs font-medium text-muted-foreground">검색 결과 {results.length}곡</p>
							)}
						{results.length === 0 ? (
							<EmptyState
								icon={ListMusic}
								size="sm"
								title="검색 결과가 없어요."
								description="다른 검색어로 다시 시도해 주세요."
							/>
						) : (
							<div className="max-h-[28rem] space-y-2 overflow-y-auto scrollbar-none">
								{results.map((track, index) => (
								<SearchResultRow
									key={`${track.uri}-${index}`}
									track={track}
									playing={playingUri === track.uri}
									disabled={playingUri !== null}
									onPlay={playTrack}
								/>
								))}
								</div>
						)}
					</div>
				)}
			</Card>

			<div className="order-3 min-w-0 lg:order-none">
				<PlayerClient guildId={guildId} onPlay={handleHistoryPlay} playingUrl={playingUri} />
			</div>
		</div>
	);
}
