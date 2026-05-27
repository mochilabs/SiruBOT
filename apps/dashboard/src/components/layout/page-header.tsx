import React from "react";

export interface PageHeaderProps {
	/** @deprecated 뱃지 UI 제거됨 */
	badge?: string;
	/** @deprecated 뱃지 UI 제거됨 */
	badgeIcon?: React.ReactNode;
	/** 메인 타이틀 */
	title: React.ReactNode;
	/** 타이틀 아래에 들어갈 설명 텍스트 */
	description?: React.ReactNode;
	/** 우측(또는 하단)에 배치할 추가 요소 (예: 프로필 위젯, 액션 버튼 등) */
	children?: React.ReactNode;
	/** 추가적인 className */
	className?: string;
}

export function PageHeader({
	title,
	description,
	children,
	className = "",
}: PageHeaderProps) {
	return (
		<header className={`mb-6 flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border/40 relative ${className}`}>
			<div className="flex-1 min-w-0 max-w-full flex flex-col justify-center space-y-3">
				<div className="space-y-1">
					<h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-title-gradient truncate pb-1">
						{title}
					</h1>
					{description && (
						<div className="text-sm sm:text-base font-medium text-muted-foreground/80 truncate">
							{description}
						</div>
					)}
				</div>
			</div>

			{children && (
				<div className="shrink-0 w-full md:w-auto flex items-center md:justify-end">
					{children}
				</div>
			)}
		</header>
	);
}
