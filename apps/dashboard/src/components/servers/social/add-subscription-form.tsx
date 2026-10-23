"use client";

import { useMemo, useState } from "react";
import { Loader2, Play, Radio, Search, Tv } from "lucide-react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { WebhookAvatarField } from "@/components/servers/social/webhook-avatar-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useBotProfile } from "@/hooks/use-bot-profile";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { type SocialSubscriptionInput,useSocialAlerts } from "@/hooks/use-social-alerts";
import type { ChzzkChannelSummary, SocialPlatform } from "@/types/social";

import { SAMPLE_URLS, TemplateEditor, type TemplateSample } from "./template-editor";

const PLATFORMS: { key: SocialPlatform; label: string; icon: typeof Radio }[] = [
	{ key: "chzzk", label: "치지직", icon: Radio },
	{ key: "youtube", label: "유튜브", icon: Play },
	{ key: "twitch", label: "트위치", icon: Tv },
];

interface ResolvedSource {
	platformId: string;
	name: string;
	url: string;
	sample: TemplateSample;
}

interface AddSubscriptionFormProps {
	guildId: string;
	onDone: () => void;
}

const CHZZK_URL_ID = /chzzk\.naver\.com\/(?:live\/)?([a-f0-9]{32})/i;
const CHZZK_RAW_ID = /^[a-f0-9]{32}$/i;

