import {
	CUSTOM_COMMAND_MAX_STEPS,
	CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS,
	type CustomCommandAccess,
	type CustomCommandMethod,
	customCommandSpecSchemaV2,
	type CustomCommandSpecV2,
	type CustomCommandStep,
	validateCustomCommandName} from "@sirubot/utils/customCommand";

export interface EditorDraft {
	name: string;
	description: string;
	method: CustomCommandMethod;
	steps: CustomCommandStep[];
	access: CustomCommandAccess | null;
}

type StepLike = CustomCommandStep;

function walkSteps(steps: readonly StepLike[], visit: (step: StepLike) => void): void {
	for (const step of steps) {
		visit(step);
		if (step.type === "if") {
			walkSteps(step.then ?? [], visit);
			walkSteps(step.else ?? [], visit);
		}
	}
}

export function hasRoleAction(steps: readonly StepLike[]): boolean {
	let found = false;
	walkSteps(steps, (step) => {
		if (step.type === "add_role" || step.type === "remove_role") found = true;
	});
	return found;
}

export function totalDelaySeconds(steps: readonly StepLike[]): number {
	let total = 0;
	walkSteps(steps, (step) => {
		if (step.type === "delay") total += step.seconds;
	});
	return total;
}

export function buildSpec(draft: EditorDraft): { ok: true; spec: CustomCommandSpecV2 } | { ok: false; error: string } {
	const spec = customCommandSpecSchemaV2.safeParse({
		version: 2,
		...(draft.access ? { access: draft.access } : {}),
		steps: draft.steps
	});
	if (!spec.success) {
		return { ok: false, error: spec.error.issues[0]?.message ?? "스텝 구성이 올바르지 않아요." };
	}
	return { ok: true, spec: spec.data };
}

export function validateEditorDraft(draft: EditorDraft): string | null {
	const nameError = validateCustomCommandName(draft.name, draft.method);
	if (nameError) return nameError;
	if (draft.method === "slash" && draft.description.trim().length === 0) {
		return "슬래시 명령어는 설명이 필요해요 (슬래시 목록에 보여요).";
	}
	if (draft.steps.length < 1) return "스텝은 1개 이상이어야 해요.";
	if (draft.steps.length > CUSTOM_COMMAND_MAX_STEPS) return `스텝은 ${CUSTOM_COMMAND_MAX_STEPS}개 이하로 넣을 수 있어요.`;
	if (hasRoleAction(draft.steps) && (draft.access === null || draft.access.mode === "everyone")) {
		return "역할 변경 액션은 실행 제한(역할/권한)이 필요해요.";
	}
	if (totalDelaySeconds(draft.steps) > CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS) {
		return `대기 시간 합계는 ${CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS}초를 넘길 수 없어요.`;
	}
	const spec = buildSpec(draft);
	return spec.ok ? null : spec.error;
}
