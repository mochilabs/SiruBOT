"use client";

import NextImage from "next/image";
import { Plus, Hash, Settings } from "lucide-react";

export function DiscordChannelSidebar() {
	return (
		<div className="w-60 bg-[#2B2D31] flex flex-col shrink-0">
			<div className="h-12 px-4 flex items-center shadow-sm font-bold text-white border-b border-black/10">
				시루봇 공식 서버
			</div>
			<div className="flex-1 py-4 overflow-y-auto px-2 space-y-4">
				<div className="space-y-1">
					<div className="px-2 text-[12px] font-bold text-[#949BA4] uppercase tracking-wide flex justify-between items-center group">
						채팅 채널 <Plus size={14} className="cursor-pointer" />
					</div>
					<div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5 text-white cursor-pointer">
						<Hash size={20} className="text-[#949BA4]" />
						<span className="font-medium">음악-채널</span>
					</div>
					<div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-white/5 text-[#949BA4] hover:text-[#DBDEE1] cursor-pointer transition-colors">
						<Hash size={20} />
						<span className="font-medium">일반</span>
					</div>
				</div>
			</div>
			{/* User Status */}
			<div className="h-14 bg-[#232428] px-2 flex items-center gap-2">
				<div className="relative">
					<div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
						<NextImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=Lucky" alt="user" width={32} height={32} />
					</div>
					<div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#232428]" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="text-sm font-bold text-white truncate">당면</div>
					<div className="text-[12px] text-[#949BA4] truncate">Online</div>
				</div>
				<div className="flex items-center gap-1 text-[#949BA4]">
					<Settings size={18} className="cursor-pointer hover:text-white" />
				</div>
			</div>
		</div>
	);
}
