"use client";

import Image from "next/image";
import { ExternalLink, Play, Settings2, ShieldCheck, UserPlus } from "lucide-react";

/* ─────────────────────────── types ─────────────────────────── */

export interface GuildInfo {
	id: string;
	name: string;
	icon?: string | null;
	memberCount?: number;
	isInstalled: boolean;
	isManageable?: boolean;
}

interface GuildSelectorProps {
	guilds: GuildInfo[];
	onManage?: (guildId: string) => void;
	onController?: (guildId: string) => void;
	inviteUrl?: string;
	view?: "grid" | "list";
	className?: string;
}

/* ─────────────────────────── guild card ─────────────────────────── */

function GuildItem({
	guild,
	onManage,
	onController,
	inviteUrl,
	view,
}: {
	guild: GuildInfo;
	onManage?: (id: string) => void;
	onController?: (id: string) => void;
	inviteUrl?: string;
	view: "grid" | "list";
}) {
	const iconUrl = guild.icon
		? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=128`
		: null;

	const isGrid = view === "grid";

	return (
		<div
			className={`glass-panel group transition-all duration-300 hover:border-primary/40 hover:translate-y-[-4px] ${isGrid ? "flex flex-col p-6" : "flex items-center gap-4 p-4"}`}
		>
			{/* Avatar */}
			<div className={`shrink-0 ${isGrid ? "mb-4" : ""}`}>
				{iconUrl ? (
					<Image
						src={iconUrl}
						alt={guild.name}
						width={isGrid ? 56 : 40}
						height={isGrid ? 56 : 40}
						className="rounded-full ring-4 ring-primary/10"
					/>
				) : (
					<div
						className={`flex items-center justify-center rounded-full glass-overlay font-black text-foreground group-hover:border-primary/40 transition-colors ${isGrid ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm"}`}
					>
						{guild.name.charAt(0)}
					</div>
				)}
			</div>

			{/* Info */}
			<div className={`${isGrid ? "" : "flex-1"} min-w-0`}>
				<h3 className="line-clamp-1 font-black tracking-tight text-foreground text-base">
					{guild.name}
				</h3>
				<div className="flex items-center gap-1 mt-0.5">
					{guild.isInstalled ? (
						<div className="flex items-center gap-1 text-xs font-bold text-primary/80 uppercase tracking-widest">
							<ShieldCheck size={12} />
							<span>시루봇 활성</span>
						</div>
					) : (
						<span className="text-xs font-bold text-muted-foreground/30 uppercase tracking-widest">
							미설치
						</span>
					)}
					{guild.memberCount !== undefined && (
						<span className="text-xs font-bold text-muted-foreground/30 ml-2">
							{guild.memberCount.toLocaleString()}명
						</span>
					)}
				</div>
			</div>

			{/* Actions */}
			<div className={`${isGrid ? "mt-auto pt-4" : "shrink-0"} flex gap-2`}>
				{guild.isInstalled ? (
					guild.isManageable ? (
						<>
							<button
								type="button"
								onClick={() => onManage?.(guild.id)}
								className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 py-2.5 text-xs font-bold text-primary hover:bg-primary hover:text-white transition-all duration-300 cursor-pointer"
							>
								<Settings2 size={14} />
								관리
							</button>
							<button
								type="button"
								onClick={() => onController?.(guild.id)}
								className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 py-2.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all duration-300 cursor-pointer"
							>
								<Play size={14} />
								플레이어
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={() => onController?.(guild.id)}
							className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 py-2.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all duration-300 cursor-pointer"
						>
							<Play size={14} />
							컨트롤러
						</button>
					)
				) : (
					<a
						href={inviteUrl ?? "#"}
						target="_blank"
						rel="noopener noreferrer"
						className="flex-1 flex items-center justify-center gap-1.5 rounded-xl glass-overlay py-2.5 text-xs font-bold text-foreground hover:bg-foreground/5 transition-all duration-300 cursor-pointer"
					>
						<UserPlus size={14} />
						초대
						<ExternalLink size={10} className="opacity-40" />
					</a>
				)}
			</div>
		</div>
	);
}

/* ─────────────────────────── main component ─────────────────────────── */

export function GuildSelector({
	guilds,
	onManage,
	onController,
	inviteUrl,
	view = "grid",
	className = "",
}: GuildSelectorProps) {
	return (
		<div
			className={`
				${view === "grid"
					? "grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
					: "flex flex-col gap-3"
				}
				${className}
			`}
		>
			{guilds.map((guild) => (
				<GuildItem
					key={guild.id}
					guild={guild}
					onManage={onManage}
					onController={onController}
					inviteUrl={inviteUrl}
					view={view}
				/>
			))}
		</div>
	);
}
