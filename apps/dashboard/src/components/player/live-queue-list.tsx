import { ListMusic } from "lucide-react";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import { EmptyState } from "@/components/primitives/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";

export function QueueList({ state }: { state: LivePlayerState }) {
  return (
    <Card padding="lg" className="gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">대기열</h3>
        <Badge variant="primary" size="sm">
          {state.queueLength}곡 대기
        </Badge>
      </div>

      {state.queue.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          size="sm"
          title="대기열이 비어 있어요"
          description="Discord에서 곡을 신청하면 여기에 표시돼요."
        />
      ) : (
        <ol className="space-y-2">
          {state.queue.map((track, index) => (
            <li
              key={`${track.title}-${index}`}
              className="animate-page-in flex items-center gap-3 rounded-card bg-surface-2 px-3 py-2 opacity-0"
              style={{
                animationDelay: `${Math.min(index, 9) * 40}ms`,
                animationFillMode: "forwards",
              }}
            >
              <span className="w-5 shrink-0 text-center text-sm font-black tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {track.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {track.author}
                  {track.requesterName ? ` · 신청: ${track.requesterName}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {track.isStream ? "스트림" : formatDuration(track.durationMs)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
