import { Avatar, discordAvatarUrl } from "@/components/primitives/avatar";
import { Badge } from "@/components/primitives/badge";

/* ─────────────────────────── types ─────────────────────────── */

export interface MessageAuthor {
	id: string;
	username: string;
	avatar?: string;
	bot?: boolean;
}

export interface MessageReply {
	author: MessageAuthor;
	content: string;
}

interface ChannelMessageProps {
	author: MessageAuthor;
	content: string;
	timestamp?: string;
	reply?: MessageReply;
	compact?: boolean;
	className?: string;
	children?: React.ReactNode;
}

/* ─────────────────────────── component ─────────────────────────── */

export function ChannelMessage({
	author,
	content,
	timestamp,
	reply,
	compact = false,
	className = "",
	children,
}: ChannelMessageProps) {
	const avatarUrl = author.avatar
		? discordAvatarUrl(author.id, author.avatar, 80)
		: null;

	if (compact) {
		return (
			<div className={`group flex items-baseline gap-2 px-4 py-0.5 hover:bg-discord-bg/50 transition-colors ${className}`}>
				<span className="text-xs text-discord-text-muted opacity-0 group-hover:opacity-100 transition-opacity tabular-nums shrink-0 w-10 text-right">
					{timestamp}
				</span>
				<span className="text-sm font-semibold text-discord-text shrink-0">
					{author.username}
				</span>
				{author.bot && (
					<Badge variant="discord" size="sm">BOT</Badge>
				)}
				<span className="text-sm text-discord-text whitespace-pre-wrap break-words">
					{content}
				</span>
			</div>
		);
	}

	return (
		<div className={`group flex gap-4 px-4 py-1 hover:bg-discord-bg/50 transition-colors ${className}`}>
			{/* Reply indicator */}
			{reply && (
				<div className="absolute -top-4 left-14 flex items-center gap-1.5 text-xs text-discord-text-muted">
					<div className="w-6 h-3 border-l-2 border-t-2 border-discord-text-muted/30 rounded-tl-md" />
					<span className="font-semibold">{reply.author.username}</span>
					<span className="truncate max-w-[200px] opacity-70">{reply.content}</span>
				</div>
			)}

			{/* Avatar */}
			<div className="shrink-0 mt-0.5">
				<Avatar
					src={avatarUrl}
					fallback={author.username}
					size="sm"
				/>
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				{/* Header */}
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold text-discord-text hover:underline cursor-pointer">
						{author.username}
					</span>
					{author.bot && (
						<Badge variant="discord" size="sm">BOT</Badge>
					)}
					<span className="text-xs text-discord-text-muted">
						{timestamp}
					</span>
				</div>

				{/* Message body */}
				<div className="text-sm text-discord-text leading-relaxed whitespace-pre-wrap break-words mt-0.5">
					{content}
				</div>

				{/* Embeds / attachments slot */}
				{children}
			</div>
		</div>
	);
}
