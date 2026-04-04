import { signIn } from "@/lib/auth";
import Link from "next/link";
import { FaDiscord } from "react-icons/fa";

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl } = await searchParams;
  const redirectTarget = callbackUrl || "/servers";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-8 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb orb-blue absolute left-1/3 top-1/4 h-[500px] w-[500px] animate-glow-pulse" />
        <div
          className="orb orb-violet absolute right-1/4 bottom-1/4 h-[400px] w-[400px] animate-glow-pulse"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="glass-panel p-10 space-y-8">
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--color-accent2-subtle)] border border-[var(--color-accent2)]/15">
              <span className="text-4xl">🎵</span>
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
              유하리 대시보드
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              봇을 설정하고 통계를 확인하려면
              <br />
              디스코드 계정으로 로그인해주세요.
            </p>
          </div>

          <form
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: redirectTarget });
            }}
          >
            <button
              type="submit"
              className="group relative w-full flex justify-center items-center py-3.5 px-4 text-sm font-semibold rounded-xl text-white bg-[#5865F2] transition-all duration-300 hover:bg-[#4752C4] hover:shadow-lg hover:shadow-[#5865F2]/20 hover:-translate-y-0.5"
              aria-label="Discord로 계속하기"
            >
              <FaDiscord size={18} className="mr-3" />
              Discord로 계속하기
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full section-divider" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="rounded-full bg-[var(--color-bg-secondary)] px-4 py-0.5 text-[var(--color-text-muted)]">
                또는
              </span>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/"
              className="text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
