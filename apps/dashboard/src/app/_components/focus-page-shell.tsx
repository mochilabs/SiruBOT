import type { ReactNode } from "react";

/**
 * 단일 초점 페이지(404·로그인·초대) 공통 셸 — R-01: 배경 블러 오브는
 * 단일 초점 페이지 공통의 브랜드 앰비언트 틴트예요. 4% 저투명도로 장식 강조가 아니라
 * 배경 온도만 유지해요.
 */
export function FocusPageShell({ children }: { children: ReactNode }) {
	return (
		<main className="relative flex min-h-[calc(100svh-var(--navbar-h))] w-full items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
			<div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
				<div className="h-[32rem] w-[32rem] rounded-full bg-primary/[0.04] blur-3xl" />
			</div>
			{children}
		</main>
	);
}
