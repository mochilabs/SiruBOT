// @vitest-environment happy-dom
import { act, type ReactNode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { FeatureSwitcherProvider, useFeatureSwitcher } from "./feature-switcher";

let latest: ReturnType<typeof useFeatureSwitcher> = null;
let host: Root | null = null;

async function render(node: ReactNode) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	host = createRoot(container);
	await act(async () => {
		host!.render(node);
	});
}

function Probe() {
	const switcher = useFeatureSwitcher();
	useEffect(() => {
		latest = switcher;
	});
	return null;
}

afterEach(async () => {
	await act(async () => host?.unmount());
	host = null;
	latest = null;
});

describe("FeatureSwitcherProvider", () => {
	it("헤더가 하나도 등록되지 않으면 상단 기능 버튼을 숨기지 않아요", async () => {
		await render(
			<FeatureSwitcherProvider>
				<Probe />
			</FeatureSwitcherProvider>,
		);
		expect(latest?.headerPresent).toBe(false);
	});

	it("헤더 등록 개수를 세어서 모두 해제되어야 다시 상단 버튼을 보여줘요", async () => {
		await render(
			<FeatureSwitcherProvider>
				<Probe />
			</FeatureSwitcherProvider>,
		);
		let releaseA = () => {};
		let releaseB = () => {};
		await act(async () => {
			releaseA = latest!.registerHeader();
			releaseB = latest!.registerHeader();
		});
		expect(latest?.headerPresent).toBe(true);
		await act(async () => releaseA());
		expect(latest?.headerPresent).toBe(true);
		await act(async () => releaseB());
		expect(latest?.headerPresent).toBe(false);
	});

	it("대시보드 셸 밖에서는 null이라 PanelHeader가 평범한 제목으로 그려져요", async () => {
		await render(<Probe />);
		expect(latest).toBeNull();
	});
});
