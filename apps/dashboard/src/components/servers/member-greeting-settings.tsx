"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hash, RotateCcw, Send, UserPlus } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Select, type SelectOption } from "@/components/overlay/select";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { Field } from "@/components/primitives/field";
import { Textarea } from "@/components/primitives/input";
import { Switch } from "@/components/primitives/switch";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { useMemberGreeting } from "@/hooks/use-member-greeting";
import { toError } from "@/lib/api-error";
import { ChannelTypeValue, type DiscordChannelSummary } from "@/types/discord";
import { DEFAULT_GREETINGS, GREETING_TEMPLATE_VARIABLES, type GreetingConfig, type GreetingKind, type GreetingTestResult } from "@/types/member-greeting";

import { GreetingImageEditor } from "./member-greeting/greeting-image-editor";
import { InfoBox, PanelError, PanelHeader, PanelLoading, SaveBar, WarningBox } from "./settings-shared";

const TEMPLATE_MAX = 500;

const SECTION_META: Record<GreetingKind, { heading: string; description: string; switchLabel: string }> = {
	welcome: { heading: "환영", description: "멤버가 이 서버에 입장할 때 보내는 메시지예요.", switchLabel: "환영 메시지 보내기" },
	goodbye: { heading: "작별", description: "멤버가 이 서버에서 퇴장할 때 보내는 메시지예요.", switchLabel: "작별 메시지 보내기" }
};

/** 실제 전송 시 채워지는 값의 예시를 보여줘요 (jtc 템플릿 미리보기와 같은 방식) */
function sampleTemplate(template: string): string {
	return template
		.replaceAll("{유저}", "@철수")
		.replaceAll("{유저이름}", "철수")
		.replaceAll("{서버}", "이 서버")
		.replaceAll("{멤버수}", "123");
}

export function MemberGreetingSettings({ guildId, visible }: { guildId: string; visible: boolean }) {
	return <MemberGreetingPanel guildId={guildId} visible={visible} />;
}

