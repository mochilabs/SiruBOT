"use client";

import { useMemo } from "react";

import { buildRoleOptions } from "@/components/discord/discord-options";
import { SearchableSelect } from "@/components/servers/searchable-select";
import type { DiscordRoleSummary } from "@/types/discord";

interface RoleSelectBase {
	roles: DiscordRoleSummary[] | null;
	keepMissing?: boolean;
	noneLabel?: string;
	placeholder?: string;
	searchPlaceholder?: string;
	disabled?: boolean;
	className?: string;
	id?: string;
	"aria-label"?: string;
	"aria-describedby"?: string;
}

interface RoleSelectSingle extends RoleSelectBase {
	multiple?: false;
	value?: string;
	onChange?: (roleId: string) => void;
}

interface RoleSelectMulti extends RoleSelectBase {
	multiple: true;
	value?: string[];
	onChange?: (roleIds: string[]) => void;
}

export type RoleSelectProps = RoleSelectSingle | RoleSelectMulti;

export function RoleSelect(props: RoleSelectProps) {
	const {
		roles,
		keepMissing = true,
		noneLabel,
		placeholder = "역할을 선택해 주세요",
		searchPlaceholder = "역할 검색…",
		disabled = false,
		className,
		id,
		"aria-label": ariaLabel,
		"aria-describedby": ariaDescribedBy,
	} = props;

	const selectedIds = useMemo(() => {
		if (!keepMissing) return [];
		return props.multiple ? (props.value ?? []) : props.value ? [props.value] : [];
	}, [keepMissing, props.multiple, props.value]);

	const options = useMemo(
		() => buildRoleOptions(roles, noneLabel ? { noneLabel, selectedIds } : { selectedIds }),
		[roles, noneLabel, selectedIds],
	);

	if (props.multiple) {
		return (
			<SearchableSelect
				multiple
				searchable
				options={options}
				value={props.value ?? []}
				onChange={props.onChange}
				placeholder={placeholder}
				searchPlaceholder={searchPlaceholder}
				disabled={disabled || roles === null}
				className={className}
				id={id}
				aria-label={ariaLabel}
				aria-describedby={ariaDescribedBy}
			/>
		);
	}

	return (
		<SearchableSelect
			searchable
			options={options}
			value={props.value ?? ""}
			onChange={props.onChange}
			placeholder={placeholder}
			searchPlaceholder={searchPlaceholder}
			disabled={disabled || roles === null}
			className={className}
			id={id}
			aria-label={ariaLabel}
			aria-describedby={ariaDescribedBy}
		/>
	);
}
