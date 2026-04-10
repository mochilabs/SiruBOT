import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Settings, UserPlus, Sparkles, ShieldCheck } from "lucide-react";
import { InteractiveGlow } from "@/components/interactive-glow";

function buildInviteUrl() {
	const clientId = process.env.AUTH_DISCORD_ID;
	if (!clientId) return null;
	return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=274877910080&scope=bot%20applications.commands`;
}

export default function InvitePage() {
	const inviteUrl = buildInviteUrl();

	return (
		<main className="min-h-screen pt-32 pb-20 relative overflow-hidden">
			<InteractiveGlow />

			<div className="mx-auto w-full max-w-6xl px-6 relative z-10">
					<div className="space-y-4">
						<h1 className="text-5xl md:text-6xl font-black tracking-tighter text-title-gradient leading-[0.9]">
							당신의 서버에 <Sparkles size={40} className="inline-block" /><br /> 시루봇을 초대하세요
						</h1>
						<p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
							최고의 음악 경험을 제공하는 시루봇을 지금 바로 초대하고 <br className="hidden md:block"/> 
							강력한 대시보드 기능을 무제한으로 이용해 보세요.
						</p>
					</div>
					<div className="space-y-10 order-2 lg:order-1">
						<div className="glass-panel p-10 space-y-8 border-primary/20">
							<div className="space-y-4">
								<h2 className="text-2xl font-black tracking-tighter text-foreground">간편하게 시작하기</h2>
								<p className="text-muted-foreground leading-relaxed">
									아래 버튼을 클릭하여 디스코드 서버에 시루봇을 추가할 수 있습니다. <br />
									초대 완료 후 바로 대시보드에서 설정을 변경할 수 있습니다.
								</p>
							</div>

							<div className="flex flex-col sm:flex-row gap-4">
								{inviteUrl ? (
									<a
										href={inviteUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="group flex flex-1 items-center justify-center gap-3 px-8 py-5 bg-gradient-to-r from-primary to-secondary text-white text-lg font-bold rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
									>
										<UserPlus size={22} />
										시루봇 초대하기
										<ExternalLink size={20} className="opacity-60" />
									</a>
								) : (
									<div className="flex-1 rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-4 text-center text-red-100/70 font-medium">
										설정 오류: 클라이언트 ID를 찾을 수 없습니다.
									</div>
								)}
								<Link 
									href="/invite/redirect" 
									className="flex items-center justify-center gap-2 px-8 py-5 bg-white/5 border border-white/10 text-foreground font-bold rounded-2xl hover:bg-white/10 transition-all duration-300"
								>
									<Settings size={20} />
									초대 후 설정
								</Link>
							</div>
						</div>

						{/* Trust Badges */}
						<div className="grid grid-cols-2 gap-6">
							{[
								{ icon: ShieldCheck, title: "보안 인증", desc: "검증된 권한만 사용" },
								{ icon: Sparkles, title: "고음질 지원", desc: "손실 없는 스트리밍" },
							].map((item, i) => (
								<div key={i} className="flex gap-4 items-start p-4 rounded-2xl bg-white/5 border border-white/5">
									<div className="p-3 bg-primary/10 rounded-xl text-primary">
										<item.icon size={20} />
									</div>
									<div>
										<h4 className="font-bold text-foreground">{item.title}</h4>
										<p className="text-sm text-muted-foreground/60">{item.desc}</p>
									</div>
								</div>
							))}
						</div>
					</div>
			</div>
		</main>
	);
}
