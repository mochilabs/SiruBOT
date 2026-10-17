"use client";

import { useMemo } from "react";

import { buildRoleOptions } from "@/components/discord/discord-options";
import { SearchableSelect } from "@/components/servers/searchable-select";
import type { DiscordRoleSummary } from "@/types/discord";

export interface RoleSelectProps {
	/** 길드 역할 목록 — 정렬은 buildRoleOptions가 Discord 순서(위에서 아래)로 해요 */
	roles: DiscordRoleSummary[] | null;
	value?: string[];
	onChange?: (roleIds: string[]) => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
}

/**
 * 역할 선택기 — 여러 개를 고르고 검색할 수 있어요.
 *
 * 목록·검색·키보드 조작은 SearchableSelect를 그대로 쓰고, 여기는 역할 색상 점과 순서만 입혀요.
 * 예전에는 이 선택기만 별도 팝오버를 써서 다른 선택기와 키보드 동작·모양이 달랐어요.
 */
export function RoleSelect({
	roles,
	value = [],
	onChange,
	placeholder = "역할을 선택해 주세요",
	disabled = false,
	className,
}: RoleSelectProps) {
	const options = useMemo(() => buildRoleOptions(roles), [roles]);

	return (
		<SearchableSelect
			multiple
			searchable
			options={options}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			disabled={disabled || roles === null}
			className={className}
		/>
	);
}
