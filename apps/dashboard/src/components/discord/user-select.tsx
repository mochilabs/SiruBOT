"use client";

import { useMemo, useState } from "react";

import { Select, type SelectOption } from "@/components/overlay/select";
import { Avatar, discordAvatarUrl } from "@/components/primitives/avatar";

/* ─────────────────────────── types ─────────────────────────── */

export interface DiscordUser {
	id: string;
	username: string;
	globalName?: string;
	avatar?: string;
	bot?: boolean;
}

interface UserSelectProps {
	users: DiscordUser[];
	value?: string;
	onChange?: (userId: string) => void;
	placeholder?: string;
	searchable?: boolean;
	disabled?: boolean;
	className?: string;
}

/* ─────────────────────────── component ─────────────────────────── */

export function UserSelect({
	users,
	value,
	onChange,
	placeholder = "유저를 선택해 주세요",
	searchable = true,
	disabled = false,
	className = "",
}: UserSelectProps) {
	const options: SelectOption[] = useMemo(
		() =>
			users.map((u) => ({
				value: u.id,
				label: u.globalName ?? u.username,
				icon: (
					<Avatar
						src={u.avatar ? discordAvatarUrl(u.id, u.avatar, 32) : null}
						fallback={u.username}
						size="xs"
					/>
				),
			})),
		[users],
	);

	return (
		<Select
			options={options}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			searchable={searchable}
			searchPlaceholder="유저 검색..."
			disabled={disabled}
			className={className}
		/>
	);
}
