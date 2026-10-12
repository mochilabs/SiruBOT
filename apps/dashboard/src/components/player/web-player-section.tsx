"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { ListMusic, Play, Search } from "lucide-react";
import useSWR from "swr";

import { PlayerClient, type PlayerTrack } from "@/app/player/[id]/player-client";
import PlayerLiveTab from "@/components/player/player-live-tab";
import { EmptyState } from "@/components/primitives/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SkeletonLine } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

interface VoiceContext {
	inVoice: boolean;
	voiceChannelName: string | null;
	canControl: boolean;
}

interface TrackSummary {
	title: string;
	author: string;
	durationMs: number;
	artworkUrl: string | null;
	uri: string;
	sourceName: string | null;
	isStream: boolean;
}

const formatMs = (ms: number) => {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const isPlayableUrl = (value: string) => /^https?:\/\//i.test(value.trim());

function VoiceStatusBadge({ guildId }: { guildId: string }) {
	const { data, error, isLoading } = useSWR<{ voice: VoiceContext | null }>(
		`/api/servers/${guildId}/player/voice-context`,
	);

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
		<div className="flex min-w-0 items-center gap-3 rounded-control bg-surface-2 px-3 py-2.5">
			<span className="w-4 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{index + 1}</span>
			{track.artworkUrl ? (
				<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
					<Image src={track.artworkUrl} alt="" fill className="object-cover" sizes="40px" unoptimized />
				</div>
			) : (
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-3 text-muted-foreground">
					<ListMusic size={14} aria-hidden />
				</div>
			)}
			<div className="min-w-0 flex-1">
				<p className="line-clamp-1 text-sm font-semibold text-foreground">{track.title}</p>
				<p className="truncate text-xs text-muted-foreground">
					{track.author}
					{track.sourceName ? ` · ${track.sourceName}` : ""}
				</p>
			</div>
			<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
				{track.isStream ? "스트림" : formatMs(track.durationMs)}
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
	const [searching, setSearching] = useState(false);
	const [results, setResults] = useState<TrackSummary[] | null>(null);
	/** 클릭한 트랙 uri — 재생 대기 중 표시. 봇이 상태를 퍼블리시하면 라이브 카드가 이을 거예요 */
	const [playingUri, setPlayingUri] = useState<string | null>(null);
	const { data: voiceData } = useSWR<{ voice: VoiceContext | null }>(`/api/servers/${guildId}/player/voice-context`);
	const canControl = voiceData?.voice?.canControl ?? true;
	const inVoice = voiceData?.voice?.inVoice ?? true;

	const showToastError = useCallback(
		(message: string | null | undefined, fallback: string) => {
			toast.error(message && message.length > 0 ? message : fallback, "봇이 접속 중인지 확인해 주세요.");
		},
		[toast],
	);

	const playTrack = useCallback(
		async (uri: string) => {
			if (!canControl) {
				showToastError("재생 제어는 서버 관리자 또는 DJ 역할이 필요해요.", "재생 제어 권한이 없어요.");
				return;
			}
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
				setPlayingUri(null);
			}
		},
		[canControl, guildId, showToastError, toast],
	);

	const handleSearch = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault();
			const trimmed = query.trim();
			if (!trimmed || searching) return;

			// URL이면 검색 없이 바로 재생 — 다시 재생 링크·유튜브 링크를 붙여넣는 가장 빠른 경로예요
			if (isPlayableUrl(trimmed)) {
				await playTrack(trimmed);
				return;
			}

			setSearching(true);
			setResults(null);
			try {
				const res = await fetch(`/api/servers/${guildId}/player/search`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query: trimmed }),
				});
				const body = (await res.json().catch(() => null)) as { tracks?: TrackSummary[]; error?: string } | null;
				if (!res.ok) {
					showToastError(body?.error, "검색을 처리하지 못했어요.");
					return;
				}
				setResults(body?.tracks ?? []);
			} catch {
				showToastError(null, "검색을 처리하지 못했어요.");
			} finally {
				setSearching(false);
			}
		},
		[guildId, playTrack, query, searching, showToastError],
	);

	const handleHistoryPlay = useCallback(
		async (track: PlayerTrack) => {
			await playTrack(track.url);
		},
		[playTrack],
	);

	return (
		<div className="space-y-8">
			<Card padding="lg" className="gap-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="flex items-center gap-2 text-base font-black tracking-tight text-foreground">
						<span className="text-primary-control">
							<Search size={15} aria-hidden />
						</span>
						곡 검색 · 바로 재생
					</h2>
					<VoiceStatusBadge guildId={guildId} />
				</div>

				<form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="검색어 또는 유튜브 링크"
						aria-label="재생할 곡 검색어"
						maxLength={200}
						className="min-w-0 flex-1"
					/>
					<Button type="submit" loading={searching} disabled={searching}>
						{isPlayableUrl(query) ? "바로 재생" : "검색"}
					</Button>
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
									playing={playingUri === track.uri}
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
