"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Play,Settings2, ShieldCheck, UserPlus } from "lucide-react";

import type { GuildCardProps } from "./guild-card.types";

export function GuildCard({ guild, inviteUrl }: GuildCardProps) {
	const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null;

	return (
		<div className="glass-panel group flex flex-col p-6 transition-all duration-300 hover:border-primary/40 hover:translate-y-[-4px]">
			<div className="mb-6 flex items-center justify-between">
				<div className="flex items-center gap-4">
					{iconUrl ? (
						<Image src={iconUrl} alt={`${guild.name} icon`} width={56} height={56} className="rounded-full ring-4 ring-primary/10" />
					) : (
						<div className="flex h-[56px] w-[56px] items-center justify-center rounded-full glass-overlay text-lg font-black text-foreground group-hover:border-primary/40 transition-colors">
							{guild.name.charAt(0)}
						</div>
					)}
					<div>
						<h3 className="line-clamp-1 text-lg font-black tracking-tight text-foreground">{guild.name}</h3>
						<div className="flex items-center gap-1 mt-0.5">
							{guild.isInstalled ? (
								<div className="flex items-center gap-1 text-[10px] font-bold text-primary/80 uppercase tracking-widest">
									<ShieldCheck size={10} />
									<span>이미 시루봇이 있어요</span>
								</div>
							) : (
								<span className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-widest">아직 시루봇이 없어요</span>
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
							className="flex items-center w-full justify-center gap-2 rounded-xl bg-primary/10 border border-primary/20 py-3.5 text-sm font-bold text-primary hover:bg-primary hover:text-white transition-all duration-300 shadow-lg shadow-primary/5"
						>
							<Settings2 size={18} />
							관리하기
						</Link>
						<Link
							href={`/player/${guild.id}`}
							className="flex items-center w-full justify-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 py-3.5 text-sm font-bold text-green-400 hover:bg-green-500 hover:text-white transition-all duration-300 shadow-lg shadow-green-500/5"
						>
							<Play size={18} />
							컨트롤러
						</Link>
					</div>
				) : (
					<Link
						href={`/player/${guild.id}`}
						className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 py-3.5 text-sm font-bold text-green-400 hover:bg-green-500 hover:text-white transition-all duration-300 shadow-lg shadow-green-500/5"
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
					className="mt-auto flex items-center justify-center gap-2 rounded-xl glass-overlay py-3.5 text-sm font-bold text-foreground hover:bg-foreground/5 hover:border-foreground/20 transition-all duration-300 shadow-xl shadow-black/5"
				>
					<UserPlus size={18} />
					초대하기
					<ExternalLink size={14} className="opacity-40" />
				</a>
			)}
		</div>
	);
}
