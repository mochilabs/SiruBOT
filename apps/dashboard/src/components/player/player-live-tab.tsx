"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import useSWR from "swr";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import { EmptyState } from "@/components/primitives/empty-state";
import { PanelError } from "@/components/servers/settings-shared";
import { Card } from "@/components/ui/card";
import { SkeletonLine } from "@/components/ui/skeleton";
import { toApiError, toError } from "@/lib/api-error";

import { QueueList } from "./live-queue-list";
import { NowPlaying } from "./now-playing-card";

function LiveLoading() {
  return (
    <Card padding="lg" className="gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Radio size={14} /> 라이브 상태 불러오는 중…
      </div>
      <div className="space-y-2">
        <SkeletonLine width="65%" height="h-5" />
        <SkeletonLine width="40%" height="h-4" />
        <SkeletonLine width="100%" height="h-2" />
      </div>
    </Card>
  );
}

/** 데이터가 없는 상태 — 길드에 플레이어가 없거나 playerHub 미구독 */
function LiveEmpty({ detail }: { detail?: string }) {
  return (
    <Card padding="lg">
      <EmptyState
        icon={Radio}
        title="지금은 재생 정보가 없어요"
        description={
          detail ??
          "봇이 이 서버에서 음악을 재생하면 여기에 실시간 상태가 표시돼요."
        }
      />
    </Card>
  );
}

interface LivePayload {
  player: LivePlayerState | null;
  hub: { guilds: number; subscribed: boolean; staleMs: number };
}

async function liveFetcher(url: string): Promise<LivePayload> {
  const response = await fetch(url);
  if (!response.ok) throw await toApiError(response, "라이브 상태를 불러오지 못했어요.");
  return response.json();
}

/** 폴백 폴링 주기 — 2000ms면 READ_RATE(분당 30회) 경계에 딱 붙어 윈도우 지터로 429가 튀니 분당 24회로 낮춰요. */
const FALLBACK_POLL_INTERVAL_MS = 2500;

export default function PlayerLiveTab({ guildId }: { guildId: string }) {
  return <LivePlayerSession key={guildId} guildId={guildId} />;
}

function LivePlayerSession({ guildId }: { guildId: string }) {
  /** SSE 실패(미지원/장애) 시 폴백하는 폴링 모드와 상태를 구분해요. */
  const [mode, setMode] = useState<"stream" | "polling">("stream");
  const [liveData, setLiveData] = useState<LivePayload | null>(null);
  const [connected, setConnected] = useState(false);
  /** 마지막 상태 수신 시각 — 스냅샷 이후 경과를 보간하는 기준 */
  const [receivedAt, setReceivedAt] = useState<number>(Date.now());

  // 폴링 폴백 + 초기 데이터 — 항상 구독해 키/훅 순서를 유지해요 (stream 모드에선 0초 폴링).
  const {
    data: swrData,
    error,
    isLoading,
    mutate,
  } = useSWR<LivePayload>(`/api/servers/${guildId}/live`, liveFetcher, {
    refreshInterval: mode === "polling" ? FALLBACK_POLL_INTERVAL_MS : 0,
  });

  // polling 모드의 snapshotAt도 receivedAt으로 통일 — swr 데이터가 바뀌면 수신 시각을 기록해요.
  useEffect(() => {
    if (swrData) setReceivedAt(Date.now());
  }, [swrData]);

  // 실시간 스트림 — data-api → dashboard 프록시를 거친 SSE를 구독해요.
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
        // 잘못된 프레임 — 무시하고 다음 스냅샷을 기다려요.
      }
    });
    source.onerror = () => {
      if (closed) return;
      // data를 한 번도 못 받은 error → 스트림 미지원(프록시 404 등)으로 판단하고 폴링 폴백
      if (!gotData) {
        setMode("polling");
      } else {
        setConnected(false); // EventSource 내장 재연결에 맡긴다
      }
    };

    return () => { closed = true; source.close(); };
  }, [mode, guildId]);

  // 표시 데이터 — polling 모드에선 SWR 데이터를 사용해요.
  const data = mode === "stream" ? liveData ?? swrData : swrData;

  // 폴링 사이 progress 부드럽게 보간 (SSE 수신 사이 진행바 1초 보간)
  const [, tickState] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tickState((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (error && (mode === "polling" || !liveData)) {
    const apiError = toError(error, "라이브 상태를 불러오지 못했어요.");
    return <PanelError error={apiError} onRetry={() => { void mutate(); }} />;
  }
  if (mode === "polling" && isLoading) return <LiveLoading />;
  if (!data) return <LiveLoading />;
  if (!data.player) {
    return (
      <LiveEmpty
        detail={
          data.hub.subscribed
            ? undefined
            : "상태 허브가 Redis에 연결되지 않았어요. 관리자에게 문의해 주세요."
        }
      />
    );
  }

  return (
    <div className="grid gap-6">
      {(data.player.stale || (mode === "stream" && !connected)) && (
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
      <QueueList state={data.player} />
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
    </div>
  );
}
