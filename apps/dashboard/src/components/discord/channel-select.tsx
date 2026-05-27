"use client";

import { useMemo } from "react";
import { Hash, Megaphone, MessageSquare, Volume2 } from "lucide-react";

import { Select, type SelectOption } from "@/components/overlay/select";

/* ─────────────────────────── types ─────────────────────────── */

export type ChannelType = "text" | "voice" | "announcement" | "thread" | "category";

export interface DiscordChannel {
	id: string;
	name: string;
	type: ChannelType;
	parentId?: string | null;
	parentName?: string;
	position?: number;
}

interface ChannelSelectProps {
	channels: DiscordChannel[];
	value?: string;
	onChange?: (channelId: string) => void;
	placeholder?: string;
	searchable?: boolean;
	disabled?: boolean;
	/** Filter to specific channel types */
	filterTypes?: ChannelType[];
	className?: string;
}

/* ─────────────────────────── helpers ─────────────────────────── */

const channelIcons: Record<ChannelType, React.ComponentType<{ className?: string; size?: number }>> = {
	text: Hash,
	voice: Volume2,
	announcement: Megaphone,
	thread: MessageSquare,
	category: Hash,
};

function ChannelIcon({ type }: { type: ChannelType }) {
	const Icon = channelIcons[type];
	return <Icon className="h-4 w-4 text-muted-foreground" />;
}

/* ─────────────────────────── component ─────────────────────────── */

export function ChannelSelect({
	channels,
	value,
	onChange,
	placeholder = "채널을 선택해 주세요",
	searchable = true,
	disabled = false,
	filterTypes,
	className = "",
}: ChannelSelectProps) {
	const options: SelectOption[] = useMemo(() => {
		let filtered = channels.filter((c) => c.type !== "category");
		if (filterTypes) {
			filtered = filtered.filter((c) => filterTypes.includes(c.type));
		}

		return filtered
			.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
			.map((c) => ({
				value: c.id,
				label: c.name,
				icon: <ChannelIcon type={c.type} />,
				group: c.parentName ?? undefined,
			}));
	}, [channels, filterTypes]);

	return (
		<Select
			options={options}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			searchable={searchable}
			searchPlaceholder="채널 검색..."
			disabled={disabled}
			className={className}
		/>
	);
}
