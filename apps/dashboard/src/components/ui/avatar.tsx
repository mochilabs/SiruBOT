"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";

import { cn } from "@/lib/utils";

type AvatarSize = "xs" | "sm" | "md" | "lg";
type AvatarStatus = "online" | "idle" | "dnd" | "offline";

interface AvatarProps extends Omit<AvatarPrimitive.Root.Props, "children"> {
	src?: string | null;
	alt?: string;
	fallback?: string;
	size?: AvatarSize;
	ring?: boolean;
	status?: AvatarStatus;
	className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
	xs: "size-8 text-xs",
	sm: "size-10 text-sm",
	md: "size-14 text-lg",
	lg: "size-20 text-2xl",
};

const statusColors: Record<AvatarStatus, string> = {
	online: "bg-success",
	idle: "bg-warning",
	dnd: "bg-destructive",
	// 40% 불투명도는 페이지 배경과 합성하면 1.56~1.71:1이라 거의 안 보여요. 불투명도 100%로 올려 4.95~7.54:1을 확보해요.
	offline: "bg-dot-neutral",
};

const statusLabels: Record<AvatarStatus, string> = {
	online: "온라인",
	idle: "자리 비움",
	dnd: "방해 금지",
	offline: "오프라인",
};

const statusDotSizes: Record<AvatarSize, string> = {
	xs: "h-2 w-2 border",
	sm: "h-2.5 w-2.5 border-[1.5px]",
	md: "h-3.5 w-3.5 border-2",
	lg: "h-5 w-5 border-[3px]",
};

function Avatar({
	src,
	alt = "",
	fallback,
	size = "md",
	ring = false,
	status,
	className,
	...props
}: AvatarProps) {
	const initial = fallback?.charAt(0)?.toUpperCase() ?? "?";

	return (
		<AvatarPrimitive.Root
			data-slot="avatar"
			className={cn("relative inline-flex shrink-0 select-none", className)}
			{...props}
		>
			{src ? (
				<AvatarPrimitive.Image
					src={src}
					alt={alt}
					className={cn(
						"aspect-square rounded-full object-cover",
						sizeClasses[size],
						ring && "ring-4 ring-primary/10",
					)}
				/>
			) : (
				<AvatarPrimitive.Fallback
					className={cn(
						"flex items-center justify-center rounded-full border-0 bg-surface-2 font-semibold text-foreground",
						sizeClasses[size],
						ring && "ring-4 ring-primary/10",
					)}
				>
					{initial}
				</AvatarPrimitive.Fallback>
			)}

			{status && (
				<span
					aria-label={statusLabels[status]}
					className={cn(
						"absolute bottom-0 right-0 rounded-full border-background",
						statusDotSizes[size],
						statusColors[status],
					)}
				/>
			)}
		</AvatarPrimitive.Root>
	);
}

export { Avatar };
export type { AvatarProps, AvatarSize, AvatarStatus };
