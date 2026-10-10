"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { ApiError, toApiError, toError } from "@/lib/api-error";
import type {
	GreetingConfig,
	GreetingKind,
	GreetingPair,
	GreetingTestResult,
	GreetingTestStatus
} from "@/types/member-greeting";
import { DEFAULT_GREETINGS } from "@/types/member-greeting";

type TestTicket = { kind: GreetingKind; requestId: string; at: number };

/** 봇 결과 폴링 상한 — 20초 내에 결과가 없으면 확인 실패로 정리해요 (전송 자체는 성공했을 수 있어요) */
const TEST_TIMEOUT_MS = 20_000;

function loginHref(guildId: string): string {
	return `/api/auth/signin?callbackUrl=${encodeURIComponent(`/servers/${guildId}`)}`;
}

async function greetingFetcher(url: string): Promise<GreetingPair> {
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) throw await toApiError(res, "인사 설정을 불러오지 못했어요.");
	return (await res.json()) as GreetingPair;
}

async function statusFetcher(url: string): Promise<GreetingTestStatus> {
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) throw await toApiError(res, "테스트 전송 결과를 불러오지 못했어요.");
	return (await res.json()) as GreetingTestStatus;
}

/**
 * 멤버 인사(환영/작별) 설정 편집 상태 — 종류별 draft, 저장, 테스트 전송과 결과 매칭을 한 곳에서 관리해요.
 * draft는 서버 값(없으면 공용 기본값)으로 채우고, 사용자가 건드린 종류는 백그라운드 재검증이 덮지 않아요.
 */
export function useMemberGreeting(guildId: string) {
	const router = useRouter();
	const { data: pair, error, isLoading, mutate } = useSWR<GreetingPair>(`/api/servers/${guildId}/greeting`, greetingFetcher);

	const [drafts, setDrafts] = useState<Record<GreetingKind, GreetingConfig | null>>({ welcome: null, goodbye: null });
	/** 사용자 편집 마킹 — SWR이 도착해도 편집 중인 종류는 서버 값으로 되돌리지 않아요 */
	const touchedRef = useRef({ welcome: false, goodbye: false });

	useEffect(() => {
		if (!pair) return;
		setDrafts((prev) => ({
			welcome: touchedRef.current.welcome ? prev.welcome : (pair.welcome ?? DEFAULT_GREETINGS.welcome),
			goodbye: touchedRef.current.goodbye ? prev.goodbye : (pair.goodbye ?? DEFAULT_GREETINGS.goodbye),
		}));
	}, [pair]);

	const redirectToLogin = useCallback(() => {
		router.push(loginHref(guildId));
	}, [router, guildId]);

	const patchKind = useCallback((kind: GreetingKind, next: GreetingConfig) => {
		touchedRef.current[kind] = true;
		setDrafts((prev) => ({ ...prev, [kind]: next }));
	}, []);

	const [saving, setSaving] = useState(false);
	const save = useCallback(async (): Promise<GreetingPair | null> => {
		if (!drafts.welcome || !drafts.goodbye) return null;
		setSaving(true);
		try {
			const res = await fetch(`/api/servers/${guildId}/greeting`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ welcome: drafts.welcome, goodbye: drafts.goodbye }),
			});
			if (!res.ok) {
				const apiError = await toApiError(res, "인사 설정을 저장하지 못했어요.");
				if (apiError.status === 401) redirectToLogin();
				throw apiError;
			}
			const saved = (await res.json()) as GreetingPair;
			await mutate(saved, { revalidate: false });
			touchedRef.current = { welcome: false, goodbye: false };
			return saved;
		} finally {
			setSaving(false);
		}
	}, [drafts, guildId, mutate, redirectToLogin]);

	// ── 테스트 전송: 종류별 진행 티켓(requestId) → 결과 상태 폴링 → requestId 매칭으로 정리 ──
	const [tickets, setTickets] = useState<TestTicket[]>([]);
	const [testResults, setTestResults] = useState<Record<GreetingKind, GreetingTestResult | null>>({
		welcome: null,
		goodbye: null,
	});

	const polling = tickets.length > 0;
	const { data: status, mutate: mutateStatus } = useSWR<GreetingTestStatus>(
		polling ? `/api/servers/${guildId}/greeting/status` : null,
		statusFetcher,
		{ refreshInterval: 1_000 },
	);

	useEffect(() => {
		if (!polling) return;
		const now = Date.now();
		const resolve = (ticket: TestTicket, result: GreetingTestResult) => {
			setTestResults((prev) => ({ ...prev, [ticket.kind]: result }));
		};
		const remove = (matched: TestTicket[]) => {
			setTickets((prev) => prev.filter((t) => !matched.includes(t)));
		};

		// 상태 도착 전에도 티켓이 시간을 넘길 수 있어요 — 확인 실패로 솔직하게 정리해요.
		const matched = status?.found && status.requestId ? tickets.filter((t) => status.requestId === t.requestId) : [];
		const expired = tickets.filter((t) => now - t.at > TEST_TIMEOUT_MS);

		if (matched.length > 0) {
			for (const ticket of matched) {
				const ok = status?.ok === true;
				resolve(ticket, { ok, error: ok ? null : (status?.error ?? "테스트 전송에 실패했어요.") });
			}
			remove(matched);
			return;
		}
		if (expired.length > 0) {
			for (const ticket of expired) {
				resolve(ticket, { ok: false, error: "테스트 전송 결과를 확인하지 못했어요. Discord 채널을 직접 확인해 주세요.", timedOut: true });
			}
			remove(expired);
		}
	}, [polling, status, tickets]);

	const startTest = useCallback(
		async (kind: GreetingKind): Promise<void> => {
			const res = await fetch(`/api/servers/${guildId}/greeting/test`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind }),
			});
			if (!res.ok) {
				const apiError = await toApiError(res, "테스트 전송을 요청하지 못했어요.");
				if (apiError.status === 401) redirectToLogin();
				throw apiError;
			}
			const body = (await res.json()) as { requestId?: unknown };
			const requestId = body.requestId;
			if (typeof requestId !== "string" || requestId.length === 0) {
				throw new ApiError("테스트 전송 요청이 반영되지 않았어요. 잠시 후 다시 시도해 주세요.", true);
			}
			setTestResults((prev) => ({ ...prev, [kind]: null }));
			setTickets((prev) => [...prev, { kind, requestId, at: Date.now() }]);
			// dedupingInterval(5초)로 진행 요청 마커가 남는 걸 우회해요 (useGuildSettings 주석 참고)
			void mutateStatus();
		},
		[guildId, mutateStatus, redirectToLogin],
	);

	return {
		/** 저장된 설정(없으면 null — UI가 기본값을 깔아요) */
		pair: pair,
		drafts,
		error: error ? toError(error, "인사 설정을 불러오지 못했어요.") : null,
		isLoading,
		saving,
		save,
		patchKind,
		/** 종류별 진행 중 테스트 여부 */
		testPending: (kind: GreetingKind) => tickets.some((ticket) => ticket.kind === kind),
		testResults,
		startTest,
		reload: useCallback(() => {
			// bound mutate()는 실패 직후 재시도가 묵살되지 않게 진행 요청 마커를 지우고 재검증해요.
			void mutate();
		}, [mutate]),
	};
}