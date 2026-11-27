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

const REFINE_MAX_TURNS = 8;

const REFINE_REPLY = "스펙을 수정했어요. 폼에서 변경 내용을 확인하고 저장 버튼으로 반영해 주세요.";

export interface CommandAssistantState {
	prompt: string;
	setPrompt: (next: string) => void;
	busy: boolean;
	chat: ChatTurn[];
	chatOpen: boolean;
	setChatOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
	messagesRef: React.RefObject<HTMLDivElement | null>;
	chatInputRef: React.RefObject<HTMLTextAreaElement | null>;
	sendPrompt: () => Promise<void>;
	handleChatKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function useCommandAssistant({
	guildId,
	isEditing,
	draft,
	applySpec,
	applyDraftMetadata,
}: {
	guildId: string;
	isEditing: boolean;
	draft: EditorDraft;
	applySpec: (spec: CustomCommandSpecV2) => void;
	applyDraftMetadata: (meta: { name: string; description: string; method: CustomCommandMethod }) => void;
}): CommandAssistantState {
	const toast = useToast();
	const [prompt, setPrompt] = useState("");
	const [busy, setBusy] = useState(false);
	const [chat, setChat] = useState<ChatTurn[]>([]);
	const [draftApplied, setDraftApplied] = useState(false);
	const [chatOpen, setChatOpen] = useState(!isEditing);
	const messagesRef = useRef<HTMLDivElement | null>(null);
	const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		const el = messagesRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [chat, chatOpen, busy]);

	const sendPrompt = async () => {
		const text = prompt.trim();
		if (!text || busy) return;

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
