"use client";

import type {
	CustomCommandIfCondition,
	CustomCommandStep,
} from "@sirubot/utils/customCommand";
import {
	CUSTOM_COMMAND_IF_MAX_SUB_STEPS,
	CUSTOM_COMMAND_MAX_ARGS,
	CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS,
} from "@sirubot/utils/customCommand";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { type DiscordRole, RoleSelect } from "@/components/discord/role-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DiscordChannelSummary } from "@/types/discord";

import { CustomCommandDesigner } from "./custom-command-designer";

export type EditorStep = CustomCommandStep;
/** if 서브 스텝(then/else)에 들어갈 수 있는 타입 — 중첩 if는 없어요 */
export type EditorSubStep = Exclude<CustomCommandStep, { type: "if" }>;

/** 편집기 배열 → 서브 스텝 배열 (중첩 if는 구조상 생길 수 없어 걸러내요) */
function toSubSteps(steps: EditorStep[]): EditorSubStep[] {
	return steps.filter((step) => step.type !== "if") as EditorSubStep[];
}

const STEP_TYPE_OPTIONS: Array<{ value: EditorStep["type"]; label: string }> = [
	{ value: "send_message", label: "메시지 전송" },
	{ value: "delay", label: "대기" },
	{ value: "add_role", label: "역할 부여" },
	{ value: "remove_role", label: "역할 제거" },
	{ value: "add_reaction", label: "반응 추가" },
	{ value: "pin_message", label: "메시지 고정" },
	{ value: "delete_trigger", label: "트리거 삭제" },
	{ value: "if", label: "조건부 (if)" },
];

const CONDITION_OPTIONS: Array<{ value: CustomCommandIfCondition["kind"]; label: string }> = [
	{ value: "has_role", label: "실행자가 역할 보유" },
	{ value: "channel_match", label: "이 채널에서 실행됨" },
	{ value: "arg_matches", label: "인수 값 일치" },
];

const PERMISSION_OPTIONS: Array<{ value: "ManageRoles" | "ManageChannels" | "ManageMessages" | "Administrator"; label: string }> = [
	{ value: "ManageRoles", label: "역할 관리" },
	{ value: "ManageChannels", label: "채널 관리" },
	{ value: "ManageMessages", label: "메시지 관리" },
	{ value: "Administrator", label: "관리자" },
];
export { PERMISSION_OPTIONS };

/** 스텝 종류별 시작값 */
export function createStep(type: EditorStep["type"]): EditorStep {
	switch (type) {
		case "send_message":
			return { type: "send_message", text: "" };
		case "delay":
			return { type: "delay", seconds: 5 };
		case "add_role":
		case "remove_role":
			return { type, roleId: "" };
		case "add_reaction":
			return { type: "add_reaction", emoji: "🎉" };
		case "pin_message":
			return { type: "pin_message" };
		case "delete_trigger":
			return { type: "delete_trigger", afterSeconds: 5 };
		case "if":
			return {
				type: "if",
				condition: { kind: "has_role", roleId: "" },
				then: [createStep("send_message") as EditorSubStep],
			};
	}
}

interface StepsEditorProps {
	guildId: string;
	steps: EditorStep[];
	roles: DiscordRole[];
	channels: DiscordChannelSummary[];
	saving: boolean;
	onChange: (steps: EditorStep[]) => void;
	/** if 서브 스텝 목록 — 여기서는 if를 또 넣을 수 없어요 */
	nested?: boolean;
}

