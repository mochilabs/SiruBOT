import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  Music,
  SlidersHorizontal,
  BarChart3,
  ArrowRight,
  Zap,
  Shield,
  PlayCircle,
} from "lucide-react";
import { FaDiscord } from "react-icons/fa";

export default async function Home() {
  const session = await auth();

  const features = [
    {
      icon: <Music className="text-[var(--color-accent)]" size={24} />,
      title: "고음질 오디오 스트리밍",
      description:
        "최적화된 Lavalink 노드를 통해 끊김 없는 고해상도 음악을 제공합니다. YouTube, Spotify 등 다양한 플랫폼 완벽 지원.",
      href: "/track",
    },
    {
      icon: (
        <SlidersHorizontal className="text-[var(--color-accent2)]" size={24} />
      ),
      title: "서버 맞춤형 제어",
      description:
        "서버별 기본 볼륨, 권한 설정, 24/7 모드 등 디테일한 설정을 웹 대시보드에서 클릭 몇 번으로 관리하세요.",
      href: "/servers",
    },
    {
      icon: <BarChart3 className="text-sky-400" size={24} />,
      title: "실시간 모니터링",
      description:
        "봇의 현재 상태, 샤드 핑, 메모리 점유율을 실시간 대시보드에서 투명하게 확인하고 제어할 수 있습니다.",
      href: "/shards",
    },
    {
      icon: <Zap className="text-yellow-400" size={24} />,
      title: "빠른 반응속도",
      description:
        "명령어 입력 즉시 반응하는 최적화된 아키텍처. 딜레이 없는 쾌적한 음악 제어를 경험하세요.",
      href: "#",
    },
    {
      icon: <Shield className="text-emerald-400" size={24} />,
      title: "안정적인 인프라",
      description:
        "자동 복구 시스템과 로드 밸런싱을 통해 99.9%의 업타임을 보장합니다.",
      href: "#",
    },
    {
      icon: <PlayCircle className="text-rose-400" size={24} />,
      title: "스마트 플레이리스트",
      description:
        "당신만의 플레이리스트를 저장하고 클릭 한 번으로 서버에 바로 재생하세요.",
      href: "#",
    },
  ];

  return (
    <div className="space-y-20 sm:space-y-32 pb-20">
      {/* Hero Section */}
      <section className="relative pt-20 pb-16 sm:pt-32 sm:pb-24 overflow-hidden">
        {/* Subtle Ambient Background */}
        <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
          <div className="w-[800px] h-[800px] rounded-full bg-[var(--color-accent)]/5 blur-[120px] opacity-70" />
          <div className="w-[600px] h-[600px] rounded-full bg-sky-500/5 blur-[100px] opacity-50 -ml-40" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-[var(--color-text-secondary)] mb-8 animate-fade-in-up">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            V2.0 대시보드 업데이트
          </div>

          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-balance leading-[1.1] mb-6 animate-fade-in-up stagger-1">
            디스코드 음악의 <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-accent)] to-sky-400">
              새로운 기준, 유하리
            </span>
          </h1>

          <p className="max-w-2xl text-lg sm:text-xl text-[var(--color-text-secondary)] mb-10 leading-relaxed animate-fade-in-up stagger-2">
            복잡한 명령어는 잊으세요. 강력한 웹 대시보드와 압도적인 음질로{" "}
            <br className="hidden sm:block" />
            당신의 디스코드 서버에 완벽한 음악 경험을 선사합니다.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 animate-fade-in-up stagger-3">
            <a
              href="https://discord.com/oauth2/authorize?client_id=1457415706495946957&permissions=0&scope=bot"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-black font-semibold hover:bg-gray-100 transition-all duration-200"
            >
              <FaDiscord size={20} className="text-[#5865F2]" />
              디스코드에 추가
            </a>
            {session ? (
              <Link
                href="/servers"
                className="w-full sm:w-auto flex items-center justify-center px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-all duration-200"
              >
                대시보드 이동
              </Link>
            ) : (
              <Link
                href="/login"
                className="w-full sm:w-auto flex items-center justify-center px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-all duration-200"
              >
                대시보드 로그인
              </Link>
            )}
          </div>

          {/* Quick Stats */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 border-t border-white/10 pt-10 w-full max-w-4xl animate-fade-in-up stagger-4">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-white">99.9%</span>
              <span className="text-sm text-gray-400 mt-1">업타임 보장</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-white">0ms</span>
              <span className="text-sm text-gray-400 mt-1">오디오 딜레이</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-white">24/7</span>
              <span className="text-sm text-gray-400 mt-1">연중무휴 재생</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-white">∞</span>
              <span className="text-sm text-gray-400 mt-1">무제한 트랙</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            서비스형 봇의 압도적인 차이
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            단순히 음악을 트는 것을 넘어, 서버 관리자와 유저 모두가 만족할 수
            있는 강력한 기능들을 제공합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <Link
              key={feature.title}
              href={feature.href}
              className={`group flex flex-col p-8 rounded-2xl bg-[#161618] border border-white/5 hover:border-[var(--color-accent)]/30 hover:bg-[#1c1c1f] transition-all duration-300 animate-fade-in-up stagger-${(i % 3) + 1}`}
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-[var(--color-accent)] transition-colors duration-300">
                {feature.title}
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm flex-grow">
                {feature.description}
              </p>
              <div className="mt-6 flex items-center text-sm font-medium text-gray-500 group-hover:text-white transition-colors duration-300">
                자세히 알아보기{" "}
                <ArrowRight
                  size={16}
                  className="ml-2 group-hover:translate-x-1 transition-transform"
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 max-w-5xl mx-auto">
        <div className="relative rounded-3xl bg-gradient-to-br from-[#1c1c1f] to-[#0f0f11] border border-white/10 p-12 text-center overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-accent)]/10 blur-[80px] rounded-full" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-sky-500/10 blur-[80px] rounded-full" />

          <div className="relative z-10 space-y-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              서버의 격을 높일 시간입니다.
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto text-lg">
              수만 개의 서버가 이미 유하리와 함께하고 있습니다. 지금 바로
              추가하고 프리미엄 음악 봇을 경험하세요.
            </p>
            <div className="pt-4">
              <a
                href="https://discord.com/oauth2/authorize?client_id=1457415706495946957&permissions=0&scope=bot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[var(--color-accent)] text-white font-semibold hover:bg-[var(--color-accent-hover)] hover:-translate-y-1 transition-all duration-300 shadow-[0_0_30px_rgba(167,139,250,0.3)] hover:shadow-[0_0_40px_rgba(167,139,250,0.5)]"
              >
                <FaDiscord size={20} />
                유하리 초대하기
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
