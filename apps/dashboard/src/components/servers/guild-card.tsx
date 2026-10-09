"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Play,Settings2, ShieldCheck, UserPlus } from "lucide-react";

import { Card } from "@/components/primitives/card";

import type { GuildCardProps } from "./guild-card.types";

export function GuildCard({ guild, inviteUrl }: GuildCardProps) {
	const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null;

	return (
		<Card padding="lg" className="group gap-6 transition-colors duration-base hover:border-primary/40">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					{iconUrl ? (
						<Image src={iconUrl} alt={`${guild.name} icon`} width={56} height={56} className="rounded-full ring-4 ring-primary/10" />
					) : (
						<div className="flex h-[56px] w-[56px] items-center justify-center rounded-full border border-border bg-surface-2 text-lg font-black text-foreground transition-colors group-hover:border-primary/40">
							{guild.name.charAt(0)}
						</div>
					)}
					<div>
						<h3 className="line-clamp-1 text-lg font-black tracking-tight text-foreground">{guild.name}</h3>
						<div className="flex items-center gap-1 mt-0.5">
							{guild.isInstalled ? (
								<div className="flex items-center gap-1 text-xs font-bold text-primary-text uppercase tracking-widest">
									<ShieldCheck size={10} />
									<span>이미 시루봇이 있어요</span>
								</div>
							) : (
								<span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">아직 시루봇이 없어요</span>
							)}
						</div>
					</div>
				</div>
			</div>

			{guild.isInstalled ? (
				guild.isManageable ? (
					<div className="flex w-full gap-2 mt-auto">
						<Link
							href={`/servers/${guild.id}`}
							className="flex items-center w-full justify-center gap-2 rounded-control border border-primary/20 bg-primary/10 py-3.5 text-sm font-bold text-primary-text hover:bg-primary hover:text-primary-foreground transition-colors duration-base"
						>
							<Settings2 size={18} />
							관리하기
						</Link>
						<Link
							href={`/player/${guild.id}`}
							className="flex items-center w-full justify-center gap-2 rounded-control border border-success/25 bg-success/10 py-3.5 text-sm font-bold text-success hover:bg-success hover:text-foreground transition-colors duration-base"
						>
							<Play size={18} />
							컨트롤러
						</Link>
					</div>
				) : (
					<Link
						href={`/player/${guild.id}`}
						className="mt-auto flex items-center justify-center gap-2 rounded-control border border-success/25 bg-success/10 py-3.5 text-sm font-bold text-success hover:bg-success hover:text-foreground transition-colors duration-base"
					>
						<Play size={18} />
						음악 컨트롤러
					</Link>
				)
			) : (
				<a
					href={inviteUrl || "#"}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-auto flex items-center justify-center gap-2 rounded-control border border-border bg-surface-2 py-3.5 text-sm font-bold text-foreground hover:bg-surface-3 hover:border-border-strong transition-colors duration-base"
				>
					<UserPlus size={18} />
					초대하기
					<ExternalLink size={14} className="opacity-40" />
				</a>
			)}
		</Card>
	);
}
