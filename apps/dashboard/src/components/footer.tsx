"use client";

import Link from "next/link";
import { Activity, FileText,GitBranch, MessageSquare, Music, ShieldCheck, Sparkles } from "lucide-react";

export function Footer() {
	return (
		<footer className="border-t border-border bg-card/30 backdrop-blur-md pt-16 pb-12">
			<div className="max-w-7xl mx-auto px-6">
				<div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
					
					{/* Branding */}
					<div className="space-y-6 col-span-1 md:col-span-1">
						<div className="flex items-center gap-3">
							<Music size={28} className="text-primary" />
							<span className="text-2xl font-black tracking-tighter bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
								시루봇
							</span>
						</div>
						<p className="text-muted-foreground font-medium leading-relaxed">
							음악으로 하나되는 서버를 만드세요.
						</p>
					</div>

					{/* Links Area */}
					<div className="grid grid-cols-2 md:grid-cols-3 col-span-1 md:col-span-3 gap-8">
						<div className="space-y-4">
							<h4 className="text-foreground font-bold text-lg uppercase tracking-wider">Product</h4>
							<ul className="space-y-3">
								<li><Link href="/#features" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium">
									<Sparkles size={16} /> 주요 기능
								</Link></li>
								<li><Link href="/shards" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium">
									<Activity size={16} /> 상태 페이지
								</Link></li>
							</ul>
						</div>

						<div className="space-y-4">
							<h4 className="text-foreground font-bold text-lg uppercase tracking-wider">Community</h4>
							<ul className="space-y-3">
								<li><Link href={process.env.NEXT_PUBLIC_SUPPORT_SERVER || "#support_server"} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium">
									<MessageSquare size={16} /> 공식 디스코드
								</Link></li>
								<li><Link href="https://github.com/mochiLabs/SiruBOT" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium">
									<GitBranch size={16} /> 깃허브
								</Link></li>
							</ul>
						</div>

						<div className="space-y-4">
							<h4 className="text-foreground font-bold text-lg uppercase tracking-wider">Legal</h4>
							<ul className="space-y-3">
								<li><Link href={process.env.NEXT_PUBLIC_TOS_URL || "#tos"} target="_blank" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium">
									<FileText size={16} /> 이용약관
								</Link></li>
								<li><Link href={process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL || "#privacypolicy"} target="_blank" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium">
									<ShieldCheck size={16} /> 개인정보처리방침
								</Link></li>
							</ul>
						</div>
					</div>
				</div>

				<div className="border-t border-border/50 pt-8 flex flex-col md:flex-row justify-between items-center gap-6 text-muted-foreground/60 text-sm font-bold">
					<p>© 2026 시루봇 (mochiLabs). All rights reserved.</p>
				</div>
			</div>
		</footer>
	);
}
