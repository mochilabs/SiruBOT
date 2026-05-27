"use client";

import Image from "next/image";

/* ─────────────────────────── types ─────────────────────────── */

type AvatarSize = "xs" | "sm" | "md" | "lg";
type AvatarStatus = "online" | "idle" | "dnd" | "offline";

interface AvatarProps {
	src?: string | null;
	alt?: string;
	fallback?: string;
	size?: AvatarSize;
	ring?: boolean;
	status?: AvatarStatus;
	className?: string;
}

/* ─────────────────────────── styles ─────────────────────────── */

const sizePx: Record<AvatarSize, number> = { xs: 32, sm: 40, md: 56, lg: 80 };
const sizeClasses: Record<AvatarSize, string> = {
	xs: "h-8 w-8 text-xs",
	sm: "h-10 w-10 text-sm",
	md: "h-14 w-14 text-lg",
	lg: "h-20 w-20 text-2xl",
};

const statusColors: Record<AvatarStatus, string> = {
	online: "bg-emerald-500",
	idle: "bg-amber-500",
	dnd: "bg-rose-500",
	offline: "bg-muted-foreground/40",
};

const statusDotSizes: Record<AvatarSize, string> = {
	xs: "h-2 w-2 border",
	sm: "h-2.5 w-2.5 border-[1.5px]",
	md: "h-3.5 w-3.5 border-2",
	lg: "h-5 w-5 border-[3px]",
};

/* ─────────────────────── helpers ─────────────────────── */

/** Build Discord CDN avatar URL */
export function discordAvatarUrl(userId: string, avatarHash: string, size = 128): string {
	return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${avatarHash.startsWith("a_") ? "gif" : "webp"}?size=${size}`;
}

/** Build Discord CDN guild icon URL */
export function discordGuildIconUrl(guildId: string, iconHash: string, size = 128): string {
	return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.webp?size=${size}`;
}

/* ─────────────────────────── component ─────────────────────────── */

export function Avatar({
	src,
	alt = "",
	fallback,
	size = "md",
	ring = false,
	status,
	className = "",
}: AvatarProps) {
	const px = sizePx[size];
	const initial = fallback?.charAt(0)?.toUpperCase() ?? "?";

	return (
		<span
			className={`relative inline-flex shrink-0 ${className}`}
			role="img"
			aria-label={alt || fallback || "avatar"}
		>
			{src ? (
				<Image
					src={src}
					alt={alt}
					width={px}
					height={px}
					className={`${sizeClasses[size]} rounded-full object-cover ${ring ? "ring-4 ring-primary/10" : ""}`}
				/>
			) : (
				<span
					className={`${sizeClasses[size]} rounded-full glass-overlay flex items-center justify-center font-black text-foreground ${ring ? "ring-4 ring-primary/10" : ""}`}
				>
					{initial}
				</span>
			)}

			{status && (
				<span
					aria-label={status}
					className={`absolute bottom-0 right-0 rounded-full border-background ${statusDotSizes[size]} ${statusColors[status]}`}
				/>
			)}
		</span>
	);
}
