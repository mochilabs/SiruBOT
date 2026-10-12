// @vitest-environment happy-dom
// PR #54 적대적 감사에서 발견한 결함群(F-1/F-2/F-6)의 회귀 방지 계약 테스트예요.
// - F-1: useToast()가 Provider 없이도 동작해야 한다 (모듈 매니저 계약, player 페이지 크래시 재발 방지)
// - F-2: 전역 <Toaster />가 토스트를 실제 DOM으로 렌더하는가 (페이지별 Provider 무음)
// - F-6: useToast() 반환 참조가 불변인가 (토스트 방송마다 이펙트 재실행 루프)
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { toast, Toaster, useToast } from "./toast";

let host: Root | null = null;
let container: HTMLElement | null = null;

async function mount(node: ReactNode) {
	container = document.createElement("div");
	document.body.appendChild(container);
	host = createRoot(container);
	await act(async () => {
		host!.render(node);
	});
}

async function closeToast(id?: string) {
	if (!id) return;

	await act(async () => {
		toast.close(id);
	});
}

afterEach(async () => {
	if (host) {
		await act(async () => {
			host!.unmount();
		});
	}

	container?.remove();
	host = null;
	container = null;
});

function ToastConsumerWithoutProvider() {
	useToast();
	return null;
}

describe("toast 계약", () => {
	it("useToast는 Provider 없이도 동작한다(모듈 매니저) — /player/[id] 크래시 재발 방지(F-1)", () => {
		expect(() => renderToString(<ToastConsumerWithoutProvider />)).not.toThrow();
	});

	it("전역 <Toaster />가 toast.success를 실제 DOM으로 렌더한다 — 무음 회귀 방지(F-2)", async () => {
		await mount(<Toaster />);

		let id: string | undefined;
		await act(async () => {
			id = toast.success("저장했어요.");
		});

		expect(document.querySelector('[data-slot="toast-viewport"]')).not.toBeNull();
		expect(document.body.textContent).toContain("저장했어요.");

		await closeToast(id);
	});

	it("useToast 반환 참조는 불변이다 — 토스트 방송마다 이펙트가 재실행되지 않는다(F-6)", async () => {
		const before = useToast();

		let id: string | undefined;
		await act(async () => {
			id = toast.success("참조 안정성 확인");
		});

		// 토스트 방송 전후로 useToast()의 정체가 같아야 해요.
		expect(useToast()).toBe(before);
		await closeToast(id);
	});

	it("페이지별 ToastProvider는 금지, <Toaster>는 Providers.tsx에만(F-1/F-2 구조 트립와이어)", () => {
		const offenders: string[] = [];
		const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

		// 주석은 코드가 아니니까 떼고 스캔해요 — 문서로 쓰인 <Toaster /> 언급은 무해해요.
		const stripComments = (source: string) =>
			source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

		const walk = (dir: string) => {
			for (const entry of readdirSync(dir)) {
				const full = path.join(dir, entry);
				if (statSync(full).isDirectory()) {
					walk(full);
					continue;
				}

				if (!/\.(tsx|ts)$/.test(entry) || full.endsWith("ui/toast.tsx") || full.endsWith("toast.test.tsx")) continue;
				const source = stripComments(readFileSync(full, "utf8"));
				if (/ToastProvider/.test(source)) offenders.push(full);
				if (/<Toaster[ />]/.test(source) && !full.endsWith("components/Providers.tsx")) {
					offenders.push(full);
				}
			}
		};

		walk(srcDir);
		expect(offenders).toEqual([]);
	});
});