/** 알림 구독 추가 폼 — 플랫폼 선택 → 채널 찾기 → 알림받을 채널 → 메시지 템플릿 순서로 진행해요. */
export function AddSubscriptionForm({ guildId, onDone }: AddSubscriptionFormProps) {
	const toast = useToast();
	const { channels } = useGuildChannels(guildId);
	const { createSubscription, searchChzzk, fetchChzzkProfile, resolveYouTube, resolveTwitch } = useSocialAlerts(guildId);
	// 웹훅 프로필 사진 폴백 미리보기용 — 서버(길드) 전용 → 전역 봇 프로필 사진 순서 (봇 프로필 설정과 동일)
	const { profile: botProfile } = useBotProfile(guildId);

	const [platform, setPlatform] = useState<SocialPlatform>("chzzk");
	const [resolved, setResolved] = useState<ResolvedSource | null>(null);
	const [targetChannelId, setTargetChannelId] = useState("");
	const [template, setTemplate] = useState("");
	const [webhookName, setWebhookName] = useState("");
	const [webhookAvatarUrl, setWebhookAvatarUrl] = useState<string | null>(null);
	const [showThumbnail, setShowThumbnail] = useState(true);
	const [saving, setSaving] = useState(false);

	const [keyword, setKeyword] = useState("");
	const [chzzkResults, setChzzkResults] = useState<ChzzkChannelSummary[] | null>(null);
	const [sourceInput, setSourceInput] = useState("");
	const [looking, setLooking] = useState(false);

	const handleChzzkLookup = async () => {
		const input = keyword.trim();
		if (!input) return;

		// 링크·채널 ID를 붙여넣으면 프로필로 바로 확인하고, 아니면 검색으로 찾아요
		const directId = CHZZK_URL_ID.exec(input)?.[1] ?? (CHZZK_RAW_ID.test(input) ? input : null);
		if (directId) {
			setLooking(true);
			const result = await fetchChzzkProfile(directId);
			setLooking(false);
			if (!result.ok) {
				toast.error("치지직 채널 확인에 실패했어요.", result.error);
				return;
			}
			if (!result.data) {
				toast.error("치지직 채널을 찾지 못했어요.", "채널 ID를 다시 확인해 주세요.");
				return;
			}
			pickChzzk(result.data);
			return;
		}

		setLooking(true);
		const result = await searchChzzk(input);
		setLooking(false);
		if (!result.ok) {
			toast.error("치지직 검색에 실패했어요.", result.error);
			return;
		}
		setChzzkResults(result.data);
		if (result.data.length === 0) toast.info("검색 결과가 없어요.", "다른 이름으로 찾아보세요.");
	};

	const pickChzzk = (channel: ChzzkChannelSummary) => {
		setResolved({
			platformId: channel.channelId,
			name: channel.channelName,
			url: `https://chzzk.naver.com/${channel.channelId}`,
			sample: {
				platform: "chzzk",
				sourceId: channel.channelId,
				title: channel.liveTitle ?? `${channel.channelName} 방송 시작!`,
				url: SAMPLE_URLS.chzzk,
				author: channel.channelName,
			},
		});
		setChzzkResults(null);
	};

	const handleResolve = async () => {
		const input = sourceInput.trim();
		if (!input) return;
		setLooking(true);
		if (platform === "youtube") {
			const result = await resolveYouTube(input);
			setLooking(false);
			if (!result.ok) {
				toast.error("유튜브 채널 확인에 실패했어요.", result.error);
				return;
			}
			setResolved({
				platformId: result.data.channelId,
				name: result.data.channelName ?? result.data.channelId,
				url: `https://www.youtube.com/channel/${result.data.channelId}`,
				sample: {
					platform: "youtube",
					sourceId: result.data.channelId,
					title: "새 영상 제목",
					url: SAMPLE_URLS.youtube,
					author: result.data.channelName ?? "채널 이름",
				},
			});
			return;
		}
		if (platform === "twitch") {
			const result = await resolveTwitch(input);
			setLooking(false);
			if (!result.ok) {
				toast.error("트위치 사용자 확인에 실패했어요.", result.error);
				return;
			}
			setResolved({
				platformId: result.data.id,
				name: result.data.displayName,
				url: `https://www.twitch.tv/${result.data.login}`,
				sample: {
					platform: "twitch",
					sourceId: result.data.id,
					title: `${result.data.displayName} 방송 시작!`,
					url: `https://www.twitch.tv/${result.data.login}`,
					author: result.data.displayName,
				},
			});
		}
	};

	const handleSubmit = async () => {
		if (!resolved || !targetChannelId) return;
		setSaving(true);
		const input: SocialSubscriptionInput = {
			platform,
			sourcePlatformId: resolved.platformId,
			sourceName: resolved.name,
			targetChannelId,
			messageTemplate: template.trim() ? template : null,
			webhookName: webhookName.trim() ? webhookName.trim() : null,
			webhookAvatarUrl,
			showThumbnail,
		};
		const result = await createSubscription(input);
		setSaving(false);
		if (!result.ok) {
			toast.error("알림 구독을 추가하지 못했어요.", result.error);
			return;
		}
		toast.success("알림 구독을 추가했어요.", "봇이 대상 채널에 알림 웹훅을 만들었어요.");
		onDone();
	};

	const canSubmit = Boolean(resolved && targetChannelId) && !saving;

	const sourceStep = useMemo(() => {
		if (platform === "chzzk") {
			return (
				<div className="flex flex-col gap-2">
					<div className="flex gap-2">
						<Input
							value={keyword}
							onChange={(event) => setKeyword(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") void handleChzzkLookup();
							}}
							placeholder="치지직 채널 이름·링크·채널 ID"
							disabled={looking}
						/>
						<Button type="button" variant="secondary" onClick={() => void handleChzzkLookup()} disabled={looking || !keyword.trim()}>
							{looking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
							찾기
						</Button>
					</div>
					{chzzkResults && chzzkResults.length > 0 ? (
						<ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-control border border-border bg-surface-2 p-1">
							{chzzkResults.map((channel) => (
								<li key={channel.channelId}>
									<button
										type="button"
										onClick={() => pickChzzk(channel)}
										className="flex w-full items-center gap-3 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-muted"
									>
										<span className="min-w-0 flex-1">
											<span className="flex items-center gap-1.5 text-sm text-foreground">
												{channel.channelName}
												{channel.verifiedMark ? <Badge variant="info" size="sm">공식</Badge> : null}
												{channel.openLive ? <Badge variant="danger" size="sm">LIVE</Badge> : null}
											</span>
											{channel.followerCount !== null ? (
												<span className="block truncate text-xs text-muted-foreground">팔로워 {channel.followerCount.toLocaleString("ko-KR")}명</span>
											) : null}
										</span>
									</button>
								</li>
							))}
						</ul>
					) : null}
				</div>
			);
		}
		return (
			<div className="flex gap-2">
				<Input
					value={sourceInput}
					onChange={(event) => setSourceInput(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") void handleResolve();
					}}
					placeholder={platform === "youtube" ? "유튜브 채널 링크·@핸들·채널 ID" : "트위치 로그인 아이디"}
					disabled={looking}
				/>
				<Button type="button" variant="secondary" onClick={() => void handleResolve()} disabled={looking || !sourceInput.trim()}>
					{looking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
					확인
				</Button>
			</div>
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [platform, keyword, sourceInput, chzzkResults, looking]);

	const resetPlatform = (next: SocialPlatform) => {
		setPlatform(next);
		setResolved(null);
		setChzzkResults(null);
		setKeyword("");
		setSourceInput("");
	};

	return (
		<Card padding="lg" className="gap-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-foreground">알림 추가</h3>
				<Button type="button" variant="ghost" size="sm" onClick={onDone}>
					닫기
				</Button>
			</div>

			<div className="flex flex-wrap gap-1.5">
				{PLATFORMS.map(({ key, label, icon: Icon }) => (
					<Button
						key={key}
						type="button"
						variant={platform === key ? "default" : "secondary"}
						size="sm"
						onClick={() => resetPlatform(key)}
					>
						<Icon className="h-4 w-4" aria-hidden />
						{label}
					</Button>
				))}
			</div>

			<div className="flex flex-col gap-2">
				{sourceStep}
				{resolved ? (
					<p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
						선택한 채널:
						<span className="text-foreground">{resolved.name}</span>
						<a href={resolved.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
							{resolved.platformId}
						</a>
					</p>
				) : (
					<p className="text-xs text-muted-foreground">구독할 채널을 먼저 찾아 주세요.</p>
				)}
			</div>

			<ChannelSelect
				channels={channels}
				value={targetChannelId}
				onChange={setTargetChannelId}
				placeholder="알림을 받을 디스코드 채널"
				keepMissing={false}
				groupByCategory={false}
			/>

			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted-foreground">웹훅 표시 (선택)</span>
					<Input
						value={webhookName}
						onChange={(event) => setWebhookName(event.target.value)}
						placeholder={`기본: 시루 소셜 알림(${resolved?.name ?? "채널 이름"})`}
						maxLength={80}
						disabled={saving}
					/>
					<p className="text-xs text-muted-foreground">
						{webhookName.length}/80 · 비우면 기본 이름으로 보내요. discord·clyde는 쓸 수 없어요 (Discord 규칙).
					</p>
				</div>
				<WebhookAvatarField
					guildId={guildId}
					value={webhookAvatarUrl}
					onChange={setWebhookAvatarUrl}
					fallbackGuildAvatarUrl={botProfile?.guildAvatarUrl ?? null}
					fallbackGlobalAvatarUrl={botProfile?.globalAvatarUrl ?? null}
					disabled={saving}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Switch checked={showThumbnail} onChange={setShowThumbnail} label="방송 시작 섬네일 이미지 표시" labelPosition="right" />
				<p className="text-xs text-muted-foreground">
					방송 시작 알림에 라이브 미리보기 이미지를 넣어요. 트위치 알림에는 원래 이미지가 없어 자동으로 생략돼요.
				</p>
			</div>

			<TemplateEditor guildId={guildId} value={template} onChange={setTemplate} sample={resolved?.sample ?? {
				platform,
				sourceId: "preview",
				title: "방송 시작!",
				url: SAMPLE_URLS[platform],
				author: "채널 이름",
			}} />

			<div className="flex justify-end gap-2">
				<Button type="button" variant="ghost" onClick={onDone}>
					취소
				</Button>
				<Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
					{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
					추가
				</Button>
			</div>
		</Card>
	);
}