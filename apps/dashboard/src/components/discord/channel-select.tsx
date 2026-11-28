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
	channels: DiscordChannelSummary[] | null;
	types?: readonly number[];
	keepMissing?: boolean;
	groupByCategory?: boolean;
	noneLabel?: string;
	placeholder?: string;
	searchPlaceholder?: string;
	disabled?: boolean;
	className?: string;
	id?: string;
	"aria-label"?: string;
	"aria-describedby"?: string;
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
		id,
		"aria-label": ariaLabel,
		"aria-describedby": ariaDescribedBy,
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
			disabled={disabled || channels === null}
			className={className}
			id={id}
			aria-label={ariaLabel}
			aria-describedby={ariaDescribedBy}
		/>
	);
}
