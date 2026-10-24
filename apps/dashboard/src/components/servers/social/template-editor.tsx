"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { renderSocialContent, SOCIAL_TEMPLATE_VARIABLES, type SocialEvent,socialTemplateIssue } from "@sirubot/utils/social";

import { ChannelSelect } from "@/components/discord/channel-select";
import { RoleSelect } from "@/components/discord/role-select";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import type { SocialPlatform } from "@/types/social";

/** 미리보기에 쓸 샘플 알림 — 선택한 소스의 이름으로 진짜 같은 문장을 만들어요. */
export interface TemplateSample {
	platform: SocialPlatform;
	sourceId: string;
	title: string;
	url: string;
	author: string;
}

/** 미리보기용 자리 표시 URL: 실제 방송 주소를 흉내 내지 않도록 플랫폼 형태만 갖춰요 (R-38) */
export const SAMPLE_URLS: Record<SocialPlatform, string> = {
	youtube: "https://www.youtube.com/watch?v=VIDEO_ID",
	twitch: "https://www.twitch.tv/CHANNEL",
	chzzk: "https://chzzk.naver.com/live/LIVE_ID",
};

const VARIABLE_LABELS: Record<(typeof SOCIAL_TEMPLATE_VARIABLES)[number], string> = {
	title: "제목",
	url: "링크",
	author: "채널 이름",
};

interface TemplateEditorProps {
	guildId: string;
	value: string;
	onChange: (value: string) => void;
	sample: TemplateSample;
	disabled?: boolean;
}

/**
 * 알림 메시지 템플릿 편집기 — 변수 치환 버튼과 채널·역할 멘션 삽입, 실시간 미리보기를 갖춰요.
 * 멘션 토큰(<#id>, <@&id>)은 그대로 저장되고 Discord가 렌더링해요. 서버가 전송 시
 * allowed_mentions 화이트리스트를 만들어서 원치 않는 핑이 나가지 않아요.
 */
export function TemplateEditor({ guildId, value, onChange, sample, disabled = false }: TemplateEditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [mentionChannel, setMentionChannel] = useState("");
	const [mentionRole, setMentionRole] = useState("");

	// 미리보기에서 토큰을 읽을 수 있게 채널·역할 이름을 가져와요 — SWR 중복 요청은 자동으로 합쳐져요
	const { channels } = useGuildChannels(guildId);
	const { roles } = useGuildRoles(guildId);

	const channelName = useCallback((channelId: string) => channels?.find((channel) => channel.id === channelId)?.name ?? null, [channels]);
	const roleName = useCallback((roleId: string) => roles?.find((role) => role.id === roleId)?.name ?? null, [roles]);

	const insertToken = (token: string) => {
		const el = textareaRef.current;
		if (!el) {
			onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${token}`);
			return;
		}
		const start = el.selectionStart ?? value.length;
		const end = el.selectionEnd ?? value.length;
		onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
		requestAnimationFrame(() => {
			el.focus();
			const pos = start + token.length;
			el.setSelectionRange(pos, pos);
		});
	};

	const sampleEvent: SocialEvent = useMemo(
		() => ({
			platform: sample.platform,
			sourceId: sample.sourceId,
			contentId: "preview",
			title: sample.title,
			url: sample.url,
			thumbnail: null,
			author: sample.author,
			publishedAt: Date.now(),
		}),
		[sample],
	);

	const issue = socialTemplateIssue(value);

	// 멘션 토큰은 미리보기에서 사람이 읽는 이름으로 바꿔 보여요 — 전송 본문은 그대로예요
	const preview = useMemo(() => {
		const rendered = renderSocialContent(value, sampleEvent);
		return rendered
			.replace(/<#(\d{17,20})>/g, (_, id: string) => `#${channelName(id) ?? "삭제된 채널"}`)
			.replace(/<@&(\d{17,20})>/g, (_, id: string) => `@${roleName(id) ?? "삭제된 역할"}`);
	}, [value, sampleEvent, channelName, roleName]);

	return (
		<div className="flex flex-col gap-2">
			<Field
				label="알림 메시지"
				description="비워 두면 임베드만 전송해요. {title}·{url}·{author} 변수와 채널·역할 멘션을 넣을 수 있어요."
			>
				<Textarea
					ref={textareaRef}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder={`예: {author}이(가) 방송을 시작했어요! {url}`}
					rows={3}
					disabled={disabled}
				/>
			</Field>

			<div className="flex flex-wrap items-center gap-1.5">
				{SOCIAL_TEMPLATE_VARIABLES.map((variable) => (
					<Button
						key={variable}
						type="button"
						variant="secondary"
						size="xs"
						disabled={disabled}
						onClick={() => insertToken(`{${variable}}`)}
					>
						{`{${variable}}`} · {VARIABLE_LABELS[variable]}
					</Button>
				))}
			</div>

			<div className="grid gap-2 sm:grid-cols-2">
				<ChannelSelect
					channels={channels}
					value={mentionChannel}
					onChange={(channelId) => {
						insertToken(`<#${channelId}>`);
						setMentionChannel("");
					}}
					placeholder="채널 멘션 넣기"
					keepMissing={false}
					groupByCategory={false}
					disabled={disabled}
				/>
				<RoleSelect
					roles={roles}
					value={mentionRole}
					onChange={(roleId) => {
						insertToken(`<@&${roleId}>`);
						setMentionRole("");
					}}
					placeholder="역할 멘션 넣기"
					keepMissing={false}
					disabled={disabled}
				/>
			</div>

			{issue ? (
				<p className="text-xs font-medium text-destructive">{issue}</p>
			) : (
				<div className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2">
					<p className="text-xs text-muted-foreground">미리보기</p>
					<p className="mt-0.5 text-sm text-foreground">{preview}</p>
				</div>
			)}
		</div>
	);
}