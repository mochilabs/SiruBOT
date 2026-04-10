"use client";

import { Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { DiscordServerSidebar } from "@/components/test/discord-server-sidebar";
import { DiscordChannelSidebar } from "@/components/test/discord-channel-sidebar";
import { DiscordChatArea } from "@/components/test/discord-chat-area";
import { DiscordMemberList } from "@/components/test/discord-member-list";
import type { DiscordStep } from "@/components/test/discord-ui.types";

export default function TestPage() {
	const [step, setStep] = useState<DiscordStep>(0);
	const [displayText, setDisplayText] = useState("");
	
	const fullCommand = "/재생 Gurenge (LiSA)";

	useEffect(() => {
		// 시나리오 오케스트레이션
		const runScenario = async () => {
			// 1. 초기 대기
			await new Promise(r => setTimeout(r, 1500));
			
			// 2. 타이핑 시작
			setStep(1);
			for (let i = 0; i <= fullCommand.length; i++) {
				setDisplayText(fullCommand.slice(0, i));
				await new Promise(r => setTimeout(r, 60));
			}
			
			// 3. 명령어 전송 (엔터)
			await new Promise(r => setTimeout(r, 800));
			setStep(2); // Thinking
			
			// 4. 봇 응답
			await new Promise(r => setTimeout(r, 2000));
			setStep(3); // Response
		};

		runScenario();
	}, []);

	return (
		<div className="flex h-screen bg-[#1E1F22] text-[#DBDEE1] font-sans overflow-hidden select-none">
			<DiscordServerSidebar />
			<DiscordChannelSidebar />
			<DiscordChatArea step={step} displayText={displayText} />
			<DiscordMemberList />

			{/* Background Deco elements from Landing */}
			<div className="fixed inset-0 pointer-events-none -z-10 opacity-30">
				<div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full" />
				<div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/20 blur-[120px] rounded-full" />
			</div>
			
			{/* Refresh FAB */}
			<div 
				onClick={() => window.location.reload()}
				className="fixed bottom-6 right-6 w-12 h-12 bg-[#5865F2] rounded-full flex items-center justify-center text-white shadow-2xl cursor-pointer hover:scale-110 active:scale-95 transition-all z-50 group"
			>
				<Sparkles size={24} className="group-hover:rotate-12 transition-transform" />
				<div className="absolute bottom-14 right-0 bg-black/80 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
					다시 보기
				</div>
			</div>
		</div>
	);
}
