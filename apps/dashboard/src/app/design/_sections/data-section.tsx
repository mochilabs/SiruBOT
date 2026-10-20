"use client";

import { useState } from "react";
import { Activity, Cpu, RadioTower, Server } from "lucide-react";

import { type Column, DataTable } from "@/components/data/data-table";
import { StatCard } from "@/components/data/stat-card";
import { TagInput } from "@/components/data/tag-input";
import { Badge } from "@/components/ui/badge";

import { SectionHeader, Showcase, ShowcaseRow } from "./shared";

interface TableRow {
	id: string;
	name: string;
	artist: string;
	plays: number;
	duration: string;
}

const tableColumns: Column<TableRow>[] = [
	{ key: "id", header: "#", width: "60px", align: "center" },
	{ key: "name", header: "트랙명", sortable: true },
	{ key: "artist", header: "아티스트", sortable: true },
	{
		key: "plays",
		header: "재생 수",
		sortable: true,
		align: "right",
		render: (r) => <span className="text-primary-text font-black tabular-nums">{r.plays.toLocaleString()}</span>,
	},
	{ key: "duration", header: "길이", align: "right" },
];

const tableData: TableRow[] = [
	{ id: "1", name: "Blinding Lights", artist: "The Weeknd", plays: 12840, duration: "3:22" },
	{ id: "2", name: "Dynamite", artist: "BTS", plays: 9521, duration: "3:19" },
	{ id: "3", name: "Levitating", artist: "Dua Lipa", plays: 8432, duration: "3:23" },
	{ id: "4", name: "Peaches", artist: "Justin Bieber", plays: 7214, duration: "3:18" },
	{ id: "5", name: "좋은 날", artist: "IU", plays: 6891, duration: "3:56" },
];

export function DataSection() {
	const [tags, setTags] = useState(["음악", "봇"]);

	return (
		<>
			<SectionHeader
				id="data"
				title="Data"
				description="데이터 표시와 입력 컴포넌트"
			/>
			<Showcase className="space-y-8">
				<ShowcaseRow label="DataTable" block>
					<DataTable columns={tableColumns} data={tableData} keyExtractor={(r) => r.id} />
				</ShowcaseRow>

				<ShowcaseRow label="TagInput" block>
					<div className="w-full max-w-md">
						<TagInput value={tags} onChange={setTags} placeholder="태그 입력 후 Enter" maxTags={8} />
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="StatCard" block>
					<div className="flex items-center gap-2 mb-4">
						<Badge size="sm">예시</Badge>
						<p className="text-xs font-medium text-muted-foreground">이 값들은 실제 측정이 아닌 컴포넌트 데모예요.</p>
					</div>
					<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
						<StatCard icon={Server} label="서버" value={1234} sub="전체 서버 수" trend="up" trendValue="+12%" />
						<StatCard icon={RadioTower} label="재생 중" value={89} sub="현재 재생" trend="down" trendValue="-3%" />
						<StatCard icon={Cpu} label="메모리" value="512MB" sub="사용 중" trend="neutral" trendValue="0%" />
						<StatCard icon={Activity} label="업타임" value="99.9%" sub="30일 평균" />
					</div>
				</ShowcaseRow>
			</Showcase>
		</>
	);
}
