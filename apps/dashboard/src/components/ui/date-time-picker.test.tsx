// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { DateTimePicker, TimePicker } from "./date-time-picker";

let host: Root | null = null;
let changes: string[] = [];

function Harness({ initial, min, max }: { initial: string; min?: string; max?: string }) {
	const [value, setValue] = useState(initial);
	return (
		<DateTimePicker
			id="dt"
			value={value}
			min={min}
			max={max}
			onChange={(next) => {
				changes.push(next);
				setValue(next);
			}}
		/>
	);
}

function TimeHarness({ initial }: { initial: string }) {
	const [value, setValue] = useState(initial);
	return (
		<TimePicker
			id="tm"
			value={value}
			onChange={(next) => {
				changes.push(next);
				setValue(next);
			}}
		/>
	);
}

async function mount(node: React.ReactNode) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	host = createRoot(container);
	await act(async () => host!.render(node));
}

const click = (element: Element | null) => act(async () => (element as HTMLElement).click());
const open = (id: string) => click(document.getElementById(id));
const dayButton = (date: string) => document.querySelector<HTMLElement>(`[data-date="${date}"]`);
const option = (list: string, value: number) =>
	document.querySelector<HTMLElement>(`[role="listbox"][aria-label="${list}"] [data-value="${value}"]`);

afterEach(async () => {
	await act(async () => host?.unmount());
	host = null;
	changes = [];
	document.body.innerHTML = "";
});

describe("DateTimePicker", () => {
	it("기본 입력 대신 직접 만든 버튼이고 값을 표기로 보여줘요", async () => {
		await mount(<Harness initial="2026-11-25T21:05" />);
		const trigger = document.getElementById("dt")!;
		expect(trigger.tagName).toBe("BUTTON");
		expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
		expect(trigger.textContent).toContain("2026. 11. 25. (수) 21:05");
	});

	it("값이 없으면 자리 안내를 보여줘요", async () => {
		await mount(<Harness initial="" />);
		expect(document.getElementById("dt")!.textContent).toContain("날짜와 시간을 선택해 주세요");
	});

	it("날짜를 누르면 시각은 그대로 두고 날짜만 바꿔요", async () => {
		await mount(<Harness initial="2026-11-25T21:05" />);
		await open("dt");
		await click(dayButton("2026-11-28"));
		expect(changes.at(-1)).toBe("2026-11-28T21:05");
	});

	it("시와 분을 골라요", async () => {
		await mount(<Harness initial="2026-11-25T21:05" />);
		await open("dt");
		await click(option("시", 7));
		expect(changes.at(-1)).toBe("2026-11-25T07:05");
		await click(option("분", 30));
		expect(changes.at(-1)).toBe("2026-11-25T07:30");
	});

	it("다음 달 버튼으로 달을 넘기고 그 달 날짜를 골라요", async () => {
		await mount(<Harness initial="2026-11-25T21:05" />);
		await open("dt");
		await click(document.querySelector('[aria-label="다음 달"]'));
		expect(document.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("2026년 12월");
		await click(dayButton("2026-12-10"));
		expect(changes.at(-1)).toBe("2026-12-10T21:05");
	});

	it("min 이전과 max 이후 날짜는 눌러도 바뀌지 않아요", async () => {
		await mount(<Harness initial="2026-11-25T21:05" min="2026-11-20T00:00" max="2026-11-30T23:59" />);
		await open("dt");
		await click(dayButton("2026-11-19"));
		await click(dayButton("2026-12-01"));
		expect(changes).toEqual([]);
		expect(dayButton("2026-11-19")?.getAttribute("aria-disabled")).toBe("true");
		await click(dayButton("2026-11-22"));
		expect(changes.at(-1)).toBe("2026-11-22T21:05");
	});

	it("범위 경계 날짜로 옮기면 시각을 범위 안으로 맞춰요", async () => {
		await mount(<Harness initial="2026-11-25T08:00" min="2026-11-20T10:30" />);
		await open("dt");
		await click(dayButton("2026-11-20"));
		expect(changes.at(-1)).toBe("2026-11-20T10:30");
	});

	it("달력에서 방향키로 하루씩 옮기고 PageDown으로 달을 넘겨요", async () => {
		await mount(<Harness initial="2026-11-25T21:05" />);
		await open("dt");
		const selected = dayButton("2026-11-25")!;
		selected.focus();
		await act(async () => {
			selected.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		});
		expect(document.activeElement).toBe(dayButton("2026-11-26"));
		await act(async () => {
			document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
		});
		expect(document.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("2026년 12월");
		expect(document.activeElement).toBe(dayButton("2026-12-26"));
	});

	it("고른 날짜는 aria-selected로 표시돼요", async () => {
		await mount(<Harness initial="2026-11-25T21:05" />);
		await open("dt");
		expect(dayButton("2026-11-25")?.parentElement?.getAttribute("aria-selected")).toBe("true");
		expect(dayButton("2026-11-24")?.parentElement?.getAttribute("aria-selected")).toBe("false");
	});
});

describe("TimePicker", () => {
	it("기본 time 입력 없이 HH:mm을 골라요", async () => {
		await mount(<TimeHarness initial="09:00" />);
		expect(document.querySelector('input[type="time"]')).toBeNull();
		expect(document.getElementById("tm")!.textContent).toContain("09:00");
		await open("tm");
		await click(option("시", 18));
		expect(changes.at(-1)).toBe("18:00");
		await click(option("분", 45));
		expect(changes.at(-1)).toBe("18:45");
	});
});
