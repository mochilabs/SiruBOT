"use client";

import { type ReactNode,useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import { EmptyState } from "@/components/primitives/empty-state";
import { PanelError, PanelHeader } from "@/components/servers/settings-shared";
import { Card } from "@/components/ui/card";
import { SkeletonLine } from "@/components/ui/skeleton";
import { toError } from "@/lib/api-error";
import { createApiFetcher, useGuildResource } from "@/lib/swr";

import { QueueList } from "./live-queue-list";
import { LyricsPanel } from "./lyrics-panel";
import { NowPlaying } from "./now-playing-card";

function LivePanel({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <Card padding="lg" className="gap-5 p-4 sm:gap-6 sm:p-6 overflow-visible">
      {!compact && (
        <PanelHeader icon={<Radio className="h-5 w-5" />} title="라이브" description="지금 재생 중인 곡과 대기열을 실시간으로 확인해요." />
      )}
      {children}
    </Card>
  );
}

function LiveLoading({ compact }: { compact: boolean }) {
  return (
    <LivePanel compact={compact}>
      <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Radio size={14} /> 라이브 상태 불러오는 중…
      </div>
      <div className="space-y-2">
        <SkeletonLine width="65%" height="h-5" />
        <SkeletonLine width="40%" height="h-4" />
        <SkeletonLine width="100%" height="h-2" />
      </div>
      </div>
    </LivePanel>
  );
}

function LiveEmpty({ detail, compact }: { detail?: string; compact: boolean }) {
  return (
    <LivePanel compact={compact}>
      <EmptyState
        icon={Radio}
        title="지금은 재생 정보가 없어요"
        description={
          detail ??
          "봇이 이 서버에서 음악을 재생하면 여기에 실시간 상태가 표시돼요."
        }
      />
    </LivePanel>
  );
}

interface LivePayload {
  player: LivePlayerState | null;
  hub: { guilds: number; subscribed: boolean; staleMs: number };
}

const liveFetcher = createApiFetcher<LivePayload>("라이브 상태를 불러오지 못했어요.");

/** 폴백 폴링 주기 — 2000ms면 READ_RATE(분당 30회) 경계에 딱 붙어 윈도우 지터로 429가 튀니 분당 24회로 낮춰요. */
const FALLBACK_POLL_INTERVAL_MS = 2500;

export default function PlayerLiveTab({
  guildId,
  compact = false,
}: {
  guildId: string;
  compact?: boolean;
}) {
  return <LivePlayerSession key={guildId} guildId={guildId} compact={compact} />;
}

function LivePlayerSession({ guildId, compact }: { guildId: string; compact: boolean }) {
  const [mode, setMode] = useState<"stream" | "polling">("stream");
  const [liveData, setLiveData] = useState<LivePayload | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectGraceOver, setConnectGraceOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setConnectGraceOver(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  const [receivedAt, setReceivedAt] = useState<number>(Date.now());

  // 폴링 폴백 + 초기 데이터 — 항상 구독해 키/훅 순서를 유지해요 (stream 모드에선 0초 폴링).
  const {
    data: swrData,
    error,
    isLoading,
    mutate,
  } = useGuildResource<LivePayload>(guildId, "/live", {
    fetcher: liveFetcher,
    refreshInterval: mode === "polling" ? FALLBACK_POLL_INTERVAL_MS : 0,
  });

  useEffect(() => {
    if (swrData) setReceivedAt(Date.now());
  }, [swrData]);

  useEffect(() => {
    if (mode !== "stream" || !guildId) return;

    const source = new EventSource(`/api/servers/${guildId}/live/stream`);
    let gotData = false;
    let closed = false;

    source.addEventListener("state", (e) => {
      if (closed) return;
      try {
        const payload = JSON.parse((e as MessageEvent).data) as LivePayload;
        gotData = true;
        setReceivedAt(Date.now());
        setLiveData(payload);
        setConnected(true);
      } catch {
      }
    });
    source.onerror = () => {
      if (closed) return;
      const closedState = typeof EventSource.CLOSED === "number" ? EventSource.CLOSED : 2;
      if (!gotData || source.readyState === closedState) {
        setMode("polling");
      } else {
        setConnected(false);
      }
    };

    return () => { closed = true; source.close(); };
  }, [mode, guildId]);

  const data = mode === "stream" ? liveData ?? swrData : swrData;

  const [, tickState] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tickState((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (error && (mode === "polling" || !liveData)) {
    const apiError = toError(error, "라이브 상태를 불러오지 못했어요.");
    return <LivePanel compact={compact}><PanelError error={apiError} onRetry={() => { void mutate(); }} /></LivePanel>;
  }
  if (mode === "polling" && isLoading) return <LiveLoading compact={compact} />;
  if (!data) return <LiveLoading compact={compact} />;
  if (!data.player) {
    return (
      <LiveEmpty
        compact={compact}
        detail={
          data.hub.subscribed
            ? undefined
            : "상태 허브가 Redis에 연결되지 않았어요. 관리자에게 문의해 주세요."
        }
      />
    );
  }

  return (
    <LivePanel compact={compact}>
      {(data.player.stale || (mode === "stream" && !connected && (connectGraceOver || liveData !== null))) && (
        <p role="status" className="rounded-control bg-warning/5 px-4 py-3 text-sm text-warning">
          마지막으로 확인한 재생 정보예요. 연결을 확인하는 동안 재생 제어는 사용할 수 없어요.
        </p>
      )}
      <NowPlaying
        state={data.player}
        receivedAt={receivedAt}
        connected={connected}
        mode={mode}
        guildId={guildId}
      />
      <LyricsPanel
        state={data.player}
        receivedAt={receivedAt}
        guildId={guildId}
        unavailable={data.player.stale || (mode === "stream" && !connected)}
      />
      <QueueList
        state={data.player}
        guildId={guildId}
        unavailable={data.player.stale || (mode === "stream" && !connected)}
      />
      {!compact && (
        <p className="text-xs text-muted-foreground">
          컨트롤러 명령은 봇이 음성 채널 접속 중일 때만 적용돼요. 검색·재생 ·
          기록은{" "}
          <Link
            href={`/player/${guildId}`}
            className="font-semibold text-primary-text hover:underline"
          >
            음악 플레이어 페이지
          </Link>
          에서 할 수 있어요.
        </p>
      )}
    </LivePanel>
  );
}
