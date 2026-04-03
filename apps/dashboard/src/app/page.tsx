import Link from "next/link";
import { auth } from "@/lib/auth";
import { Music, SlidersHorizontal, BarChart3, ArrowRight } from "lucide-react";
import { FaDiscord } from "react-icons/fa";

export default async function Home() {
  const session = await auth();

  const features = [
    {
      icon: <Music size={22} />,
      title: "고음질 음악 재생",
      description:
        "YouTube, Spotify, SoundCloud 등 다양한 소스에서 고음질 음악을 스트리밍합니다.",
      href: "/track",
    },
    {
      icon: <SlidersHorizontal size={22} />,
      title: "서버별 설정",
      description:
        "볼륨, 반복, DJ 모드 등 서버마다 개별적인 음악 설정을 관리하세요.",
      href: "/servers",
    },
    {
      icon: <BarChart3 size={22} />,
      title: "실시간 모니터링",
      description: "샤드 상태, 서버 수, 메모리 사용량을 실시간으로 확인하세요.",
      href: "/shards",
    },
  ];

  return (
    <div className="space-y-16 sm:space-y-24 lg:space-y-32">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center py-28 text-center sm:py-36">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="orb orb-violet absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 animate-glow-pulse" />
          <div
            className="orb orb-lavender absolute -left-20 top-2/3 h-[400px] w-[400px] animate-glow-pulse"
            style={{ animationDelay: "1.5s" }}
          />
          <div
            className="orb orb-mixed absolute -right-20 top-1/4 h-[350px] w-[350px] animate-glow-pulse"
            style={{ animationDelay: "3s" }}
          />
        </div>

        <div className="relative z-10 space-y-10">
          <div className="animate-fade-in-up space-y-6">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-[var(--color-accent-subtle)] border border-[var(--color-border-accent)] shadow-lg shadow-[var(--color-accent-glow)] animate-float">
              <span className="text-5xl">🎵</span>
            </div>
            <h1 className="text-5xl font-extrabold tracking-tight text-balance sm:text-7xl lg:text-8xl">
              <span className="gradient-text">유하리</span>
            </h1>
            <p className="mx-auto max-w-lg text-lg text-[var(--color-text-secondary)] sm:text-xl leading-relaxed">
              디스코드에서 최고의 음악 경험을 제공하는
              <br className="hidden sm:block" />
              스마트 뮤직 봇
            </p>
          </div>

          <div className="animate-fade-in-up stagger-2 flex flex-wrap items-center justify-center gap-4 opacity-0">
            {session ? (
              <Link href="/servers" className="btn-accent text-base">
                서버 관리하기
              </Link>
            ) : (
              <Link href="/login" className="btn-accent text-base">
                시작하기
              </Link>
            )}
            <Link href="/track" className="btn-ghost text-base">
              인기 곡 보기
            </Link>
          </div>

          <div className="animate-fade-in-up stagger-3 opacity-0">
            <div className="inline-flex items-center gap-6 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-6 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                <span className="text-[var(--color-text-muted)]">온라인</span>
              </div>
              <div className="h-4 w-px bg-[var(--color-border)]" />
              <span className="text-[var(--color-text-secondary)]">
                YouTube · Spotify · SoundCloud
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* Features */}
      <section className="space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">
            <span className="gradient-text-subtle">필요한 모든 기능</span>
          </h2>
          <p className="text-[var(--color-text-secondary)] max-w-lg mx-auto text-lg">
            유하리는 음악 감상에 필요한 모든 것을 제공합니다.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <Link
              key={feature.href}
              href={feature.href}
              className={`glass-card group relative overflow-hidden p-8 space-y-5 opacity-0 animate-fade-in-up stagger-${i + 1}`}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--color-accent-glow)] blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-subtle)] border border-[var(--color-border-accent)] text-[var(--color-accent)] transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-[var(--color-accent-glow)]">
                {feature.icon}
              </div>
              <h3 className="relative text-lg font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors duration-300">
                {feature.title}
              </h3>
              <p className="relative text-sm text-[var(--color-text-secondary)] leading-relaxed">
                {feature.description}
              </p>
              <div className="relative flex items-center gap-1 text-xs font-medium text-[var(--color-text-muted)] transition-all duration-300 group-hover:text-[var(--color-accent)] group-hover:gap-2">
                자세히 보기
                <ArrowRight size={14} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="section-divider" />

      {/* Bottom CTA */}
      <section className="relative overflow-hidden glass-panel p-12 text-center sm:p-20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="orb orb-violet absolute -right-32 -top-32 h-80 w-80" />
          <div className="orb orb-lavender absolute -bottom-32 -left-32 h-80 w-80" />
        </div>
        <div className="relative z-10 space-y-8">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">
            <span className="gradient-text">지금 시작하세요</span>
          </h2>
          <p className="mx-auto max-w-md text-[var(--color-text-secondary)] text-lg">
            유하리를 서버에 추가하고
            <br />
            최고의 음악 경험을 시작하세요.
          </p>
          <a
            href="https://discord.com/oauth2/authorize?client_id=1457415706495946957&permissions=0&scope=bot"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-accent inline-flex items-center gap-2 text-base"
          >
            <FaDiscord size={18} />
            디스코드에 추가하기
          </a>
        </div>
      </section>
    </div>
  );
}
