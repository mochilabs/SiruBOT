import { Activity, Cpu, RadioTower, Server } from "lucide-react";

import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";

import { SectionHeader, Showcase, ShowcaseRow } from "./shared";

export function DataSection() {
	return (
		<>
			<SectionHeader
				id="data"
				title="Data"
				description="데이터 표시 컴포넌트"
			/>
			<Showcase className="space-y-8">
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
