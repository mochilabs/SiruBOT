export function StatusBadge({ status }: { status: string }) {
  status = status.toUpperCase();

  const config: Record<string, { color: string; bg: string; dot: string }> = {
    READY: {
      color: "text-[var(--color-success)]",
      bg: "bg-[var(--color-success)]/10 border-[var(--color-success)]/20",
      dot: "bg-[var(--color-success)]",
    },
    IDLE: {
      color: "text-[var(--color-warning)]",
      bg: "bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20",
      dot: "bg-[var(--color-warning)]",
    },
    CONNECTING: {
      color: "text-[var(--color-info)]",
      bg: "bg-[var(--color-info)]/10 border-[var(--color-info)]/20",
      dot: "bg-[var(--color-info)]",
    },
    DEAD: {
      color: "text-[var(--color-error)]",
      bg: "bg-[var(--color-error)]/10 border-[var(--color-error)]/20",
      dot: "bg-[var(--color-error)]",
    },
  };

  const c = config[status] ?? config.DEAD;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.color}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${c.dot} ${status === "READY" ? "animate-pulse" : ""}`}
      />
      {status}
    </span>
  );
}
