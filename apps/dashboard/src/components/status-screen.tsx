import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** 상태 화면(404·오류·초대) 공통 보조 액션 — 주 버튼 옆에 놓는 텍스트 버튼 스타일이에요 */
export const statusSecondaryActionClass =
	"group flex h-11 items-center gap-1.5 rounded-control px-4 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface StatusScreenProps {
	title: string;
	description: ReactNode;
	/** 제목 아래 보조 정보(오류 코드, 카운트다운 등) */
	meta?: ReactNode;
	/** 버튼 영역 */
	actions?: ReactNode;
	/** 오른쪽 일러스트 — 없으면 단일 칼럼 */
	illustration?: ReactNode;
	/** 라우트 전체 화면이 아니라 페이지 본문 안에 넣을 때 */
	inline?: boolean;
	className?: string;
}

/**
 * 상태 화면 단일 레이아웃 — 좌측 타이포 + 우측 일러스트 2단(모바일은 위·아래).
 * 404·라우트 오류·로그인 오류·초대·인라인 오류 패널이 모두 이 구성을 써서 제목 크기·여백·버튼 모양을 맞춰요.
 */
export function StatusScreen({ title, description, meta, actions, illustration, inline, className }: StatusScreenProps) {
	const Root = inline ? "section" : "main";
	return (
		<Root
			className={cn(
				"mx-auto grid w-full max-w-7xl items-center gap-10 px-4 sm:px-6 md:gap-12 lg:gap-16 lg:px-8",
				illustration && "md:grid-cols-2",
				inline ? "py-10" : "min-h-[calc(100svh-var(--navbar-h))] py-12",
				className
			)}
		>
			<div className="flex max-w-2xl flex-col items-start gap-8">
				<div className="space-y-3">
					<h1 className="break-keep text-4xl font-black tracking-tighter text-foreground sm:text-5xl">{title}</h1>
					<div className="max-w-md break-keep text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">{description}</div>
					{meta}
				</div>
				{actions && <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">{actions}</div>}
			</div>
			{illustration && <div className="mx-auto w-full max-w-sm md:max-w-none">{illustration}</div>}
		</Root>
	);
}
