"use client";

import NextImage from "next/image";
import { Plus, Music, Globe } from "lucide-react";

export function DiscordServerSidebar() {
	return (
		<div className="w-[72px] flex flex-col items-center py-3 gap-2 shrink-0">
			<div className="w-12 h-12 bg-[#313338] rounded-2xl flex items-center justify-center text-green-500 hover:rounded-xl transition-all cursor-pointer group">
				<Plus size={24} />
			</div>
			<div className="w-8 h-0.5 bg-white/10 rounded-full" />
			<div className="w-12 h-12 bg-[#5865F2] rounded-xl flex items-center justify-center text-white cursor-pointer group animate-pulse">
				<Music size={28} />
			</div>
			{[1, 2, 3].map(i => (
				<div key={i} className="w-12 h-12 bg-[#313338] rounded-3xl flex items-center justify-center hover:rounded-xl transition-all cursor-pointer overflow-hidden border border-white/5">
					<NextImage src={`https://api.dicebear.com/7.x/identicon/svg?seed=${i}`} alt="server" width={48} height={48} />
				</div>
			))}
			<div className="mt-auto w-12 h-12 bg-[#313338] rounded-3xl flex items-center justify-center text-green-500 hover:rounded-xl transition-all cursor-pointer">
				<Globe size={24} />
			</div>
		</div>
	);
}
