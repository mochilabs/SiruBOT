import { describe, expect, it } from "vitest";

import {
	buildSpec,
	type EditorDraft,
	hasRoleAction,
	slashSlotWarning,
	totalDelaySeconds,
	validateEditorDraft,
} from "./custom-command-editor.utils";

const ROLE_STEP = { type: "add_role", roleId: "123456789012345678" } as const;

function draft(overrides: Partial<EditorDraft> = {}): EditorDraft {
	return {
		name: "아침브리핑",
		description: "",
		method: "prefix",
		steps: [{ type: "send_message", text: "안녕" }],
		access: null,
		...overrides,
	};
}

describe("hasRoleAction / totalDelaySeconds", () => {
	it("finds role actions and counts delays inside if branches", () => {
		const steps = [
			{ type: "delay", seconds: 3 },
			{
				type: "if",
				condition: { kind: "has_role", roleId: "123456789012345678" },
				then: [{ type: "delay", seconds: 4 }, ROLE_STEP],
				else: [{ type: "pin_message" }],
			},
		] as never[];
		expect(hasRoleAction(steps)).toBe(true);
		expect(totalDelaySeconds(steps)).toBe(7);
		expect(hasRoleAction([{ type: "send_message", text: "x" }])).toBe(false);
	});
});

describe("validateEditorDraft", () => {
	it("validates name rules per method", () => {
		expect(validateEditorDraft(draft({ name: "" }))).toBeTruthy();
		expect(validateEditorDraft(draft({ name: "Greet", method: "slash", description: "d" }))).toBeTruthy();
		expect(validateEditorDraft(draft({ name: "아침브리핑", method: "slash", description: "" }))).toBeTruthy();
		expect(validateEditorDraft(draft())).toBeNull();
		expect(validateEditorDraft(draft({ name: "greet", method: "slash", description: "d" }))).toBeNull();
	});

	it("requires access control when role actions exist", () => {
		expect(validateEditorDraft(draft({ steps: [ROLE_STEP] }))).toContain("실행 제한");
		expect(
			validateEditorDraft(
				draft({ steps: [ROLE_STEP], access: { mode: "roles", roleIds: ["999000000000000001"] } }),
			),
		).toBeNull();
	});

	it("rejects empty steps and oversized total delays", () => {
		expect(validateEditorDraft(draft({ steps: [] }))).toBeTruthy();
		const longWait = [
			{ type: "delay", seconds: 300 },
			{ type: "delay", seconds: 300 },
			{ type: "delay", seconds: 1 },
		] as never[];
		expect(validateEditorDraft(draft({ steps: longWait }))).toContain("대기 시간");
	});
});

describe("buildSpec", () => {
	it("builds a v2 spec with access only when set", () => {
		const withoutAccess = buildSpec(draft());
		expect(withoutAccess.ok).toBe(true);
		if (withoutAccess.ok) expect(withoutAccess.spec.access).toBeUndefined();
		const withAccess = buildSpec(draft({ access: { mode: "roles", roleIds: ["999000000000000001"] } }));
		expect(withAccess.ok).toBe(true);
		if (withAccess.ok) expect(withAccess.spec.access?.mode).toBe("roles");
	});
});

describe("slashSlotWarning", () => {
	it("warns only for slash method at capacity", () => {
		expect(slashSlotWarning(20, 20, "slash")).toContain("가득");
		expect(slashSlotWarning(19, 20, "slash")).toBeNull();
		expect(slashSlotWarning(20, 20, "prefix")).toBeNull();
	});
});
