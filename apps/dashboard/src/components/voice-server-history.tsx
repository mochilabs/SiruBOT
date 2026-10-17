"use client";

import { useState } from "react";
import { Cpu, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, type TooltipContentProps, XAxis, YAxis } from "recharts";
import useSWR from "swr";

import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VoiceServerHistoryPoint } from "@/lib/voice-server-stats";

/** 조회 기간 (hours 쿼리 파라미터, 1~168) */
const RANGE_OPTIONS = [
	{ value: "6", label: "6시간" },
	{ value: "24", label: "24시간" },
	{ value: "48", label: "48시간" },
	{ value: "168", label: "7일" },
];

interface ChartPoint {
	time: string;
	players: number;
	playing: number;
	system: number;
	lavalink: number;
}

interface SeriesConfig {
	key: keyof ChartPoint;
	name: string;
	color: string;
	format: (value: number) => string;
}

const PLAYER_SERIES: SeriesConfig[] = [
	{ key: "players", name: "총 플레이어", color: "var(--brand)", format: (value) => value.toLocaleString() },
	{ key: "playing", name: "재생 중", color: "var(--warning)", format: (value) => value.toLocaleString() },
];

const CPU_SERIES: SeriesConfig[] = [
	{ key: "system", name: "시스템 CPU (%)", color: "var(--warning)", format: (value) => `${value.toFixed(1)}%` },
	{ key: "lavalink", name: "Lavalink CPU (%)", color: "var(--brand)", format: (value) => `${value.toFixed(1)}%` },
];

/** 축 눈금·툴팁 라벨 — 수집 시각 문자열("YYYY-MM-DD HH:mm")을 원문 그대로 써요 (시간대 미검증이라 변환하지 않아요) */
function timeLabel(time: string): string {
	return time.slice(11, 16);
}

function HistoryTooltip({ active, payload, label, series }: TooltipContentProps & { series: SeriesConfig[] }) {
	if (!active || !payload?.length) return null;
	return (
		<div className="rounded-menu border border-border bg-popover p-2.5 shadow-2xl">
			<p className="text-2xs font-medium text-muted-foreground">{String(label ?? "")}</p>
			{payload.map((entry, index) => {
				const name = String(entry.name ?? "");
				const config = series.find((item) => item.name === name);
				const value = typeof entry.value === "number" ? entry.value : Number(entry.value);
				return (
					<p key={`${name}-${index}`} className="flex items-center gap-1.5 text-2xs text-foreground">
						<span className="size-2 rounded-full" style={{ backgroundColor: config?.color ?? "var(--dot-neutral)" }} aria-hidden />
						{name}
						<span className="pl-2 font-bold tabular-nums">{config && Number.isFinite(value) ? config.format(value) : String(entry.value ?? "")}</span>
					</p>
				);
			})}
		</div>
	);
}

function ChartCard({
	title,
	icon: Icon,
	series,
	points,
	yTickFormat,
}: {
	title: string;
	icon: typeof TrendingUp;
	series: SeriesConfig[];
	points: ChartPoint[];
	yTickFormat: (value: number) => string;
}) {
	return (
		<Card padding="md" className="gap-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary-text">
						<Icon size={19} aria-hidden />
					</div>
					<h2 className="text-lg font-bold text-foreground">{title}</h2>
				</div>
				<div className="flex flex-wrap gap-x-4 gap-y-1">
					{series.map((item) => (
						<p key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
							{item.name}
						</p>
					))}
				</div>
			</div>
			<ResponsiveContainer width="100%" height={220}>
				<AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
					<CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
					<XAxis
						dataKey="time"
						tickFormatter={timeLabel}
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickLine={false}
						axisLine={{ stroke: "var(--border-subtle)" }}
						minTickGap={24}
					/>
					<YAxis
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickFormatter={(value: number) => yTickFormat(value)}
						tickLine={false}
						axisLine={false}
						width={40}
						domain={[0, "auto"]}
					/>
					<Tooltip content={(tooltipProps) => <HistoryTooltip {...tooltipProps} series={series} />} cursor={{ stroke: "var(--border-strong)" }} />
					{series.map((item) => (
						<Area key={item.key} type="monotone" dataKey={item.key} name={item.name} stroke={item.color} fill={item.color} fillOpacity={0.12} strokeWidth={2} />
					))}
				</AreaChart>
			</ResponsiveContainer>
		</Card>
	);
}

/** 음성 서버 추이 — 플레이어 수와 CPU 사용률을 기간별로 보여줘요. 기간 셀렉터가 두 차트를 함께 제어요. */
export function VoiceServerHistory() {
	const [hours, setHours] = useState(24);
	const { data } = useSWR<VoiceServerHistoryPoint[]>(`/api/voice-servers/history?hours=${hours}`, {
		refreshInterval: 60000,
		dedupingInterval: 10000,
	});

	// 연동 실패·데이터 없음 때는 섹션 자체를 숨겨요 (VoiceServerSection과 같은 처리)
	if (!data || data.length === 0) return null;

	const points: ChartPoint[] = data.map((point) => ({
		time: point.time,
		players: point.players,
		playing: point.playingPlayers,
		system: point.cpuSystemLoad * 100,
		lavalink: point.cpuLavalinkLoad * 100,
	}));

	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-lg font-bold text-foreground">변화 추이</h2>
				<Select
					value={String(hours)}
					onValueChange={(value: string | null) => {
						if (!RANGE_OPTIONS.some((option) => option.value === value)) return;
						setHours(Number(value));
					}}
				>
					<SelectTrigger size="sm" aria-label="조회 기간">
						<SelectValue>{(value: string) => RANGE_OPTIONS.find((option) => option.value === value)?.label ?? value}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{RANGE_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<ChartCard title="플레이어 수 추이" icon={TrendingUp} series={PLAYER_SERIES} points={points} yTickFormat={(value) => value.toLocaleString()} />
				<ChartCard title="CPU 사용률" icon={Cpu} series={CPU_SERIES} points={points} yTickFormat={(value) => `${value}%`} />
			</div>
		</section>
	);
}
