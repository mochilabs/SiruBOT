"use client";

import { useMemo } from "react";

import {
	buildChannelOptions,
	CHANNEL_TYPE_GROUP,
	type ChannelOptionConfig,
} from "@/components/discord/discord-options";
import { SearchableSelect } from "@/components/servers/searchable-select";
import type { DiscordChannelSummary } from "@/types/discord";

interface ChannelSelectBase {
	/** 길드 채널 목록 — 순서·카테고리 정렬은 buildChannelOptions가 Discord 기준으로 해요 */
	channels: DiscordChannelSummary[] | null;
	/**
	 * 넣을 채널 종류 — `CHANNEL_TYPE_GROUP`에서 골라요 (기본은 `chat`).
	 * 없는 조합이면 배열을 직접 넘기면 돼요.
	 */
	types?: readonly number[];
	/** 저장된 값 중 목록에 없는 채널을 "삭제된 채널"로 남길지 — 기본 true */
	keepMissing?: boolean;
	/** 카테고리별 그룹 표시 — 카테고리 자체를 고를 때만 꺼요 (기본 true) */
	groupByCategory?: boolean;
	/** 지정하면 맨 앞에 "선택 안 함" 항목을 넣어요 */
	noneLabel?: string;
	placeholder?: string;
	/** 목록 위 검색 입력의 안내 문구 */
	searchPlaceholder?: string;
	disabled?: boolean;
	className?: string;
}

interface ChannelSelectSingle extends ChannelSelectBase {
	multiple?: false;
	value?: string;
	onChange?: (channelId: string) => void;
}

interface ChannelSelectMulti extends ChannelSelectBase {
	multiple: true;
	value?: string[];
	onChange?: (channelIds: string[]) => void;
}

export type ChannelSelectProps = ChannelSelectSingle | ChannelSelectMulti;

/**
 * 채널 선택기 — 검색·키보드 조작은 SearchableSelect를 그대로 써요.
 *
 * 목록은 Discord 사이드바 순서예요. 카테고리에 속한 채널은 카테고리 머리글 아래 그룹으로 들어가고,
 * 카테고리 없는 채널이 맨 위에 놓여요. 어떤 종류의 채널을 보여줄지는 `types`로 정해요.
 */
export function ChannelSelect(props: ChannelSelectProps) {
	const {
		channels,
		types = CHANNEL_TYPE_GROUP.chat,
		keepMissing = true,
		groupByCategory = true,
		noneLabel,
		placeholder = "채널을 선택해 주세요",
		searchPlaceholder = "채널 검색…",
		disabled = false,
		className,
	} = props;

	const selectedIds = useMemo(() => {
		if (!keepMissing) return [];
		return props.multiple ? (props.value ?? []) : props.value ? [props.value] : [];
	}, [keepMissing, props.multiple, props.value]);

	const options = useMemo(() => {
		const config: ChannelOptionConfig = { types, selectedIds, groupByCategory };
		if (noneLabel) config.noneLabel = noneLabel;
		return buildChannelOptions(channels, config);
	}, [channels, types, selectedIds, groupByCategory, noneLabel]);

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
				disabled={disabled || channels === null}
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
			disabled={disabled || channels === null}
			className={className}
		/>
	);
}
