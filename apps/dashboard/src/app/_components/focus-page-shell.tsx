import type { ReactNode } from "react";

/**
 * 단일 초점 페이지(404·로그인 오류·초대) 공통 셸 — 좌측 정렬 한 칼럼.
 * 가운데 정렬 아이콘 원과 배경 후광은 쓰지 않아요(범용 템플릿처럼 보이는 패턴이라 걷어냈어요).
 */
export function FocusPageShell({ children }: { children: ReactNode }) {
	return (
		<main className="mx-auto flex min-h-[calc(100svh-var(--navbar-h))] w-full max-w-7xl items-center px-4 py-12 sm:px-6 lg:px-8">
			<div className="flex max-w-2xl flex-col items-start gap-8">{children}</div>
		</main>
	);
}