/** 스텝 블록 조립 — 종류별 필드 + 순서 변경 + if 서브 스텝 편집 */
export function StepsEditor({
	guildId,
	steps,
	roles,
	channels,
	saving,
	onChange,
	nested = false,
}: StepsEditorProps) {
	const limit = nested ? CUSTOM_COMMAND_IF_MAX_SUB_STEPS : 20;

	const updateStep = (index: number, next: EditorStep) => {
		onChange(steps.map((step, i) => (i === index ? next : step)));
	};

	const moveStep = (index: number, delta: -1 | 1) => {
		const target = index + delta;
		if (target < 0 || target >= steps.length) return;
		const next = [...steps];
		const [moved] = next.splice(index, 1);
		next.splice(target, 0, moved!);
		onChange(next);
	};

	const removeStep = (index: number) => {
		onChange(steps.filter((_, i) => i !== index));
	};

	const typeOptions = nested
		? STEP_TYPE_OPTIONS.filter((option) => option.value !== "if")
		: STEP_TYPE_OPTIONS;

	return (
		<div className="space-y-2">
			{steps.map((step, index) => (
				<div key={index} className="flex items-start gap-2 rounded-menu bg-surface-2 p-3">
					<div className="flex flex-col gap-1">
						<Button
							variant="icon"
							size="icon-xs"
							aria-label="위로 이동"
							disabled={index === 0 || saving}
							icon={<ArrowUp size={14} />}
							onClick={() => moveStep(index, -1)}
						/>
						<Button
							variant="icon"
							size="icon-xs"
							aria-label="아래로 이동"
							disabled={index === steps.length - 1 || saving}
							icon={<ArrowDown size={14} />}
							onClick={() => moveStep(index, 1)}
						/>
					</div>
					<div className="min-w-0 flex-1 space-y-2">
						<Select
							value={step.type}
							onValueChange={(value: string | null) => {
								if (value === step.type) return;
								if (
									!typeOptions.some(
										(option) => option.value === value,
									)
								)
									return;
								updateStep(index, createStep(value as EditorStep["type"]));
							}}
						>
							<SelectTrigger size="sm" aria-label="스텝 종류">
								<SelectValue>
									{(value: string) =>
										STEP_TYPE_OPTIONS.find((option) => option.value === value)
											?.label ?? value
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{typeOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<StepFields
							guildId={guildId}
							step={step}
							roles={roles}
							channels={channels}
							saving={saving}
							onChange={(next) => updateStep(index, next)}
						/>
					</div>
					<Button
						variant="icon"
						size="icon-xs"
						aria-label="스텝 삭제"
						disabled={saving}
						icon={<Trash2 size={14} />}
						onClick={() => removeStep(index)}
					/>
				</div>
			))}

			<Button
				variant="secondary"
				size="sm"
				disabled={steps.length >= limit || saving}
				icon={<Plus size={16} />}
				onClick={() => onChange([...steps, createStep("send_message")])}
			>
				{nested ? "조건부 스텝 추가" : "스텝 추가"}
			</Button>
		</div>
	);
}

interface StepFieldsProps {
	guildId: string;
	step: EditorStep;
	roles: DiscordRole[];
	channels: DiscordChannelSummary[];
	saving: boolean;
	onChange: (step: EditorStep) => void;
}

function StepFields({ guildId, step, roles, channels, saving, onChange }: StepFieldsProps) {
	switch (step.type) {
		case "send_message":
			return step.design ? (
				<CustomCommandDesigner
					guildId={guildId}
					design={step.design}
					saving={saving}
					onChange={(design) => onChange({ type: "send_message", design })}
				/>
			) : (
				<div className="space-y-2">
					<Textarea
						placeholder="보낼 메시지 (디스코드 마크다운, {argv0} 인수 치환, 멘션은 무시돼요)"
						value={step.text ?? ""}
						onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
							onChange({ type: "send_message", text: e.target.value })
						}
						maxLength={2000}
						disabled={saving}
						className="min-h-12"
					/>
					<Button
						variant="ghost"
						size="sm"
						disabled={saving}
						onClick={() =>
							onChange({
								type: "send_message",
								design: { accentColor: "blue", items: [{ kind: "text", content: step.text ?? "" }] },
							})
						}
					>
						디자인 메시지로 꾸미기
					</Button>
				</div>
			);
		case "delay":
			return (
				<Input
					type="number"
					min={1}
					max={CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS}
					value={step.seconds}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
						onChange({ type: "delay", seconds: Number(e.target.value) || 1 })
					}
					disabled={saving}
				/>
			);
		case "add_role":
		case "remove_role":
			return (
				<RoleSelect
					roles={roles}
					value={step.roleId ? [step.roleId] : []}
					onChange={(roleIds) =>
						onChange({ type: step.type, roleId: roleIds[0] ?? "" })
					}
					placeholder="대상 역할을 선택해 주세요"
					disabled={saving}
				/>
			);
		case "add_reaction":
			return (
				<Input
					type="text"
					placeholder="이모지 (예: 🎉 또는 서버 이모지)"
					value={step.emoji}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
						onChange({ type: "add_reaction", emoji: e.target.value })
					}
					maxLength={100}
					disabled={saving}
				/>
			);
		case "pin_message":
			return (
				<p className="text-xs text-muted-foreground">
					실행을 유발한 메시지를 채널에 고정해요.
				</p>
			);
		case "delete_trigger":
			return (
				<Input
					type="number"
					min={1}
					max={60}
					value={step.afterSeconds}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
						onChange({
							type: "delete_trigger",
							afterSeconds: Number(e.target.value) || 1,
						})
					}
					disabled={saving}
				/>
			);
		case "if":
			return (
				<div className="space-y-2 rounded-menu bg-muted/20 p-3">
					<p className="text-xs font-medium text-muted-foreground">
						조건이 맞으면 위쪽 블록을, 아니면 아래쪽 블록을 실행해요 (중첩 불가)
					</p>
					<Select
						value={step.condition.kind}
						onValueChange={(value: string | null) => {
							if (value === "has_role") {
								onChange({
									type: "if",
									condition: { kind: "has_role", roleId: "" },
									then: step.then,
									...(step.else ? { else: step.else } : {}),
								});
							} else if (value === "channel_match") {
								onChange({
									type: "if",
									condition: { kind: "channel_match", channelId: "" },
									then: step.then,
									...(step.else ? { else: step.else } : {}),
								});
							} else if (value === "arg_matches") {
								onChange({
									type: "if",
									condition: { kind: "arg_matches", index: 0, value: "" },
									then: step.then,
									...(step.else ? { else: step.else } : {}),
								});
							}
						}}
					>
						<SelectTrigger size="sm" aria-label="조건 종류">
							<SelectValue>
								{(value: string) =>
									CONDITION_OPTIONS.find((option) => option.value === value)
										?.label ?? value
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{CONDITION_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{step.condition.kind === "has_role" && (
						<RoleSelect
							roles={roles}
							value={step.condition.roleId ? [step.condition.roleId] : []}
							onChange={(roleIds) =>
								onChange({
									type: "if",
									condition: { kind: "has_role", roleId: roleIds[0] ?? "" },
									then: step.then,
									...(step.else ? { else: step.else } : {}),
								})
							}
							placeholder="확인할 역할을 선택해 주세요"
							disabled={saving}
						/>
					)}
					{step.condition.kind === "channel_match" && (
						<Select
							value={step.condition.channelId}
							onValueChange={(value: string | null) =>
								onChange({
									type: "if",
									condition: {
										kind: "channel_match",
										channelId: value ?? "",
									},
									then: step.then,
									...(step.else ? { else: step.else } : {}),
								})
							}
						>
							<SelectTrigger size="sm" aria-label="확인할 채널">
								<SelectValue placeholder="확인할 채널을 선택해 주세요">
									{(value: string) =>
										`#${
											channels.find((channel) => channel.id === value)?.name ??
											value
										}`
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{channels.map((channel) => (
									<SelectItem key={channel.id} value={channel.id}>
										#{channel.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					{step.condition.kind === "arg_matches" && (
						<div className="flex items-center gap-2">
							<Select
								value={String(step.condition.index)}
								onValueChange={(value: string | null) =>
									onChange({
										type: "if",
										condition: {
											kind: "arg_matches",
											index: Number(value ?? "0"),
											value: step.condition.kind === "arg_matches" ? step.condition.value : "",
										},
										then: step.then,
										...(step.else ? { else: step.else } : {}),
									})
								}
							>
								<SelectTrigger size="sm" aria-label="인수 번호">
									<SelectValue>
										{(value: string) => `인수 ${Number(value) + 1}`}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{Array.from({ length: CUSTOM_COMMAND_MAX_ARGS }, (_, i) => (
										<SelectItem key={i} value={String(i)}>
											{`인수 ${i + 1}`}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Input
								type="text"
								placeholder="비교할 값"
								value={step.condition.value}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									onChange({
										type: "if",
										condition: {
											kind: "arg_matches",
											index: step.condition.kind === "arg_matches" ? step.condition.index : 0,
											value: e.target.value,
										},
										then: step.then,
										...(step.else ? { else: step.else } : {}),
									})
								}
								maxLength={100}
								disabled={saving}
							/>
						</div>
					)}

					<p className="text-xs font-medium text-foreground">조건이 맞을 때</p>
					<StepsEditor
						guildId={guildId}
						steps={step.then as EditorStep[]}
						roles={roles}
						channels={channels}
						saving={saving}
						nested
						onChange={(then) =>
							onChange({
								type: "if",
								condition: step.condition,
								then: toSubSteps(then),
								...(step.else ? { else: step.else } : {}),
							})
						}
					/>

					<p className="text-xs font-medium text-foreground">조건이 아닐 때 (선택)</p>
					<StepsEditor
						guildId={guildId}
						steps={(step.else ?? []) as EditorStep[]}
						roles={roles}
						channels={channels}
						saving={saving}
						nested
						onChange={(elseSteps) =>
							onChange({
								type: "if",
								condition: step.condition,
								then: step.then,
								...(elseSteps.length > 0 ? { else: toSubSteps(elseSteps) } : {}),
							})
						}
					/>
				</div>
			);
	}
}
