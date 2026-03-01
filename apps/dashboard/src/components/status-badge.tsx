export function StatusBadge({ status }: { status: string }) {
	status = status.toUpperCase();
	const config: Record<string, { color: string; bg: string; dot: string }> = {
		READY: { color: 'text-green-700', bg: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
		IDLE: { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
		CONNECTING: { color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
		DEAD: { color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
	};

	const c = config[status] ?? config.DEAD;

	return (
		<span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.color}`}>
			<span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
			{status}
		</span>
	);
}
