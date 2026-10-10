"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Play,Settings2, ShieldCheck, UserPlus } from "lucide-react";

import { Card } from "@/components/primitives/card";

import type { GuildCardProps } from "./guild-card.types";

/**
 * PC(md 이상)는 그리드 카드, 모바일은 한 행 리스트 — 같은 마크업을 반응형 클래스만으로
 * 바꿔요. 모바일에서 진입 동작은 44px(pointer-coarse:min-h-11) 터치 영역을 가져요.
 */
export function GuildCard({ guild, inviteUrl }: GuildCardProps) {
	const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null;

	return (
		<Card padding="none" className="group flex-row items-center gap-3 p-4 transition-colors duration-base hover:border-primary/40 md:flex-col md:items-stretch md:gap-6 md:p-6">
			<div className="flex min-w-0 flex-1 items-center gap-3 md:w-full md:flex-none md:gap-4">
				{iconUrl ? (
					<Image src={iconUrl} alt={`${guild.name} icon`} width={56} height={56} className="h-10 w-10 shrink-0 rounded-full ring-4 ring-primary/10 md:h-14 md:w-14" />
				) : (
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-base font-black text-foreground transition-colors group-hover:border-primary/40 md:h-14 md:w-14 md:text-lg">
						{guild.name.charAt(0)}
					</div>
				)}
				<div className="min-w-0">
					{/* 모바일은 서버 아이콘+이름만 — 설치 표시(아이콘 포함)는 md 이상에서만 */}
					<h3 className="line-clamp-1 text-base font-black tracking-tight text-foreground md:text-lg">{guild.name}</h3>
					<div className="mt-0.5 hidden items-center gap-1 md:flex">
						{guild.isInstalled ? (
							<div className="flex items-center gap-1 text-xs font-bold text-primary-text">
								<ShieldCheck size={10} />
								<span>이미 시루봇이 있어요</span>
							</div>
						) : (
							<span className="text-xs font-bold text-muted-foreground">아직 시루봇이 없어요</span>
						)}
					</div>
				</div>
			</div>

			{guild.isInstalled ? (
				guild.isManageable ? (
					<div className="flex shrink-0 items-center gap-2 md:mt-auto md:w-full">
						<Link
							href={`/servers/${guild.id}`}
							aria-label="관리하기"
							className="flex h-11 w-11 items-center justify-center rounded-control border border-primary/20 bg-primary/10 text-primary-text transition-colors duration-base hover:bg-primary-control hover:text-primary-foreground md:w-auto md:flex-1 md:px-3.5 md:py-3.5"
						>
							<Settings2 size={18} />
							<span className="hidden text-sm font-bold md:inline">관리하기</span>
						</Link>
						<Link
							href={`/player/${guild.id}`}
							aria-label="음악 컨트롤러"
							className="flex h-11 w-11 items-center justify-center rounded-control border border-success/25 bg-success/10 text-success transition-colors duration-base hover:bg-success hover:text-foreground md:h-auto md:w-auto md:flex-1 md:px-4 md:py-3.5"
						>
							<Play size={18} />
							<span className="hidden md:inline">컨트롤러</span>
						</Link>
					</div>
				) : (
					<Link
						href={`/player/${guild.id}`}
						aria-label="음악 컨트롤러"
						className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-success/25 bg-success/10 text-success transition-colors duration-base hover:bg-success hover:text-foreground md:w-full md:gap-2 md:px-3.5 md:py-3.5"
					>
						<Play size={18} />
						<span className="hidden md:inline">음악 컨트롤러</span>
					</Link>
				)
			) : inviteUrl ? (
				<a
					href={inviteUrl}
					target="_blank"
					rel="noopener noreferrer"
					aria-label="시루봇 초대하기"
					className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border bg-surface-2 text-foreground transition-colors duration-base hover:bg-surface-3 hover:border-border-strong md:w-full md:gap-2 md:px-3.5 md:py-3.5"
				>
					<UserPlus size={18} />
					<span className="hidden text-sm font-bold md:inline">초대하기</span>
					<ExternalLink size={14} className="hidden opacity-40 md:inline" />
				</a>
			) : (
				// 초대 링크를 만들 수 없는 서버(R-26) — "#" 데드 링크 대신 비활성 표시
				<button
					type="button"
					disabled
					title="초대 링크가 없어요"
					aria-label="초대 링크가 없어요"
					className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border bg-surface-2 text-muted-foreground cursor-not-allowed md:w-full"
				>
					<UserPlus size={18} />
					<span className="hidden text-sm font-bold md:inline">초대 링크가 없어요</span>
				</button>
			)}
		</Card>
	);
}
