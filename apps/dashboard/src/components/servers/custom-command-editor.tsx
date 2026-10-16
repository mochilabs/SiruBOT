"use client";

import { useState } from "react";
import type {
	CustomCommandAccess,
	CustomCommandMethod,
	CustomCommandSpec,
	CustomCommandSpecV2,
} from "@sirubot/utils/customCommand";
import { ArrowRight, Sparkles, Wand2 } from "lucide-react";

import { type DiscordRole,RoleSelect } from "@/components/discord/role-select";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import { toApiError, toError } from "@/lib/api-error";
import type {
	CustomCommandsState,
	CustomCommandSummary,
} from "@/lib/custom-commands";
import type { DiscordRoleSummary } from "@/types/discord";

import {
	buildSpec,
	type EditorDraft,
	hasRoleAction,
	totalDelaySeconds,
	validateEditorDraft,
} from "./custom-command-editor.utils";
import { type EditorStep,PERMISSION_OPTIONS, StepsEditor } from "./custom-command-steps-editor";

type RefineTurn = { role: "user" | "assistant"; content: string };

/** 대화 기억 한도 — 최근 N턴(사용자·응답 쌍)만 보내요 */
const REFINE_MAX_TURNS = 8;

function toDiscordRole(role: DiscordRoleSummary): DiscordRole {
	return {
		id: role.id,
		name: role.name,
		color: role.color ? Number.parseInt(role.color.replace("#", ""), 16) : 0,
		position: role.position,
	};
}

interface CustomCommandEditorProps {
	guildId: string;
	/** null이면 새로 만들기 */
	command: CustomCommandSummary | null;
	/** 실행 예시 표시용 접두사 */
	prefix: string;
	onClose: () => void;
	/** 저장 성공 시 서버가 돌려준 최신 상태를 부모에 전달해요 */
	onSaved: (state: CustomCommandsState) => void;
}

/**
 * 커스텀 명령어 편집기 — 실행 방식(접두사/슬래시) 선택 + 스텝 블록 조립 + 실행 제한 +
 * AI 초안/반복 수정. 저장 전에 utils의 스펙 스키마로 검증해 봇 실행 시와 같은 규칙을 보장해요.
 * AI 수정 결과는 편집기에만 적용돼요 — 저장은 사용자가 직접 눌러야 해요.
 */
