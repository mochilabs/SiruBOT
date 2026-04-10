"use client";

import NextImage from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { 
	Hash, 
	Search, 
	Volume2, 
	Music, 
	Plus, 
	SkipBack, 
	Pause, 
	SkipForward, 
	Repeat, 
	Globe, 
	Gift, 
	Sticker, 
	Smile 
} from "lucide-react";
import type { DiscordStep } from "./discord-ui.types";

interface DiscordChatAreaProps {
	step: DiscordStep;
	displayText: string;
}

export function DiscordChatArea({ step, displayText }: DiscordChatAreaProps) {
	return (
		<div className="flex-1 bg-[#313338] flex flex-col relative">
			{/* Header */}
			<div className="h-12 px-4 flex items-center justify-between border-b border-black/10 shadow-sm shrink-0">
				<div className="flex items-center gap-2 font-bold text-white">
					<Hash size={24} className="text-[#949BA4]" />
					음악-채널
				</div>
				<div className="flex items-center gap-4 text-[#949BA4]">
					<Search size={20} />
					<div className="w-px h-6 bg-white/10" />
					<Volume2 size={24} />
				</div>
			</div>

			{/* Chat Messages */}
			<div className="flex-1 p-4 overflow-y-auto space-y-6 flex flex-col">
				<div className="mt-auto" /> {/* Push messages to bottom */}
				
				{/* Previous Messages Mock */}
				<div className="flex gap-4 group">
					<div className="w-10 h-10 rounded-full bg-blue-500 shrink-0" />
					<div>
						<div className="flex items-center gap-2">
							<span className="font-bold text-white hover:underline cursor-pointer">관리자</span>
							<span className="text-[12px] text-[#949BA4]">오늘 오전 10:30</span>
						</div>
						<div className="text-[#DBDEE1]">오늘도 즐거운 음악 감상 되세요!</div>
					</div>
				</div>

				{/* 1. User Command Animation */}
				<AnimatePresence>
					{step >= 2 && (
						<motion.div 
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							className="flex gap-4 group"
						>
							<div className="w-10 h-10 rounded-full bg-primary/20 shrink-0 overflow-hidden relative">
								<NextImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=Lucky" alt="user" width={40} height={40} />
							</div>
							<div>
								<div className="flex items-center gap-2">
									<span className="font-bold text-white hover:underline cursor-pointer">당면</span>
									<span className="text-[12px] text-[#949BA4]">오늘 오전 {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
								</div>
								<div className="flex items-center gap-1 text-primary-light font-medium py-0.5">
									<div className="px-1.5 py-0.5 bg-primary/10 rounded flex items-center gap-1 text-sm text-[#5865F2] font-bold">
										/재생
									</div>
									<span className="text-[#DBDEE1]">검색어: Gurenge (LiSA)</span>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* 2. Bot Thinking State */}
				<AnimatePresence>
					{step === 2 && (
						<motion.div 
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="flex gap-4"
						>
							<div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
								<Music size={24} className="text-white" />
							</div>
							<div className="flex flex-col gap-1">
								<div className="flex items-center gap-2">
									<span className="font-bold text-white">시루봇</span>
									<span className="bg-[#5865F2] text-[10px] px-1 rounded-sm text-white font-bold">BOT</span>
								</div>
								<div className="flex items-center gap-1 italic text-[#949BA4] text-sm animate-pulse">
									시루봇이 생각 중입니다...
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* 3. Bot Response (Embed) */}
				<AnimatePresence>
					{step === 3 && (
						<motion.div 
							initial={{ opacity: 0, x: -10 }}
							animate={{ opacity: 1, x: 0 }}
							className="flex gap-4"
						>
							<div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
								<Music size={24} className="text-white" />
							</div>
							<div className="flex flex-col gap-2 max-w-full">
								<div className="flex items-center gap-2">
									<span className="font-bold text-white">시루봇</span>
									<span className="bg-[#5865F2] text-[10px] px-1 rounded-sm text-white font-bold">BOT</span>
									<span className="text-[12px] text-[#949BA4]">방금 전</span>
								</div>

								{/* The Playback Card Container (Mimicking Discord Embed) */}
								<div className="bg-[#2B2D31] rounded-md border-l-4 border-[#5865F2] overflow-hidden max-w-[550px] shadow-xl flex flex-col">
									<div className="p-4 space-y-3">
										<div className="text-sm font-bold text-white flex items-center gap-2">
											🎶 노래를 곧 재생할게요!
										</div>
										
										<div className="flex gap-4">
											<div className="flex-1 space-y-2">
												<div className="space-y-0.5">
													<h3 className="text-[#00A8FC] font-bold text-[16px] hover:underline cursor-pointer leading-tight">
														Gurenge (紅蓮華) - LiSA
													</h3>
													<div className="text-[13px] text-[#949BA4]">
														-# 아티스트: LiSA | 요청자: 당면
													</div>
												</div>
												
												<div className="space-y-1 pt-1">
													<div className="h-1 bg-[#4E5058] rounded-full overflow-hidden">
														<motion.div 
															className="h-full bg-white"
															initial={{ width: 0 }}
															animate={{ width: "2%" }}
														/>
													</div>
													<div className="flex justify-between text-[11px] font-bold text-[#949BA4] tabular-nums">
														<span>00:01</span>
														<span>03:58</span>
													</div>
												</div>
											</div>
											<div className="w-[80px] h-[80px] rounded-lg overflow-hidden shrink-0 border border-white/5 relative">
												<NextImage src="https://i.ytimg.com/vi/MpYy6wwqxoo/hqdefault.jpg" alt="thumbnail" width={80} height={80} className="object-cover" />
											</div>
										</div>

										{/* Action Buttons Mock */}
										<div className="flex gap-1.5 pt-1">
											{[SkipBack, Pause, SkipForward, Repeat].map((Icon, idx) => (
												<div key={idx} className="p-2 bg-[#4E5058] rounded text-[#DBDEE1] hover:bg-[#6D6F78] cursor-pointer transition-colors">
													<Icon size={18} fill={idx === 1 || idx === 3 ? "currentColor" : "none"} />
												</div>
											))}
										</div>

										<div className="flex items-center gap-3 text-[11px] font-bold text-[#949BA4] border-t border-white/5 pt-3">
											<span className="flex items-center gap-1"><Globe size={12} /> 재생 서버: JPN-1</span>
											<span className="flex items-center gap-1 font-mono text-[10px] opacity-70 ml-auto">시루 v5.1.2</span>
										</div>
									</div>
								</div>

								{/* Interactive Prompting Buttons */}
								<motion.div 
									initial={{ opacity: 0, y: 5 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.5 }}
									className="flex flex-col gap-2 mt-2 bg-[#2B2D31]/50 p-3 rounded-md border border-white/5"
								>
									<div className="text-sm font-bold text-white flex items-center gap-2">
										<Plus size={14} className="text-green-500" />
										재생목록의 나머지 12곡도 추가할까요?
									</div>
									<div className="flex gap-2">
										<div className="px-4 py-1.5 bg-[#23A559] hover:bg-[#1A7A42] text-white text-sm font-bold rounded cursor-pointer transition-colors flex items-center gap-2 shadow-lg shadow-green-500/10">
											<Plus size={16} /> 나머지 곡 모두 추가
										</div>
										<div className="px-4 py-1.5 bg-[#4E5058] hover:bg-[#6D6F78] text-white text-sm font-bold rounded cursor-pointer transition-colors">
											현재 곡만 듣기
										</div>
									</div>
								</motion.div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{/* Input Area */}
			<div className="p-4 shrink-0">
				<div className="bg-[#383A40] rounded-lg px-4 py-2.5 flex items-center gap-4 relative">
					<Plus size={24} className="text-[#B5BAC1] cursor-pointer hover:text-[#DBDEE1]" />
					<div className="flex-1 bg-transparent text-[#DBDEE1] outline-none placeholder-[#949BA4] relative h-6">
						{step === 0 && <span className="text-[#949BA4]">#음악-채널 에 메시지 보내기</span>}
						<AnimatePresence>
							{step === 1 && (
								<motion.div className="flex items-center gap-1 font-medium">
									{displayText}
									<motion.div 
										animate={{ opacity: [1, 0, 1] }} 
										transition={{ repeat: Infinity, duration: 0.8 }}
										className="w-0.5 h-5 bg-white"
									/>
								</motion.div>
							)}
						</AnimatePresence>

						{/* Command Autocomplete Preview */}
						<AnimatePresence>
							{step === 1 && displayText.startsWith("/") && (
								<motion.div 
									initial={{ opacity: 0, y: 10, scale: 0.95 }}
									animate={{ opacity: 1, y: -200, scale: 1 }}
									exit={{ opacity: 0, y: 10 }}
									className="absolute left-0 w-full bg-[#2B2D31] rounded-lg shadow-2xl border border-black/20 p-2 overflow-hidden z-20"
								>
									<div className="px-3 py-2 text-[12px] font-bold text-[#949BA4] uppercase mb-1">
										일치하는 명령어
									</div>
									<div className="p-2 bg-[#5865F2] rounded-md flex items-center gap-3">
										<div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center">
											<Music size={20} className="text-white" />
										</div>
										<div className="flex-1">
											<div className="flex items-center gap-2">
												<span className="font-bold text-white">/재생</span>
												<span className="text-white/60 text-[13px]">play</span>
											</div>
											<div className="text-white/80 text-[12px]">음성 채널에서 노래를 재생해요.</div>
										</div>
									</div>
									<div className="p-2 pt-4 px-3 text-[11px] text-[#949BA4] font-bold flex gap-4">
										<span>검색어: Gurenge...</span>
										<span>플랫폼: 유튜브</span>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
					<div className="flex items-center gap-3 text-[#B5BAC1]">
						<Gift size={24} className="cursor-pointer hover:text-white" />
						<Sticker size={24} className="cursor-pointer hover:text-white" />
						<Smile size={24} className="cursor-pointer hover:text-white" />
					</div>
				</div>
			</div>

			{/* Typing Indicator */}
			<div className="px-4 pb-2 h-4 text-[12px] font-medium text-[#DBDEE1]">
				{step === 1 && (
					<div className="flex items-center gap-1">
						<span className="font-bold">당면</span>님이 입력 중...
					</div>
				)}
			</div>
		</div>
	);
}
