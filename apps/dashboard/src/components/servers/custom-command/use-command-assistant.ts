import { useEffect, useRef, useState } from "react";
import type {
	CustomCommandMethod,
	CustomCommandSpec,
	CustomCommandSpecV2,
} from "@sirubot/utils/customCommand";

import { useToast } from "@/components/ui/toast";
import { toApiError, toError } from "@/lib/api-error";

import {
	buildSpec,
	type EditorDraft,
} from "./custom-command-editor.utils";

type ChatTurn = { role: "user" | "assistant"; content: string };

/** 대화 기억 한도 — 최근 N턴(사용자·응답 쌍)만 보내요 */
const REFINE_MAX_TURNS = 8;

const REFINE_REPLY = "스펙을 수정했어요. 폼에서 변경 내용을 확인하고 저장 버튼으로 반영해 주세요.";

export interface CommandAssistantState {
	prompt: string;
	setPrompt: (next: string) => void;
	busy: boolean;
	chat: ChatTurn[];
	/** 접이식 토글은 좁은 화면용 — 새 명령어에선 펼치고, 수정에선 접어요 (PC는 항상 보여요) */
	chatOpen: boolean;
	setChatOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
	messagesRef: React.RefObject<HTMLDivElement | null>;
	chatInputRef: React.RefObject<HTMLTextAreaElement | null>;
	sendPrompt: () => Promise<void>;
	handleChatKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

/**
 * AI 도우미 채팅 — 입력 한 개로 흐름이 정해져요: 아직 초안이 없으면 draft API,
 * 초안이 있으면(수정 중 포함) 현재 폼 스펙 기준 refine API.
 * 채팅 결과는 폼에만 적용돼요 — 저장은 사용자가 직접 눌러야 해요.
 */
export function useCommandAssistant({
	guildId,
	isEditing,
	draft,
	applySpec,
	applyDraftMetadata,
}: {
	guildId: string;
	/** 수정 모드면 처음부터 refine으로 보내요 (폼이 이미 서버 스펙으로 채워져 있어요) */
	isEditing: boolean;
	draft: EditorDraft;
	applySpec: (spec: CustomCommandSpecV2) => void;
	applyDraftMetadata: (meta: { name: string; description: string; method: CustomCommandMethod }) => void;
}): CommandAssistantState {
	const toast = useToast();
	const [prompt, setPrompt] = useState("");
	const [busy, setBusy] = useState(false);
	const [chat, setChat] = useState<ChatTurn[]>([]);
	/** 이번 세션에서 draft 결과를 폼에 적용했는지 — 있으면 이후 지시는 refine으로 가요 */
	const [draftApplied, setDraftApplied] = useState(false);
	const [chatOpen, setChatOpen] = useState(!isEditing);
	const messagesRef = useRef<HTMLDivElement | null>(null);
	const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

	// 새 메시지·전송 상태가 바뀌면 목록 맨 아래를 보여줘요
	useEffect(() => {
		const el = messagesRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [chat, chatOpen, busy]);

	const sendPrompt = async () => {
		const text = prompt.trim();
		if (!text || busy) return;

		// 초안이 없으면 자연어 → 스펙 초안, 있으면 현재 폼 스펙 기준으로 수정해요
		if (isEditing || draftApplied) {
			const built = buildSpec(draft);
			if (!built.ok) {
				toast.error(built.error, "AI에 맡기기 전에 스텝 구성부터 맞춰 주세요.");
				return;
			}
			setBusy(true);
			try {
				const res = await fetch(`/api/servers/${guildId}/custom-commands/refine`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						prompt: text,
						currentSpec: built.spec,
						history: chat.slice(-REFINE_MAX_TURNS * 2),
					}),
				});
				if (!res.ok) throw await toApiError(res, "AI 수정에 실패했어요.");
				const data = (await res.json()) as { spec: CustomCommandSpecV2 };
				applySpec(data.spec);
				setChat((prev) =>
					[...prev, { role: "user" as const, content: text }, { role: "assistant" as const, content: REFINE_REPLY }].slice(
						-REFINE_MAX_TURNS * 2,
					),
				);
				setPrompt("");
			} catch (error) {
				const apiError = toError(error, "AI 수정에 실패했어요.");
				toast.error(
					apiError.message,
					apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
				);
			} finally {
				setBusy(false);
			}
			return;
		}

		setBusy(true);
		try {
			const res = await fetch(`/api/servers/${guildId}/custom-commands/draft`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: text }),
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
			applyDraftMetadata({
				name: data.draft.name,
				description: data.draft.description,
				method: data.draft.method,
			});
			if (data.draft.spec.version === 2) applySpec(data.draft.spec);
			setDraftApplied(true);
			// 초안은 새 대화예요 — 이전 지시와는 이어지지 않아요
			setChat([
				{ role: "user", content: text },
				{
					role: "assistant",
					content: `「${data.draft.name}」 초안을 채웠어요. 폼에서 내용을 확인하고 저장 버튼으로 반영해 주세요.`,
				},
			]);
			setPrompt("");
		} catch (error) {
			const apiError = toError(error, "AI 초안 생성에 실패했어요.");
			toast.error(
				apiError.message,
				apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
			);
		} finally {
			setBusy(false);
		}
	};

	const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Enter로 보내고 Shift+Enter로 개행 — 한글 IME 조합 중인 Enter는 무시해요
		if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
		e.preventDefault();
		void sendPrompt();
	};

	return {
		prompt,
		setPrompt,
		busy,
		chat,
		chatOpen,
		setChatOpen,
		messagesRef,
		chatInputRef,
		sendPrompt,
		handleChatKeyDown,
	};
}