function MemberGreetingPanel({ guildId, visible }: { guildId: string; visible: boolean }) {
	const toast = useToast();
	const { pair, drafts, error, isLoading, saving, save, patchKind, testPending, testResults, startTest, reload } =
		useMemberGreeting(guildId);
	const { channels, error: channelsError, reload: reloadChannels } = useGuildChannels(guildId);

	const savedOr = useCallback(
		(kind: GreetingKind): GreetingConfig => pair?.[kind] ?? DEFAULT_GREETINGS[kind],
		[pair],
	);
	const dirtyWelcome = JSON.stringify(drafts.welcome) !== JSON.stringify(savedOr("welcome"));
	const dirtyGoodbye = JSON.stringify(drafts.goodbye) !== JSON.stringify(savedOr("goodbye"));
	const anyDirty = dirtyWelcome || dirtyGoodbye;

	// 변경을 저장하지 않고 페이지를 벗어나면 브라우저 확인을 요청해요 (패널 안 표시는 InfoBox로도 안내해요)
	useEffect(() => {
		if (!anyDirty) return;
		const handler = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [anyDirty]);

	const handleSave = useCallback(async () => {
		try {
			await save();
			toast.success("인사 설정을 저장했어요.", "멤버 입장·퇴장 때 새 설정이 적용돼요.");
		} catch (err) {
			const apiError = toError(err, "인사 설정을 저장하지 못했어요.");
			toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
		}
	}, [save, toast]);

	if (error) return <PanelError error={error} onRetry={reload} />;
	if (isLoading || !pair || !drafts.welcome || !drafts.goodbye) {
		return <PanelLoading label="인사 설정 불러오는 중…" />;
	}

	return (
		<Card padding="lg" className="gap-8">
			<PanelHeader
				icon={<UserPlus className="h-5 w-5" />}
				title="멤버 인사"
				description="멤버가 입장·퇴장할 때 환영·작별 메시지와 카드 이미지를 보내요."
			/>

			{channelsError && (
				<WarningBox>
					채널 목록을 불러오지 못했어요. ({channelsError.message}){" "}
					<button type="button" className="font-semibold underline" onClick={reloadChannels}>
						다시 시도
					</button>
				</WarningBox>
			)}
			{anyDirty && <InfoBox><p>저장하지 않은 변경이 있어요. 페이지를 벗어나면 편집 내용이 사라져요.</p></InfoBox>}

			<div className="grid gap-8 xl:grid-cols-2 xl:items-start">
				<GreetingSection
					kind="welcome"
					guildId={guildId}
					visible={visible}
					draft={drafts.welcome}
					saved={savedOr("welcome")}
					dirty={dirtyWelcome}
					channels={channels}
					saving={saving}
					testPending={testPending("welcome")}
					testResult={testResults.welcome}
					onPatch={(next) => patchKind("welcome", next)}
					onReset={() => patchKind("welcome", DEFAULT_GREETINGS.welcome)}
					onTest={() => startTest("welcome")}
				/>
				<GreetingSection
					kind="goodbye"
					guildId={guildId}
					visible={visible}
					draft={drafts.goodbye}
					saved={savedOr("goodbye")}
					dirty={dirtyGoodbye}
					channels={channels}
					saving={saving}
					testPending={testPending("goodbye")}
					testResult={testResults.goodbye}
					onPatch={(next) => patchKind("goodbye", next)}
					onReset={() => patchKind("goodbye", DEFAULT_GREETINGS.goodbye)}
					onTest={() => startTest("goodbye")}
				/>
			</div>

			<SaveBar dirty={anyDirty} saving={saving} onSave={handleSave} />
		</Card>
	);
}

interface GreetingSectionProps {
	guildId: string;
	visible: boolean;
	kind: GreetingKind;
	draft: GreetingConfig;
	saved: GreetingConfig;
	dirty: boolean;
	channels: DiscordChannelSummary[] | null;
	saving: boolean;
	testPending: boolean;
	testResult: GreetingTestResult | null;
	onPatch: (next: GreetingConfig) => void;
	onReset: () => void;
	onTest: () => Promise<void>;
}

function GreetingSection({
	guildId,
	visible,
	kind,
	draft,
	saved,
	dirty,
	channels,
	saving,
	testPending,
	testResult,
	onPatch,
	onReset,
	onTest,
}: GreetingSectionProps) {
	const toast = useToast();
	const meta = SECTION_META[kind];
	const templateRef = useRef<HTMLTextAreaElement>(null);
	const [sendingTest, setSendingTest] = useState(false);

	const handleTest = useCallback(async () => {
		setSendingTest(true);
		try {
			await onTest();
		} catch (err) {
			const apiError = toError(err, "테스트 전송을 요청하지 못했어요.");
			toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
		} finally {
			setSendingTest(false);
		}
	}, [onTest, toast]);

	const channelOptions = useMemo<SelectOption[]>(() => {
		const options: SelectOption[] = (channels ?? [])
			.filter((channel) => channel.type === ChannelTypeValue.GuildText || channel.type === ChannelTypeValue.GuildAnnouncement)
			.map((channel) => ({ value: channel.id, label: channel.name, icon: <Hash size={16} aria-hidden /> }));
		if (draft.channelId) {
			if (!options.some((option) => option.value === draft.channelId)) {
				options.push({ value: draft.channelId, label: `${draft.channelId} (삭제된 채널)` });
			}
			// 채널 지정 해제 — 빈 값은 저장 시 null로 기록돼요
			options.unshift({ value: "", label: "채널 지정 안 함" });
		}
		return options;
	}, [channels, draft.channelId]);

	// 테스트 전송은 봇이 읽을 "저장된 설정"으로 실행돼요 — 편집 중인 내용은 저장 후 테스트해요.
	const testReady = saved.enabled && saved.channelId !== null;

	const insertTemplateToken = useCallback(
		(token: string) => {
			const element = templateRef.current;
			const start = element?.selectionStart ?? draft.template.length;
			const end = element?.selectionEnd ?? start;
			const next = draft.template.slice(0, start) + token + draft.template.slice(end);
			onPatch({ ...draft, template: next.slice(0, TEMPLATE_MAX) });
			requestAnimationFrame(() => {
				if (!element) return;
				element.focus();
				const cursor = Math.min(start + token.length, TEMPLATE_MAX);
				element.setSelectionRange(cursor, cursor);
			});
		},
		[draft, onPatch],
	);

	const handleEnabledToggle = (checked: boolean) => {
		onPatch({ ...draft, enabled: checked });
	};

	const handleUseImageToggle = (checked: boolean) => {
		if (checked && !draft.image) {
			onPatch({ ...draft, useImage: true, image: DEFAULT_GREETINGS[kind].image });
			return;
		}
		onPatch({ ...draft, useImage: checked });
	};

	const handleChannelChange = (value: string) => {
		onPatch({ ...draft, channelId: value === "" ? null : value });
	};

	return (
		<section className="space-y-5" aria-label={`${meta.heading} 인사 설정`}>
			<div>
				<div className="flex items-center justify-between gap-2">
					<h3 className="text-sm font-bold text-foreground">{meta.heading}</h3>
					<div className="flex items-center gap-2">
						{dirty && <Badge size="sm">변경됨</Badge>}
						<Button
							variant="ghost"
							size="sm"
							icon={<RotateCcw size={14} />}
							onClick={onReset}
							disabled={saving || !dirty}
							className="pointer-coarse:h-11"
						>
							초기화
						</Button>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{meta.description}</p>
			</div>

			<div className="flex items-center justify-between gap-4">
				<Switch checked={draft.enabled} onChange={handleEnabledToggle} disabled={saving} label={meta.switchLabel} labelPosition="left" />
				<Switch checked={draft.useImage} onChange={handleUseImageToggle} disabled={saving} label="카드 이미지" labelPosition="left" />
			</div>

			<Field label="메시지 채널" description="입장·퇴장 메시지와 카드 이미지가 보내질 텍스트 채널이에요.">
				<Select
					searchable
					options={channelOptions}
					value={draft.channelId ?? ""}
					onChange={handleChannelChange}
					placeholder="채널을 선택해 주세요"
					disabled={saving || channels === null}
				/>
			</Field>

			<Field label="메시지 템플릿" description="멤버 이름·서버 정보는 변수로 넣어요. 실제 값은 전송 시 채워져요.">
				<Textarea
					ref={templateRef}
					value={draft.template}
					maxLength={TEMPLATE_MAX}
					rows={3}
					disabled={saving}
					onChange={(event) => onPatch({ ...draft, template: event.target.value })}
					placeholder={DEFAULT_GREETINGS[kind].template}
				/>
				<div className="flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="템플릿 변수 삽입">
					{GREETING_TEMPLATE_VARIABLES.map((variable) => (
						<Button
							key={variable.token}
							variant="secondary"
							size="sm"
							disabled={saving}
							title={variable.description}
							onClick={() => insertTemplateToken(variable.token)}
							className="pointer-coarse:h-11"
						>
							{variable.token}
							{!variable.usableInImage && <span className="text-2xs text-muted-foreground">봇 메시지 전용</span>}
						</Button>
					))}
				</div>
				<p className="text-2xs text-muted-foreground">
					{draft.template.length}/{TEMPLATE_MAX} · 예시: <span className="text-foreground font-semibold">{sampleTemplate(draft.template.trim() || DEFAULT_GREETINGS[kind].template)}</span>
				</p>
			</Field>

			{draft.useImage && draft.image && (
				<GreetingImageEditor guildId={guildId} kind={kind} config={draft} image={draft.image} saving={saving} active={visible} onPatch={onPatch} />
			)}

			<div className="space-y-2 rounded-card border border-border-subtle bg-surface-2 p-4">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="secondary"
						size="sm"
						icon={<Send size={14} />}
						loading={sendingTest || testPending}
						disabled={!testReady}
						onClick={() => void handleTest()}
						className="pointer-coarse:h-11"
					>
						테스트 전송
					</Button>
					{testPending && <p className="text-xs text-muted-foreground">테스트 전송 결과를 기다리는 중…</p>}
				</div>
				<p className="text-2xs text-muted-foreground">
					{testReady
						? "저장된 설정대로 본인 멤버 카드를 그려 메시지 채널에 보내요."
						: "테스트 전송은 저장된 설정으로 진행돼요. 저장한 뒤 활성화와 채널이 준비되면 보낼 수 있어요."}
				</p>
				{!testPending && testResult && (
					testResult.ok ? (
						<p className="text-xs text-success">테스트 메시지를 전송했어요. Discord 채널을 확인해 주세요.</p>
					) : (
						<p role="alert" className="text-xs text-destructive">
							{testResult.timedOut
								? "테스트 전송 결과를 확인하지 못했어요. Discord 채널을 직접 확인해 주세요."
								: (testResult.error ?? "테스트 전송에 실패했어요.")}
						</p>
					)
				)}
			</div>
		</section>
	);
}
