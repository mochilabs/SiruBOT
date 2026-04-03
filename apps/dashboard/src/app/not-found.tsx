import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="space-y-8">
        <div className="space-y-4">
          <h1 className="text-8xl font-extrabold gradient-text">404</h1>
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
            페이지를 찾을 수 없습니다
          </h2>
          <p className="text-[var(--color-text-secondary)] max-w-md">
            요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
          </p>
        </div>
        <div className="flex items-center justify-center gap-4">
          <Link href="/" className="btn-accent">
            홈으로 가기
          </Link>
          <Link href="/servers" className="btn-ghost">
            서버 관리
          </Link>
        </div>
      </div>
    </div>
  );
}
