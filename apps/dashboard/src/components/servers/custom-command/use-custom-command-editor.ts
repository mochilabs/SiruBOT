import { useState } from "react";
import type {
	CustomCommandAccess,
	CustomCommandMethod,
	CustomCommandSpecV2,
} from "@sirubot/utils/customCommand";

import { useToast } from "@/components/ui/toast";
import { toApiError, toError } from "@/lib/api-error";
import type {
	CustomCommandsState,
	CustomCommandSummary,
} from "@/lib/custom-commands";

import {
	buildSpec,
	type EditorDraft,
	validateEditorDraft,
} from "./custom-command-editor.utils";
import type { EditorStep } from "./custom-command-steps-editor";

export interface CustomCommandEditorState {
	name: string;
	description: string;
	method: CustomCommandMethod;
	steps: EditorStep[];
	access: CustomCommandAccess | null;
	setName: (next: string) => void;
	setDescription: (next: string) => void;
	setMethod: (next: CustomCommandMethod) => void;
	setSteps: (next: EditorStep[]) => void;
	setAccess: (next: CustomCommandAccess | null) => void;
	/** 저장 payload를 만들기 전의 편집 값 봉투 */
	draft: EditorDraft;
	/** AI가 돌려준 스펙을 폼(스텝·실행 제한)에 반영해요 */
	applySpec: (spec: CustomCommandSpecV2) => void;
	/** AI 초안의 이름·설명·실행 방식을 폼에 반영해요 — 실행 방식은 새로 만들 때만 따라가요 */
	applyDraftMetadata: (meta: { name: string; description: string; method: CustomCommandMethod }) => void;
	saving: boolean;
	handleSave: () => Promise<void>;
}

/**
 * 커스텀 명령어 편집기의 폼 상태 + 저장 — 이름·설명·실행 방식·스텝·실행 제한을 들고,
 * 검증(utils의 봇 실행 규칙) 후 생성(POST)/수정(PATCH)으로 저장해요.
 */
export function useCustomCommandEditor({
	guildId,
	command,
	prefix,
	onSaved,
}: {
	guildId: string;
	/** null이면 새로 만들기 */
	command: CustomCommandSummary | null;
	/** 실행 예시 표시용 접두사 */
	prefix: string;
	/** 저장 성공 시 서버가 돌려준 최신 상태를 부모에 전달해요 */
	onSaved: (state: CustomCommandsState) => void;
}): CustomCommandEditorState {
	const toast = useToast();

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

	const draft: EditorDraft = { name, description, method, steps, access };

	const applySpec = (spec: CustomCommandSpecV2) => {
		setSteps(spec.steps.map((step) => ({ ...step })) as EditorStep[]);
		setAccess(spec.access ?? null);
	};

	const applyDraftMetadata = (meta: { name: string; description: string; method: CustomCommandMethod }) => {
		setName(meta.name);
		setDescription(meta.description);
		// 실행 방식은 새로 만들 때만 초안을 따라가요 — 수정 중에는 바뀌지 않아요
		if (!command) setMethod(meta.method);
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

	return {
		name,
		description,
		method,
		steps,
		access,
		setName,
		setDescription,
		setMethod,
		setSteps,
		setAccess,
		draft,
		applySpec,
		applyDraftMetadata,
		saving,
		handleSave,
	};
}
