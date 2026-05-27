"use client";

import { useCallback } from "react";
import { AlertTriangle, Shield } from "lucide-react";

import { Switch } from "@/components/primitives/switch";

/* ─────────────────────────── types ─────────────────────────── */

export interface Permission {
	flag: number;
	name: string;
	description: string;
	dangerous?: boolean;
}

export interface PermissionCategory {
	label: string;
	permissions: Permission[];
}

interface PermissionListProps {
	categories: PermissionCategory[];
	value: number;
	onChange: (value: number) => void;
	disabled?: boolean;
	className?: string;
}

/* ─────────────────────────── default permission data ─────────────────────────── */

export const DISCORD_PERMISSIONS: PermissionCategory[] = [
	{
		label: "일반",
		permissions: [
			{ flag: 1 << 0, name: "역할 조회", description: "채널과 역할을 볼 수 있어요" },
			{ flag: 1 << 6, name: "닉네임 변경", description: "서버 닉네임을 변경할 수 있어요" },
			{ flag: 1 << 7, name: "닉네임 관리", description: "다른 멤버의 닉네임을 변경할 수 있어요" },
			{ flag: 1 << 10, name: "서버 인사이트 보기", description: "서버 통계를 확인할 수 있어요" },
		],
	},
	{
		label: "텍스트",
		permissions: [
			{ flag: 1 << 11, name: "메시지 보내기", description: "채널에 메시지를 전송할 수 있어요" },
			{ flag: 1 << 14, name: "파일 첨부", description: "파일을 첨부할 수 있어요" },
			{ flag: 1 << 15, name: "메시지 기록 읽기", description: "이전 메시지를 열람할 수 있어요" },
			{ flag: 1 << 16, name: "전체 멘션", description: "@everyone, @here를 사용할 수 있어요" },
			{ flag: 1 << 13, name: "메시지 관리", description: "다른 사람의 메시지를 삭제/고정할 수 있어요" },
		],
	},
	{
		label: "음성",
		permissions: [
			{ flag: 1 << 20, name: "음성 연결", description: "음성 채널에 연결할 수 있어요" },
			{ flag: 1 << 21, name: "음성 말하기", description: "음성 채널에서 말할 수 있어요" },
			{ flag: 1 << 22, name: "음성 음소거", description: "다른 멤버를 음소거할 수 있어요" },
			{ flag: 1 << 23, name: "음성 강제 퇴장", description: "다른 멤버를 음성 채널에서 내보낼 수 있어요" },
		],
	},
	{
		label: "관리",
		permissions: [
			{ flag: 1 << 3, name: "관리자", description: "모든 권한을 부여해요. 매우 위험한 권한이에요.", dangerous: true },
			{ flag: 1 << 2, name: "멤버 추방", description: "서버에서 멤버를 추방할 수 있어요", dangerous: true },
			{ flag: 1 << 1, name: "멤버 차단", description: "서버에서 멤버를 차단할 수 있어요", dangerous: true },
			{ flag: 1 << 4, name: "채널 관리", description: "채널을 생성, 수정, 삭제할 수 있어요", dangerous: true },
			{ flag: 1 << 5, name: "서버 관리", description: "서버 설정을 변경할 수 있어요", dangerous: true },
			{ flag: 1 << 28, name: "역할 관리", description: "역할을 생성, 수정, 삭제할 수 있어요", dangerous: true },
		],
	},
];

/* ─────────────────────────── component ─────────────────────────── */

export function PermissionList({
	categories,
	value,
	onChange,
	disabled = false,
	className = "",
}: PermissionListProps) {
	const hasPermission = useCallback(
		(flag: number) => (value & flag) === flag,
		[value],
	);

	const togglePermission = useCallback(
		(flag: number) => {
			if (hasPermission(flag)) {
				onChange(value & ~flag);
			} else {
				onChange(value | flag);
			}
		},
		[value, onChange, hasPermission],
	);

	const allInCategory = useCallback(
		(perms: Permission[]) => perms.every((p) => hasPermission(p.flag)),
		[hasPermission],
	);

	const toggleCategory = useCallback(
		(perms: Permission[]) => {
			const allOn = allInCategory(perms);
			let next = value;
			for (const p of perms) {
				if (allOn) {
					next = next & ~p.flag;
				} else {
					next = next | p.flag;
				}
			}
			onChange(next);
		},
		[value, onChange, allInCategory],
	);

	return (
		<div className={`space-y-6 ${className}`}>
			{categories.map((cat) => (
				<div key={cat.label} className="glass-panel overflow-hidden">
					{/* Category header */}
					<div className="flex items-center justify-between px-5 py-3 bg-card/50 border-b border-border/40">
						<div className="flex items-center gap-2">
							<Shield className="h-4 w-4 text-muted-foreground" />
							<span className="text-xs font-black uppercase tracking-widest text-muted-foreground/60">
								{cat.label}
							</span>
						</div>
						<button
							type="button"
							disabled={disabled}
							onClick={() => toggleCategory(cat.permissions)}
							className="text-xs font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer disabled:opacity-50"
						>
							{allInCategory(cat.permissions) ? "모두 거부" : "모두 허용"}
						</button>
					</div>

					{/* Permission items */}
					<div className="divide-y divide-border/20">
						{cat.permissions.map((perm) => {
							const isOn = hasPermission(perm.flag);

							return (
								<div
									key={perm.name}
									className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/20 transition-colors"
								>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className={`text-sm font-bold ${perm.dangerous ? "text-red-500" : "text-foreground"}`}>
												{perm.name}
											</span>
											{perm.dangerous && (
												<AlertTriangle className="h-3.5 w-3.5 text-red-500/60" />
											)}
										</div>
										<p className="text-xs text-muted-foreground/60 mt-0.5 font-medium">
											{perm.description}
										</p>
									</div>

									<Switch
										checked={isOn}
										onChange={() => togglePermission(perm.flag)}
										disabled={disabled}
										size="sm"
									/>
								</div>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}