export function CustomCommandEditor({
	guildId,
	command,
	prefix,
	onClose,
	onSaved,
}: CustomCommandEditorProps) {
	const toast = useToast();
	const { roles: rawRoles } = useGuildRoles(guildId);
	const { channels } = useGuildChannels(guildId);
	const roles = (rawRoles ?? []).map(toDiscordRole);

	const [name, setName] = useState(command?.name ?? "");
	const [description, setDescription] = useState(command?.description ?? "");
	const [method, setMethod] = useState<CustomCommandMethod>(command?.method ?? "prefix");
	const [steps, setSteps] = useState<EditorStep[]>(
		command && command.spec.version === 2
			? command.spec.steps.map((step) => ({ ...step }))
			: command
				? command.spec.steps.map((step) => ({ ...step }))
				: [{ type: "send_message", text: "" }],
	);
	const [access, setAccess] = useState<CustomCommandAccess | null>(
		command && command.spec.version === 2 ? (command.spec.access ?? null) : null,
	);
	const [saving, setSaving] = useState(false);
	const [draftPrompt, setDraftPrompt] = useState("");
	const [drafting, setDrafting] = useState(false);
	const [refinePrompt, setRefinePrompt] = useState("");
	const [refining, setRefining] = useState(false);
	const [history, setHistory] = useState<RefineTurn[]>([]);

	const totalDelay = totalDelaySeconds(steps);
	const roleAction = hasRoleAction(steps);

	const draft: EditorDraft = { name, description, method, steps, access };

	const applySpec = (spec: CustomCommandSpecV2) => {
		setSteps(spec.steps.map((step) => ({ ...step })) as EditorStep[]);
		setAccess(spec.access ?? null);
	};

	const generateDraft = async () => {
		setDrafting(true);
		try {
			const res = await fetch(`/api/servers/${guildId}/custom-commands/draft`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: draftPrompt }),
			});
			if (!res.ok) throw await toApiError(res, "AI 초안 생성에 실패했어요.");
			const data = (await res.json()) as {
				draft: {
					name: string;
					description: string;
					method: CustomCommandMethod;
					spec: CustomCommandSpec;
				};
			};
			setName(data.draft.name);
			setDescription(data.draft.description);
			// 실행 방식은 새로 만들 때만 초안을 따라가요 — 수정 중에는 바뀌지 않아요
			if (!command) setMethod(data.draft.method);
			if (data.draft.spec.version === 2) applySpec(data.draft.spec);
			setHistory([]);
			toast.success(
				"초안이 준비됐어요.",
				"내용을 확인하고 저장해 주세요. 저장하지 않으면 사라져요.",
			);
		} catch (error) {
			const apiError = toError(error, "AI 초안 생성에 실패했어요.");
			toast.error(
				apiError.message,
				apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
			);
		} finally {
			setDrafting(false);
		}
	};

	const refineSpec = async () => {
		const built = buildSpec(draft);
		if (!built.ok) {
			toast.error(
				built.error,
				"AI에 맡기기 전에 스텝 구성부터 맞춰 주세요.",
			);
			return;
		}
		setRefining(true);
		try {
			const res = await fetch(
				`/api/servers/${guildId}/custom-commands/refine`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						prompt: refinePrompt,
						currentSpec: built.spec,
						history,
					}),
				},
			);
			if (!res.ok) throw await toApiError(res, "AI 수정에 실패했어요.");
			const data = (await res.json()) as { spec: CustomCommandSpecV2 };
			applySpec(data.spec);
			setHistory((prev) =>
				[
					...prev,
					{ role: "user" as const, content: refinePrompt },
					{ role: "assistant" as const, content: "스펙을 수정했어요." },
				].slice(-REFINE_MAX_TURNS * 2),
			);
			setRefinePrompt("");
			toast.success(
				"AI가 스펙을 수정했어요.",
				"변경 내용을 확인하고 저장해 주세요. 저장하지 않으면 사라져요.",
			);
		} catch (error) {
			const apiError = toError(error, "AI 수정에 실패했어요.");
			toast.error(
				apiError.message,
				apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
			);
		} finally {
			setRefining(false);
		}
	};

	const handleSave = async () => {
		const error = validateEditorDraft(draft);
		if (error) {
			toast.error(error);
			return;
		}
		const built = buildSpec(draft);
		if (!built.ok) {
			toast.error(built.error);
			return;
		}

		setSaving(true);
		try {
			const res = await fetch(
				command
					? `/api/servers/${guildId}/custom-commands/${command.id}`
					: `/api/servers/${guildId}/custom-commands`,
				{
					method: command ? "PATCH" : "POST",
					headers: { "Content-Type": "application/json" },
					// 실행 방식(method)은 생성 후 불변 — 수정 요청에는 보내지 않아요
					body: JSON.stringify(
						command
							? { name, description, spec: built.spec }
							: { name, description, method, spec: built.spec },
					),
				},
			);
			if (!res.ok) throw await toApiError(res, "저장에 실패했어요.");
			onSaved((await res.json()) as CustomCommandsState);
			const runHint =
				method === "slash"
					? `슬래시 \`/${name.trim().toLowerCase()}\`로 실행해요.`
					: `디스코드에서 \`${prefix}${name.trim().toLowerCase()}\`로 실행해요.`;
			toast.success(
				command ? "커스텀 명령어를 수정했어요." : "커스텀 명령어를 만들었어요.",
				runHint,
			);
		} catch (error) {
			const apiError = toError(error, "저장에 실패했어요.");
			toast.error(
				apiError.message,
				apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog
			open
			onOpenChange={(isOpen: boolean) => {
				if (!isOpen) onClose();
			}}
		>
			<DialogContent className="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{command ? "커스텀 명령어 수정" : "새 커스텀 명령어"}
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{/* 실행 방식 — 생성 시점에 정해지고 바뀌지 않아요 */}
					<Field
						label="실행 방식"
						description={
							command
								? "실행 방식은 만들 때 정해지고 바꿀 수 없어요. 바꾸려면 삭제 후 새로 만드세요."
								: "메시지 트리거는 채팅으로, 슬래시는 디스코드 명령어 목록으로 실행돼요."
						}
					>
						<div className="flex gap-2">
							<Button
								variant={method === "prefix" ? "primary" : "secondary"}
								size="sm"
								disabled={saving || drafting || refining || Boolean(command)}
								onClick={() => setMethod("prefix")}
							>
								{`메시지 트리거 (${prefix}이름)`}
							</Button>
							<Button
								variant={method === "slash" ? "primary" : "secondary"}
								size="sm"
								disabled={saving || drafting || refining || Boolean(command)}
								onClick={() => setMethod("slash")}
							>
								슬래시 명령어 (/이름)
							</Button>
						</div>
					</Field>

					{/* AI 초안 생성기 */}
					<div className="space-y-2 rounded-menu bg-muted/20 p-3">
						<p className="text-xs font-medium text-muted-foreground">
							AI로 초안 만들기 — 어떤 명령어인지 적으면 스텝 초안을 채워줘요.
						</p>
						<Textarea
							placeholder="예: 인사말 보내고 3초 뒤에 서버 규칙 요약 알려줘"
							value={draftPrompt}
							onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
								setDraftPrompt(e.target.value)
							}
							maxLength={500}
							disabled={drafting}
							className="min-h-12"
						/>
						<Button
							variant="secondary"
							size="sm"
							loading={drafting}
							disabled={!draftPrompt.trim() || drafting}
							icon={drafting ? undefined : <Sparkles size={16} />}
							onClick={generateDraft}
						>
							AI로 초안 생성
						</Button>
					</div>

					{/* AI 반복 수정 — 최근 대화를 기억해요 (저장은 별도) */}
					<div className="space-y-2 rounded-menu bg-muted/20 p-3">
						<p className="text-xs font-medium text-muted-foreground">
							AI로 다듬기 — 지금 스텝을 기준으로 수정해요. 저장 버튼을 눌러야 실제 반영돼요.
						</p>
						{history.length > 0 && (
							<ul className="space-y-1 text-xs text-muted-foreground">
								{history.slice(-4).map((turn, index) => (
									<li key={index}>
										<span className="font-medium text-foreground">
											{turn.role === "user" ? "지시" : "AI"}
										</span>
										{`: ${turn.content.slice(0, 60)}${turn.content.length > 60 ? "…" : ""}`}
									</li>
								))}
							</ul>
						)}
						<Textarea
							placeholder="예: 두 번째 메시지를 더 친근하게 바꿔줘"
							value={refinePrompt}
							onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
								setRefinePrompt(e.target.value)
							}
							maxLength={500}
							disabled={refining}
							className="min-h-12"
						/>
						<Button
							variant="secondary"
							size="sm"
							loading={refining}
							disabled={!refinePrompt.trim() || refining}
							icon={refining ? undefined : <Wand2 size={16} />}
							onClick={refineSpec}
						>
							AI로 수정 적용
						</Button>
					</div>

					<Field
						htmlFor="cc-name"
						label="이름"
						description={
							method === "slash"
								? "한글·영문 소문자·숫자·`-`·`_`만, 20자 이하. 슬래시 `/이름`으로 실행해요."
								: `공백 없이 20자 이하. 디스코드에서 \`${prefix}이름\`으로 실행해요. '도움말'은 예약어예요.`
						}
					>
						<Input
							id="cc-name"
							type="text"
							placeholder="예: 아침브리핑"
							value={name}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								setName(e.target.value)
							}
							maxLength={20}
							disabled={saving}
						/>
					</Field>

					<Field
						htmlFor="cc-desc"
						label={method === "slash" ? "설명 (필수)" : "설명 (선택사항)"}
						description={
							method === "slash"
								? "슬래시 명령어 목록에 보여요. 100자 이내."
								: undefined
						}
					>
						<Input
							id="cc-desc"
							type="text"
							placeholder="이 명령어가 뭘 하는지 한 줄로"
							value={description}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								setDescription(e.target.value)
							}
							maxLength={100}
							disabled={saving}
						/>
					</Field>

					{/* 실행 제한 */}
					<Field
						label="실행 제한"
						description={
							roleAction
								? "역할 변경 액션이 있어 실행 제한이 필수예요 — 아무나 실행하면 역할을 마음대로 줄 수 있어요."
								: "누가 이 명령어를 실행할 수 있는지 정해요. 기본은 모든 멤버예요."
						}
					>
						<div className="space-y-2">
							<Select
								value={access?.mode ?? "everyone"}
								onValueChange={(value: string | null) => {
									if (value === "everyone") setAccess(null);
									else if (value === "roles")
										setAccess({ mode: "roles", roleIds: [] });
									else if (value === "permissions")
										setAccess({ mode: "permissions", permissions: [] });
								}}
							>
								<SelectTrigger size="sm" aria-label="실행 제한 방식">
									<SelectValue>
										{(value: string) =>
											value === "roles"
												? "특정 역할만"
												: value === "permissions"
													? "특정 권한 보유자만"
													: "모든 멤버"
										}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="everyone">모든 멤버</SelectItem>
									<SelectItem value="roles">특정 역할만</SelectItem>
									<SelectItem value="permissions">특정 권한 보유자만</SelectItem>
								</SelectContent>
							</Select>
							{access?.mode === "roles" && (
								<RoleSelect
									roles={roles}
									value={access.roleIds ?? []}
									onChange={(roleIds) =>
										setAccess({ mode: "roles", roleIds: roleIds.slice(0, 10) })
									}
									placeholder="실행을 허용할 역할을 선택해 주세요 (하나 이상)"
									disabled={saving}
								/>
							)}
							{access?.mode === "permissions" && (
								<div className="flex flex-wrap gap-3">
									{PERMISSION_OPTIONS.map((option) => {
										const selected = access.permissions?.includes(option.value) ?? false;
										return (
											<label
												key={option.value}
												className="flex items-center gap-1.5 text-sm text-foreground"
											>
												<input
													type="checkbox"
													checked={selected}
													disabled={saving}
													onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
														const next = new Set(access.permissions ?? []);
														if (e.target.checked) next.add(option.value);
														else next.delete(option.value);
														setAccess({
															mode: "permissions",
															permissions: [...next],
														});
													}}
												/>
												{option.label}
											</label>
										);
									})}
								</div>
							)}
						</div>
					</Field>

					{/* 스텝 블록 조립 */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<p className="text-sm font-bold text-foreground">
								스텝 ({steps.length}/20)
							</p>
							<p
								className={`text-xs ${
									totalDelay > 600 ? "text-destructive" : "text-muted-foreground"
								}`}
							>
								대기 합계 {totalDelay}/600초
							</p>
						</div>
						<StepsEditor
							steps={steps}
							roles={roles}
							channels={channels ?? []}
							saving={saving || drafting || refining}
							onChange={setSteps}
						/>
						<p className="flex items-center gap-1 text-xs text-muted-foreground">
							<ArrowRight size={12} />
							{"메시지에 {argv0} {argv1} … 을 넣으면 실행자가 입력한 인수로 바뀌어요."}
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={onClose} disabled={saving}>
						취소
					</Button>
					<Button variant="primary" loading={saving} onClick={handleSave}>
						{command ? "수정 완료" : "만들기"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
