"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, DollarSign,ListMusicIcon, Music, Shield, Sparkles, Users } from "lucide-react";

export function FeaturesSection() {
	const features = [
		{ icon: Music, title: "고품질 음악", desc: "고음질로 Spotify, YouTube 등 스트리밍을 지원해요.", gradient: "from-primary to-pink-400" },
		{ icon: Sparkles, title: "추천 곡 재생", desc: "노래를 직접 고르지 않아도 시루봇이 추천해드려요.", gradient: "from-secondary to-yellow-500" },
		{ icon: ListMusicIcon, title: "나만의 재생목록", desc: "자주 듣는 노래들을 저장하고 언제든 다시 불러올 수 있어요.", gradient: "from-pink-500 to-rose-400" },
		{ icon: Users, title: "쉬운 사용", desc: "누구나 쉽게 쓸 수 있는 명령어와 대시보드를 준비했어요.", gradient: "from-primary to-purple-500" },
		{ icon: Shield, title: "안정적 운영", desc: "언제 어디서나 끊김 없이 음악을 즐길 수 있어요.", gradient: "from-secondary to-orange-500" },
		{ icon: DollarSign, title: "무료", desc: "대부분의 기능이 무료예요.", gradient: "from-secondary to-green-500" },
	];

	return (
		<section id="features" className="relative flex items-center py-24 sm:py-32">
			<div className="mx-auto w-full max-w-7xl space-y-16 px-4 sm:space-y-20 sm:px-6 lg:px-8">
				<motion.div 
					className="text-center space-y-6 sm:space-y-8"
					initial={{ opacity: 0, y: 40 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.8 }}
				>
					<div className="space-y-4">
						<h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-title-gradient">왜 시루봇인가요?</h2>
						<p className="text-lg sm:text-xl font-medium text-muted-foreground/80">왜 수천 개의 서버가 시루봇을 쓰는지 궁금하신가요?</p>
					</div>
					
					<div className="flex justify-center">
						<Link 
							href="/invite" 
							className="inline-flex items-center gap-3 px-8 py-4 bg-primary/10 border border-primary/20 text-primary font-bold rounded-2xl hover:bg-primary/20 transition-all duration-300"
						>
							초대하기
							<ArrowRight size={20} />
						</Link>
					</div>
				</motion.div>

				<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-4">
					{features.map((feature, i) => (
						<motion.div 
							key={i}
							className="group glass-panel p-8 space-y-6 hover:translate-y-[-8px] transition-all duration-300"
							initial={{ opacity: 0, scale: 0.9, y: 30 }}
							whileInView={{ opacity: 1, scale: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.5, delay: i * 0.1 }}
						>
							<div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-white shadow-lg`}>
								<feature.icon size={26} />
							</div>
							<div className="space-y-3">
								<h3 className="text-xl sm:text-2xl font-black tracking-tighter text-foreground">{feature.title}</h3>
								<p className="text-muted-foreground/70 font-medium leading-relaxed">{feature.desc}</p>
							</div>
						</motion.div>
					))}
				</div>
			</div>
		</section>
	);
}
