"use client";

import { useMemo } from "react";

import { buildRoleOptions } from "@/components/discord/discord-options";
import { SearchableSelect } from "@/components/servers/searchable-select";
import type { DiscordRoleSummary } from "@/types/discord";

interface RoleSelectBase {
	/**
	 * 길드 역할 목록: 정렬은 buildRoleOptions가 Discord 순서(위에서 아래)로 해요.
	 * `null`은 "목록 미도착(로딩) 또는 조회 실패"예요. 로딩·오류 상태는 호출부가 먼저 보여주고
	 * (예: channel-settings의 PanelLoading·WarningBox), 여기에는 그 결과로 내려온 값을 넘겨요.
	 * 목록이 `null`이면 선택기는 이유를 알 수 없게 비활성화돼요.
	 */
	roles: DiscordRoleSummary[] | null;
	/** 저장된 값 중 목록에 없는 역할을 "삭제된 역할"로 남길지 — 기본 true */
	keepMissing?: boolean;
	/** 지정하면 맨 앞에 "선택 안 함" 항목을 넣어요 */
	noneLabel?: string;
	placeholder?: string;
	/** 목록 위 검색 입력의 안내 문구 */
	searchPlaceholder?: string;
	disabled?: boolean;
	className?: string;
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

/**
 * 역할 선택기 — 여러 개 또는 하나를 고르고 검색할 수 있어요.
 *
 * 목록·검색·키보드 조작은 SearchableSelect를 그대로 쓰고, 여기는 역할 색상 점과 순서만 입혀요.
 * 예전에는 이 선택기만 별도 팝오버를 써서 다른 선택기와 키보드 동작·모양이 달랐어요.
 */
export function RoleSelect(props: RoleSelectProps) {
	const {
		roles,
		keepMissing = true,
		noneLabel,
		placeholder = "역할을 선택해 주세요",
		searchPlaceholder = "역할 검색…",
		disabled = false,
		className,
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
		/>
	);
}
