"use client";

import NextImage from "next/image";
import { Music } from "lucide-react";

export function DiscordMemberList() {
	return (
		<div className="w-60 bg-[#2B2D31] hidden xl:flex flex-col shrink-0">
			<div className="h-12 px-4 flex items-center border-b border-black/10 shadow-sm" />
			<div className="flex-1 p-3 space-y-4">
				<div>
					<div className="px-2 pb-1 text-[12px] font-bold text-[#949BA4] tracking-wider uppercase">온라인 — 2</div>
					<div className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer group">
						<div className="relative">
							<div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
								<Music size={20} className="text-white" />
							</div>
							<div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#2B2D31]" />
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-1.5">
								<span className="font-bold text-white truncate">시루봇</span>
								<span className="bg-[#5865F2] text-[10px] px-1 rounded-sm text-white font-bold">BOT</span>
							</div>
							<div className="text-[11px] text-[#949BA4] truncate">Listening to Gurenge</div>
						</div>
					</div>
					<div className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
						<div className="relative">
							<div className="w-8 h-8 rounded-full bg-gray-600 overflow-hidden">
								<NextImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=Lucky" alt="user" width={32} height={32} />
							</div>
							<div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#2B2D31]" />
						</div>
						<div className="font-bold text-white truncate">당면</div>
					</div>
				</div>
			</div>
		</div>
	);
}
