import { formatDuration } from "@sirubot/utils/time";
import { ListMusic } from "lucide-react";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import { EmptyState } from "@/components/primitives/empty-state";
import { Badge } from "@/components/ui/badge";

export function QueueList({ state }: { state: LivePlayerState }) {
  const totalMs = state.queue.reduce((sum, track) => sum + (track.isStream ? 0 : track.durationMs), 0);
  const hiddenCount = Math.max(0, state.queueLength - state.queue.length);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">대기열</h3>
        <Badge variant="primary" size="sm">
          {state.queueLength}곡{totalMs > 0 ? ` · ${formatDuration(totalMs)}` : ""}
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
        <ol className="max-h-[26rem] space-y-2 overflow-y-auto scrollbar-none">
          {state.queue.map((track, index) => (
            <li
              key={`${track.title}-${index}`}
              className="animate-page-in flex items-center gap-3 rounded-card bg-surface-2 p-2.5 opacity-0"
              style={{
                animationDelay: `${Math.min(index, 9) * 40}ms`,
                animationFillMode: "forwards",
              }}
            >
              <span className="w-5 shrink-0 text-center text-sm font-black tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              {track.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={track.artworkUrl} alt="" className="h-11 w-11 shrink-0 rounded-control object-cover" />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-surface-1 text-muted-foreground">
                  <ListMusic size={16} aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  {/^https?:\/\//i.test(track.uri ?? "") ? (
                    <a
                      href={track.uri!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-semibold text-foreground hover:text-primary-text hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm transition-colors duration-fast"
                    >
                      {track.title}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-semibold text-foreground">
                      {track.title}
                    </p>
                  )}
                  {index === 0 && (
                    <Badge variant="primary" size="sm" className="shrink-0">
                      다음
                    </Badge>
                  )}
                </div>
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
          {hiddenCount > 0 && (
            <li className="px-3 py-2 text-center text-xs text-muted-foreground">외 {hiddenCount}곡이 더 대기 중이에요</li>
          )}
        </ol>
      )}
    </section>
  );
}
