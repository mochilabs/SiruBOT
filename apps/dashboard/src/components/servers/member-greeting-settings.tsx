"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bold, Hash, ImagePlus, Loader2, Move, RotateCcw, Send, UserPlus } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Select, type SelectOption } from "@/components/overlay/select";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { Field } from "@/components/primitives/field";
import { Input, Textarea } from "@/components/primitives/input";
import { SectionLabel } from "@/components/primitives/section-label";
import { Slider } from "@/components/primitives/slider";
import { Switch } from "@/components/primitives/switch";
import { useDebounce } from "@/hooks/use-debounce";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { useMemberGreeting } from "@/hooks/use-member-greeting";
import { toApiError, toError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { ChannelTypeValue, type DiscordChannelSummary } from "@/types/discord";
import {
	DEFAULT_GREETINGS,
	GREETING_TEMPLATE_VARIABLES,
	type GreetingConfig,
	type GreetingImage,
	type GreetingKind,
	type GreetingTestResult,
	type GreetingText,
	PRESET_BACKGROUNDS} from "@/types/member-greeting";

import { InfoBox, PanelError, PanelHeader, PanelLoading, SaveBar, WarningBox } from "./settings-shared";

const TEMPLATE_MAX = 500;
const CARD_TEXT_MAX = 100;
const MAX_BACKGROUND_BYTES = 3 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp";
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
/** 카드 텍스트 색 프리셋 — 렌더러에 넘기는 사용자 데이터(hex)지, UI 스타일이 아니에요 */
const COLOR_PRESETS = ["#ffffff", "#2d1b1e", "#ff85c1", "#a3416f", "#ffe4f0"] as const;

type CardTextTarget = "title" | "subtitle";

const SECTION_META: Record<GreetingKind, { heading: string; description: string; switchLabel: string }> = {
	welcome: { heading: "환영", description: "멤버가 이 서버에 입장할 때 보내는 메시지예요.", switchLabel: "환영 메시지 보내기" },
	goodbye: { heading: "작별", description: "멤버가 이 서버에서 퇴장할 때 보내는 메시지예요.", switchLabel: "작별 메시지 보내기" }
};

const CARD_TEXT_TARGETS: readonly CardTextTarget[] = ["title", "subtitle"];

function cardTextTargetLabel(target: CardTextTarget): string {
	return target === "title" ? "제목" : "부제";
}

/** 실제 전송 시 채워지는 값의 예시를 보여줘요 (jtc 템플릿 미리보기와 같은 방식) */
function sampleTemplate(template: string): string {
	return template
		.replaceAll("{유저}", "@철수")
		.replaceAll("{유저이름}", "철수")
		.replaceAll("{서버}", "이 서버")
		.replaceAll("{멤버수}", "123");
}

const clampRatio = (value: number): number => Math.min(100, Math.max(0, value));

/** 소그룹 단일 선택(radio) 공용 키보드 이동 — 라디오의 방향키 순환이에요 */
function radioArrowKeyDown(
	items: readonly string[],
	current: string,
	onPick: (key: string) => void,
): (event: React.KeyboardEvent) => void {
	return (event) => {
		const index = items.indexOf(current);
		if (index < 0 || (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
		event.preventDefault();
		const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
		onPick(items[(index + step + items.length) % items.length]);
	};
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

interface GreetingImageEditorProps {
	guildId: string;
	kind: GreetingKind;
	config: GreetingConfig;
	image: GreetingImage;
	saving: boolean;
	/** 탭이 보일 때만 이미지 렌더를 요청해요 — 탭 셸이 패널을 마운트 유지하기 때문이에요 */
	active: boolean;
	onPatch: (next: GreetingConfig) => void;
}

/** 텍스트/배경 편집기 — 클라이언트 안의 배경 정규화(업로드) + 라이브 프리뷰 + 위치 드래그를 담당해요 */
function GreetingImageEditor({ guildId, kind, config, image, saving, active, onPatch }: GreetingImageEditorProps) {
	const toast = useToast();
	const previewBoxRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [target, setTarget] = useState<CardTextTarget>("title");
	const [uploading, setUploading] = useState(false);
	const lastPresetRef = useRef<string>(PRESET_BACKGROUNDS[0].id);

	// ── 라이브 프리뷰: draft 전체를 400ms 디바운스로 미리보기 라우트에 그려요 ──
	const [previewSrc, setPreviewSrc] = useState<string | null>(null);
	const [previewPending, setPreviewPending] = useState(false);
	const [previewFailedMessage, setPreviewFailedMessage] = useState<string | null>(null);
	const previewUrlRef = useRef<string | null>(null);
	const debouncedConfig = useDebounce(config, 400);

	useEffect(() => {
		if (!active) return;
		let cancelled = false;
		const controller = new AbortController();
		setPreviewPending(true);
		void (async () => {
			try {
				const res = await fetch(`/api/servers/${guildId}/greeting/preview`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ kind, config: debouncedConfig }),
					signal: controller.signal,
				});
				if (!res.ok) throw await toApiError(res, "미리보기를 그리지 못했어요.");
				const url = URL.createObjectURL(await res.blob());
				if (cancelled) {
					URL.revokeObjectURL(url);
					return;
				}
				if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
				previewUrlRef.current = url;
				setPreviewSrc(url);
				setPreviewFailedMessage(null);
			} catch (error) {
				if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
				setPreviewFailedMessage(toError(error, "미리보기를 그리지 못했어요.").message);
			} finally {
				if (!cancelled) setPreviewPending(false);
			}
		})();
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [active, debouncedConfig, kind, guildId]);

	// ── 배경 프리셋 썸네일 — 에디터가 열릴 때 한 번씩만 그려요 (선택 안 한 프리셋의 실제 모습) ──
	const [thumbs, setThumbs] = useState<Partial<Record<string, string | null>>>({});
	const thumbUrlsRef = useRef<string[]>([]);
	const thumbsRequestedRef = useRef(false);

	useEffect(() => {
		if (!active || thumbsRequestedRef.current) return;
		thumbsRequestedRef.current = true;
		let cancelled = false;
		void (async () => {
			for (const preset of PRESET_BACKGROUNDS) {
				try {
					const thumbConfig: GreetingConfig = {
						...config,
						useImage: true,
						image: { ...image, background: { presetId: preset.id, dataUri: null } },
					};
					const res = await fetch(`/api/servers/${guildId}/greeting/preview`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ kind, config: thumbConfig }),
					});
					if (!res.ok) throw new Error("썸네일 렌더 실패");
					const url = URL.createObjectURL(await res.blob());
					if (cancelled) {
						URL.revokeObjectURL(url);
						return;
					}
					thumbUrlsRef.current.push(url);
					setThumbs((prev) => ({ ...prev, [preset.id]: url }));
				} catch {
					if (!cancelled) setThumbs((prev) => ({ ...prev, [preset.id]: null }));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
		// 썸네일은 탭이 열린 시점의 설정 기준으로 한 번만 그려요 — 편집 중에는 다시 요청하지 않아요.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active]);

	useEffect(
		() => () => {
			if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
			for (const url of thumbUrlsRef.current) URL.revokeObjectURL(url);
		},
		[],
	);

	const patchImage = useCallback(
		(next: GreetingImage) => {
			onPatch({ ...config, useImage: true, image: next });
		},
		[config, onPatch],
	);

	const patchText = useCallback(
		(which: CardTextTarget, partial: Partial<GreetingText>) => {
			patchImage({ ...image, [which]: { ...image[which], ...partial } });
		},
		[image, patchImage],
	);

	const text = image[target];

	// ── 배경 업로드 — 클라이언트에서 형식·용량을 먼저 확인하고 라우트가 정규화를 맡겨요 ──
	const handleBackgroundPick = useCallback(
		async (file: File | null) => {
			if (!file) return;
			if (file.size > MAX_BACKGROUND_BYTES) {
				toast.error("배경 이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요.");
				return;
			}
			if (!`${ACCEPTED_IMAGE_TYPES},`.includes(`${file.type},`)) {
				toast.error("PNG, JPEG, WebP 이미지만 지원해요.");
				return;
			}
			setUploading(true);
			try {
				const form = new FormData();
				form.append("file", file);
				const res = await fetch(`/api/servers/${guildId}/greeting/background`, { method: "POST", body: form });
				if (!res.ok) throw await toApiError(res, "배경 이미지를 준비하지 못했어요.");
				const body = (await res.json()) as { dataUri?: unknown };
				if (typeof body.dataUri !== "string" || !body.dataUri.startsWith("data:image/")) {
					throw new Error("배경 응답이 올바르지 않아요.");
				}
				patchImage({ ...image, background: { presetId: null, dataUri: body.dataUri } });
				toast.success("배경 이미지를 넣었어요.", "인사 설정을 저장하면 모든 카드에 적용돼요.");
			} catch (err) {
				const apiError = toError(err, "배경 이미지를 준비하지 못했어요.");
				toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
			} finally {
				setUploading(false);
			}
		},
		[guildId, image, patchImage, toast],
	);

	return (
		<div className="space-y-5 rounded-card border border-border-subtle bg-surface-2 p-4">
			<SectionLabel>미리보기</SectionLabel>
			<div
				ref={previewBoxRef}
				className="relative mx-auto w-full max-w-sm overflow-hidden rounded-card border border-border bg-surface-2"
				style={{ aspectRatio: "1200 / 675" }}
			>
				{previewSrc ? (
					// eslint-disable-next-line @next/next/no-img-element -- data-api가 그린 PNG blob 표시예요
					<img src={previewSrc} alt={`${SECTION_META[kind].heading} 카드 미리보기`} className="h-full w-full object-cover" draggable={false} />
				) : (
					<div className="absolute inset-0 flex items-center justify-center bg-muted" role="status">
						<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
						<span className="sr-only">미리보기를 그리고 있어요</span>
					</div>
				)}
				{previewPending && previewSrc && <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
				{CARD_TEXT_TARGETS.map((which) => {
					const targetText = image[which];
					return (
						<button
							key={which}
							type="button"
							disabled={saving}
							onPointerDown={(event) => beginCardTextDrag(which, event, previewBoxRef.current, patchText)}
							onKeyDown={(event) => handleCardTextNudge(which, event, image, patchText)}
							aria-label={`${cardTextTargetLabel(which)} 위치, 드래그하거나 화살표 키로 옮겨요 (x ${targetText.x}%, y ${targetText.y}%)`}
							className={cn(
								"absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full border border-border bg-primary text-primary-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing pointer-coarse:h-11 pointer-coarse:w-11",
								target === which && "ring-2 ring-ring",
							)}
							style={{ left: `${targetText.x}%`, top: `${targetText.y}%` }}
						>
							<Move size={14} aria-hidden />
						</button>
					);
				})}
			</div>
			{previewFailedMessage && <p className="text-xs text-warning">{previewFailedMessage}</p>}

			<SectionLabel>배경</SectionLabel>
			<div className="flex flex-wrap gap-2" role="radiogroup" aria-label="카드 배경 프리셋">
				{PRESET_BACKGROUNDS.map((preset) => {
					const selected = image.background.presetId === preset.id && !image.background.dataUri;
					const thumb = thumbs[preset.id];
					// D 분류 — 프리셋 옵션 선택 행은 raw 유지 (디자인 시스템 7장 §raw button)
					return (
						<button
							key={preset.id}
							type="button"
							role="radio"
							aria-checked={selected}
							disabled={saving}
							onKeyDown={radioArrowKeyDown(
								PRESET_BACKGROUNDS.map((item) => item.id),
								image.background.presetId ?? "",
								(key) => {
									lastPresetRef.current = key;
									patchImage({ ...image, background: { presetId: key, dataUri: null } });
								},
							)}
							onClick={() => {
								lastPresetRef.current = preset.id;
								patchImage({ ...image, background: { presetId: preset.id, dataUri: null } });
							}}
							className={cn(
								"pointer-coarse:h-11 w-fit cursor-pointer rounded-control border p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								selected ? "border-primary ring-2 ring-ring/40" : "border-border hover:border-border-strong",
							)}
						>
							<span className="block h-10 w-16 overflow-hidden rounded-sm bg-primary/15">
								{thumb === undefined ? (
									<span className="flex h-full w-full items-center justify-center" aria-hidden>
										<Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
									</span>
								) : thumb ? (
									// eslint-disable-next-line @next/next/no-img-element -- data-api가 그린 PNG blob 표시예요
									<img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
								) : (
									// 썸네일을 못 그린 프리셋은 토큰 배경 사각형으로만 보여요
									<span className="h-full w-full" aria-hidden />
								)}
							</span>
							<span className="block pt-1 text-2xs font-medium text-foreground">{preset.name}</span>
						</button>
					);
				})}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<input
					ref={fileInputRef}
					type="file"
					accept={ACCEPTED_IMAGE_TYPES}
					className="sr-only"
					onChange={(event) => {
						void handleBackgroundPick(event.target.files?.[0] ?? null);
						event.target.value = "";
					}}
				/>
				<Button
					variant="secondary"
					size="sm"
					icon={<ImagePlus size={14} />}
					loading={uploading}
					onClick={() => fileInputRef.current?.click()}
					disabled={saving}
					className="pointer-coarse:h-11"
				>
					커스텀 배경 업로드
				</Button>
				{image.background.dataUri && (
					<Button
						variant="ghost"
						size="sm"
						icon={<RotateCcw size={14} />}
						onClick={() => patchImage({ ...image, background: { presetId: lastPresetRef.current, dataUri: null } })}
						disabled={saving || uploading}
						className="pointer-coarse:h-11"
					>
						커스텀 배경 초기화
					</Button>
				)}
			</div>
			<p className="text-2xs text-muted-foreground">3MB 이하 PNG·JPEG·WebP는 JPEG(긴 변 1600px)로 줄여 저장돼요.</p>

			<SectionLabel>텍스트</SectionLabel>
			<div
				role="radiogroup"
				aria-label="수정할 카드 텍스트 선택"
				className="inline-flex rounded-control border border-border bg-input p-0.5"
			>
				{CARD_TEXT_TARGETS.map((which) => (
					// D 분류 — 옵션 선택 행은 raw 유지 (디자인 시스템 7장 §raw button)
					<button
						key={which}
						type="button"
						role="radio"
						aria-checked={target === which}
						onKeyDown={radioArrowKeyDown(CARD_TEXT_TARGETS, target, (key) => setTarget(key as CardTextTarget))}
						onClick={() => setTarget(which)}
						className={cn(
							"pointer-coarse:min-h-9 cursor-pointer rounded-control px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							target === which ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
						)}
					>
						{cardTextTargetLabel(which)}
					</button>
				))}
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="내용" description="변수는 그대로 전송 시 채워져요.">
					<Input
						value={text.text}
						maxLength={CARD_TEXT_MAX}
						disabled={saving}
						onChange={(event) => patchText(target, { text: event.target.value })}
					/>
					<p className="pt-1 text-2xs text-muted-foreground">{text.text.length}/{CARD_TEXT_MAX}</p>
				</Field>
				<Field label="글자 크기">
					<Slider
						value={text.size}
						min={12}
						max={72}
						label={`${cardTextTargetLabel(target)} 글자 크기`}
						showValue
						formatValue={(value) => `${value}px`}
						disabled={saving}
						onChange={(size) => patchText(target, { size })}
					/>
				</Field>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="가로·세로 위치 (%)" description="숫자 입력은 드래그 대체 수단이에요. 카드 왼쪽 위가 0%예요.">
					<div className="flex items-center gap-2">
						<Input
							type="number"
							min={0}
							max={100}
							step={1}
							value={text.x}
							disabled={saving}
							aria-label={`${cardTextTargetLabel(target)} 가로 위치 (%)`}
							onChange={(event) => {
								const x = event.currentTarget.valueAsNumber;
								if (Number.isFinite(x)) patchText(target, { x: Math.round(clampRatio(x) * 10) / 10 });
							}}
						/>
						<Input
							type="number"
							min={0}
							max={100}
							step={1}
							value={text.y}
							disabled={saving}
							aria-label={`${cardTextTargetLabel(target)} 세로 위치 (%)`}
							onChange={(event) => {
								const y = event.currentTarget.valueAsNumber;
								if (Number.isFinite(y)) patchText(target, { y: Math.round(clampRatio(y) * 10) / 10 });
							}}
						/>
					</div>
				</Field>
				<Field label="글자 색" description="프리셋이나 HEX(#RRGGBB)으로 지정해요.">
					<div className="flex flex-wrap items-center gap-2">
						<div role="radiogroup" aria-label={`${cardTextTargetLabel(target)} 글자 색 프리셋`} className="flex items-center gap-1.5">
							{COLOR_PRESETS.map((preset) => (
								// D 분류 — 색 프리셋 옵션 행은 raw 유지 (디자인 시스템 7장 §raw button)
								<button
									key={preset}
									type="button"
									role="radio"
									aria-checked={text.color === preset}
									aria-label={`글자 색 ${preset}`}
									disabled={saving}
									onKeyDown={radioArrowKeyDown(COLOR_PRESETS, text.color, (key) => patchText(target, { color: key }))}
									onClick={() => patchText(target, { color: preset })}
									className={cn(
										"pointer-coarse:h-11 pointer-coarse:w-11 h-7 w-7 cursor-pointer rounded-full border border-border shadow-xs transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										text.color === preset && "ring-2 ring-ring",
									)}
									style={{ backgroundColor: preset }}
								/>
							))}
						</div>
						<HexColorInput value={text.color} saving={saving} onCommit={(color) => patchText(target, { color })} />
					</div>
				</Field>
			</div>

			<div className="flex flex-wrap items-center gap-4">
				<Button
					variant="state-toggle"
					active={text.bold}
					icon={<Bold size={14} />}
					onClick={() => patchText(target, { bold: !text.bold })}
					disabled={saving}
					className="pointer-coarse:h-11"
				>
					굵게
				</Button>
				<Switch
					checked={image.showAvatar}
					onChange={(checked) => patchImage({ ...image, showAvatar: checked })}
					disabled={saving}
					label="아바타 표시"
					labelPosition="left"
				/>
			</div>
		</div>
	);
}

function HexColorInput({ value, saving, onCommit }: { value: string; saving: boolean; onCommit: (color: string) => void }) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	const valid = HEX_COLOR_PATTERN.test(draft);
	return (
		<Input
			value={draft}
			maxLength={7}
			placeholder="#ffffff"
			className="w-24"
			disabled={saving}
			aria-invalid={!valid || undefined}
			aria-label="글자 색 HEX"
			onChange={(event) => {
				const raw = event.target.value;
				setDraft(raw);
				if (HEX_COLOR_PATTERN.test(raw)) onCommit(raw.toLowerCase());
			}}
		/>
	);
}

/**
 * 카드 텍스트 위치 드래그 — 핸들이 pointer capture로 움직임을 전부 받고, rAF로 상태 반영을 모아요.
 * (드래그 중엔 draft를 60fps로 갱신하지 않고 좌표만 모아서 반영해요)
 */
function beginCardTextDrag(
	which: CardTextTarget,
	event: React.PointerEvent<HTMLButtonElement>,
	box: HTMLDivElement | null,
	patchText: (which: CardTextTarget, partial: Partial<GreetingText>) => void,
) {
	if (!box) return;
	const handle = event.currentTarget;
	event.preventDefault();
	handle.setPointerCapture(event.pointerId);

	const rect = box.getBoundingClientRect();

	let point: { x: number; y: number } | null = null;
	let frame: number | null = null;

	const apply = () => {
		frame = null;
		if (!point) return;
		patchText(which, { x: Math.round(clampRatio(point.x) * 10) / 10, y: Math.round(clampRatio(point.y) * 10) / 10 });
	};

	const move = (moveEvent: PointerEvent) => {
		point = {
			x: ((moveEvent.clientX - rect.left) / rect.width) * 100,
			y: ((moveEvent.clientY - rect.top) / rect.height) * 100,
		};
		if (frame === null) frame = requestAnimationFrame(apply);
	};

	const end = () => {
		handle.removeEventListener("pointermove", move);
		handle.removeEventListener("pointerup", end);
		handle.removeEventListener("pointercancel", end);
		if (frame !== null) cancelAnimationFrame(frame);
	};

	handle.addEventListener("pointerup", end);
	handle.addEventListener("pointercancel", end);
	handle.addEventListener("pointermove", move);
}

/** 화살표 키로 위치 밀기 — Shift로 5%, 기본 1%씩이에요 */
function handleCardTextNudge(
	which: CardTextTarget,
	event: React.KeyboardEvent<HTMLButtonElement>,
	image: GreetingImage,
	patchText: (which: CardTextTarget, partial: Partial<GreetingText>) => void,
) {
	const step = event.shiftKey ? 5 : 1;
	const text = image[which];
	let next: { x: number; y: number } | null = null;
	switch (event.key) {
		case "ArrowLeft":
			next = { x: text.x - step, y: text.y };
			break;
		case "ArrowRight":
			next = { x: text.x + step, y: text.y };
			break;
		case "ArrowUp":
			next = { x: text.x, y: text.y - step };
			break;
		case "ArrowDown":
			next = { x: text.x, y: text.y + step };
			break;
		default:
			return;
	}
	event.preventDefault();
	patchText(which, { x: Math.round(clampRatio(next.x) * 10) / 10, y: Math.round(clampRatio(next.y) * 10) / 10 });
}