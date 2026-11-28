"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_GREETINGS, type GreetingConfig, type GreetingKind } from "@sirubot/utils/memberGreeting";
import useSWR from "swr";

import { ApiError, toApiError, toError } from "@/lib/api-error";
import { createApiFetcher, useGuildResource } from "@/lib/swr";
import type { GreetingPair, GreetingTestResult, GreetingTestStatus } from "@/types/member-greeting";

type TestTicket = { kind: GreetingKind; requestId: string; at: number };

const TEST_TIMEOUT_MS = 20_000;

const greetingFetcher = createApiFetcher<GreetingPair>("인사 설정을 불러오지 못했어요.");
const statusFetcher = createApiFetcher<GreetingTestStatus>("테스트 전송 결과를 불러오지 못했어요.");

export function useMemberGreeting(guildId: string) {
	const { data: pair, error, isLoading, mutate, guildUrl, redirectToLogin } = useGuildResource<GreetingPair>(guildId, "/greeting", {
		fetcher: greetingFetcher,
	});

	const [drafts, setDrafts] = useState<Record<GreetingKind, GreetingConfig | null>>({ welcome: null, goodbye: null });
	const touchedRef = useRef({ welcome: false, goodbye: false });

	useEffect(() => {
		if (!pair) return;
		setDrafts((prev) => ({
			welcome: touchedRef.current.welcome ? prev.welcome : (pair.welcome ?? DEFAULT_GREETINGS.welcome),
			goodbye: touchedRef.current.goodbye ? prev.goodbye : (pair.goodbye ?? DEFAULT_GREETINGS.goodbye),
		}));
	}, [pair]);

	const patchKind = useCallback((kind: GreetingKind, next: GreetingConfig) => {
		touchedRef.current[kind] = true;
		setDrafts((prev) => ({ ...prev, [kind]: next }));
	}, []);

	const [saving, setSaving] = useState(false);
	const save = useCallback(async (): Promise<GreetingPair | null> => {
		if (!drafts.welcome || !drafts.goodbye) return null;
		setSaving(true);
		try {
			const res = await fetch(guildUrl, {
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
	}, [drafts, guildUrl, mutate, redirectToLogin]);

	const [tickets, setTickets] = useState<TestTicket[]>([]);
	const [testResults, setTestResults] = useState<Record<GreetingKind, GreetingTestResult | null>>({
		welcome: null,
		goodbye: null,
	});

	const polling = tickets.length > 0;
	const { data: status, mutate: mutateStatus } = useSWR<GreetingTestStatus>(
		polling ? `${guildUrl}/status` : null,
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
			const res = await fetch(`${guildUrl}/test`, {
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
			void mutateStatus();
		},
		[guildUrl, mutateStatus, redirectToLogin],
	);

	return {
		pair: pair,
		drafts,
		error: error ? toError(error, "인사 설정을 불러오지 못했어요.") : null,
		isLoading,
		saving,
		save,
		patchKind,
		testPending: (kind: GreetingKind) => tickets.some((ticket) => ticket.kind === kind),
		testResults,
		startTest,
		reload: useCallback(() => {
			void mutate();
		}, [mutate]),
	};
}