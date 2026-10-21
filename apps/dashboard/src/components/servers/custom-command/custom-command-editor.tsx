"use client";

import { ArrowRight, ArrowUp, ChevronDown } from "lucide-react";

import { RoleSelect } from "@/components/discord/role-select";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import type {
	CustomCommandsState,
	CustomCommandSummary,
} from "@/lib/custom-commands";

import {
	hasRoleAction,
	totalDelaySeconds,
} from "./custom-command-editor.utils";
import { PERMISSION_OPTIONS, StepsEditor } from "./custom-command-steps-editor";
import { useCommandAssistant } from "./use-command-assistant";
import { useCustomCommandEditor } from "./use-custom-command-editor";

/** "AI 도우미" 라벨 — 모바일 토글과 PC 정적 라벨이 같은 내용을 써요 */
function ChatPanelLabel() {
	return (
		<span className="space-y-0.5">
			<span className="block text-xs font-medium text-muted-foreground">AI 도우미</span>
			<span className="block text-2xs text-muted-foreground">
				만들고 싶은 명령어를 말하면 초안을 채우고, 이어서 다듬을 수 있어요.
			</span>
		</span>
	);
}

interface CustomCommandEditorProps {
	guildId: string;
	/** null이면 새로 만들기 */
	command: CustomCommandSummary | null;
	/** 실행 예시 표시용 접두사 */
	prefix: string;
	onClose: () => void;
	/** 저장 성공 시 서버가 돌려준 최신 상태를 부모에 전달해요 */
	onSaved: (state: CustomCommandsState) => void;
}

/**
 * 커스텀 명령어 편집기 — 폼(이름·설명·실행 제한·스텝 조립)과 AI 채팅으로 구성해요.
 * PC에서는 폼 + 채팅 두 칸이고, 좁은 화면에서는 채팅이 접이식 섹션으로 위에 놓여요.
 * 폼 상태·저장은 useCustomCommandEditor, AI 채팅은 useCommandAssistant가 맡아요.
 */
export function CustomCommandEditor({
	guildId,
	command,
	prefix,
	onClose,
	onSaved,
}: CustomCommandEditorProps) {
	const { roles: rawRoles } = useGuildRoles(guildId);
	const { channels } = useGuildChannels(guildId);
	const roles = rawRoles ?? [];

	const {
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
	} = useCustomCommandEditor({ guildId, command, prefix, onSaved });
	const {
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
	} = useCommandAssistant({
		guildId,
		isEditing: command !== null,
		draft,
		applySpec,
		applyDraftMetadata,
	});

	const totalDelay = totalDelaySeconds(steps);
	const roleAction = hasRoleAction(steps);

	return (
		<Dialog
			open
			onOpenChange={(isOpen: boolean) => {
				if (!isOpen) onClose();
			}}
		>
			{/* 기본 폭(sm:max-w-sm)과 높이 제한을 벗어나려면 sm:도 같이 덮어야 해요 */}
			<DialogContent className="flex h-[calc(100dvh-1rem)] w-[calc(100%-2rem)] max-w-6xl flex-col gap-4 overflow-hidden sm:h-[90dvh] sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle>{command ? "커스텀 명령어 수정" : "새 커스텀 명령어"}</DialogTitle>
					<DialogDescription>
						만들고 싶은 동작을 AI 도우미에게 말로 부탁하거나, 스텝을 직접 조립할 수 있어요.
					</DialogDescription>
				</DialogHeader>

				{/* 폼 + AI 채팅 — 좁은 화면에선 한 칸, PC에선 두 칸 (왼쪽 폼, 오른쪽 채팅) */}
				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
					{/* 폼 (왼쪽) */}
					<div className="space-y-4 lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
						{/* 실행 방식 — 생성 시점에 정해지고 바뀌지 않아요 */}
						<Field
							label="실행 방식"
							description={
								command
									? "실행 방식은 만들 때 정해지고 바꿀 수 없어요. 바꾸려면 삭제 후 새로 만드세요."
									: "메시지 트리거는 채팅으로, 슬래시는 디스코드 명령어 목록으로 실행돼요."
							}
						>
							<div className="flex gap-2">
								<Button
									variant={method === "prefix" ? "primary" : "secondary"}
									size="sm"
									disabled={saving || busy || Boolean(command)}
									onClick={() => setMethod("prefix")}
								>
									{`메시지 트리거 (${prefix}이름)`}
								</Button>
								<Button
									variant={method === "slash" ? "primary" : "secondary"}
									size="sm"
									disabled={saving || busy || Boolean(command)}
									onClick={() => setMethod("slash")}
								>
									슬래시 명령어 (/이름)
								</Button>
							</div>
						</Field>

						<Field
							htmlFor="cc-name"
							label="이름"
							description={
								method === "slash"
									? "한글·영문 소문자·숫자·`-`·`_`만, 20자 이하. 슬래시 `/이름`으로 실행해요."
									: `공백 없이 20자 이하. 디스코드에서 \`${prefix}이름\`으로 실행해요. '도움말'은 예약어예요.`
							}
						>
							<Input
								id="cc-name"
								type="text"
								placeholder="예: 아침브리핑"
								value={name}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setName(e.target.value)
								}
								maxLength={20}
								disabled={saving}
							/>
						</Field>

						<Field
							htmlFor="cc-desc"
							label={method === "slash" ? "설명 (필수)" : "설명 (선택사항)"}
							description={
								method === "slash"
									? "슬래시 명령어 목록에 보여요. 100자 이내."
									: undefined
							}
						>
							<Input
								id="cc-desc"
								type="text"
								placeholder="이 명령어가 뭘 하는지 한 줄로"
								value={description}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setDescription(e.target.value)
								}
								maxLength={100}
								disabled={saving}
							/>
						</Field>

						{/* 실행 제한 */}
						<Field
							label="실행 제한"
							description={
								roleAction
									? "역할 변경 액션이 있어 실행 제한이 필수예요. 아무나 실행하면 역할을 마음대로 줄 수 있어요."
									: "누가 이 명령어를 실행할 수 있는지 정해요. 기본은 모든 멤버예요."
							}
						>
							<div className="space-y-2">
								<Select
									value={access?.mode ?? "everyone"}
									onValueChange={(value: string | null) => {
										if (value === "everyone") setAccess(null);
										else if (value === "roles")
											setAccess({ mode: "roles", roleIds: [] });
										else if (value === "permissions")
											setAccess({ mode: "permissions", permissions: [] });
									}}
								>
									<SelectTrigger size="sm" aria-label="실행 제한 방식">
										<SelectValue>
											{(value: string) =>
												value === "roles"
													? "특정 역할만"
													: value === "permissions"
														? "특정 권한 보유자만"
														: "모든 멤버"
											}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="everyone">모든 멤버</SelectItem>
										<SelectItem value="roles">특정 역할만</SelectItem>
										<SelectItem value="permissions">특정 권한 보유자만</SelectItem>
									</SelectContent>
								</Select>
								{access?.mode === "roles" && (
									<RoleSelect
										multiple
										roles={roles}
										value={access.roleIds ?? []}
										onChange={(roleIds) =>
											setAccess({ mode: "roles", roleIds: roleIds.slice(0, 10) })
										}
										placeholder="실행을 허용할 역할을 선택해 주세요 (하나 이상)"
										disabled={saving}
									/>
								)}
								{access?.mode === "permissions" && (
									<div className="flex flex-wrap gap-3">
										{PERMISSION_OPTIONS.map((option) => {
											const selected = access.permissions?.includes(option.value) ?? false;
											return (
												<label
													key={option.value}
													className="flex items-center gap-1.5 text-sm text-foreground"
												>
													<input
														type="checkbox"
														checked={selected}
														disabled={saving}
														onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
															const next = new Set(access.permissions ?? []);
															if (e.target.checked) next.add(option.value);
															else next.delete(option.value);
															setAccess({
																mode: "permissions",
																permissions: [...next],
															});
														}}
													/>
													{option.label}
												</label>
											);
										})}
									</div>
								)}
							</div>
						</Field>

						{/* 스텝 블록 조립 */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<p className="text-sm font-bold text-foreground">
									스텝 ({steps.length}/20)
								</p>
								<p
									className={`text-xs ${
										totalDelay > 600 ? "text-destructive" : "text-muted-foreground"
									}`}
								>
									대기 합계 {totalDelay}/600초
								</p>
							</div>
							<StepsEditor
								guildId={guildId}
								steps={steps}
								roles={roles}
								channels={channels ?? []}
								saving={saving || busy}
								onChange={setSteps}
							/>
							<p className="flex items-center gap-1 text-xs text-muted-foreground">
								<ArrowRight size={12} />
								{"메시지에 {argv0} {argv1} … 을 넣으면 실행자가 입력한 인수로 바뀌어요."}
							</p>
						</div>
					</div>

					{/* AI 채팅 (오른쪽) — 좁은 화면에선 접이식 섹션, PC에선 항상 보여요 */}
					<div className="order-first flex flex-col gap-2 rounded-menu bg-muted/20 p-3 lg:order-none lg:col-start-2 lg:row-start-1 lg:min-h-0">
						<Button
							variant="outline"
							size="sm"
							aria-expanded={chatOpen}
							className="w-full justify-between p-3 text-left pointer-coarse:h-11 lg:hidden"
							onClick={() => setChatOpen((v) => !v)}
						>
							<ChatPanelLabel />
							<ChevronDown size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
						</Button>
						<div className="hidden lg:block">
							<ChatPanelLabel />
						</div>

						<div
							className={`flex min-h-0 flex-col gap-2 lg:flex-1 ${
								chatOpen ? "flex" : "hidden lg:flex"
							}`}
						>
							<div
								ref={messagesRef}
								role="log"
								aria-live="polite"
								aria-label="AI 도우미 대화"
								className="max-h-80 min-h-0 flex-1 space-y-2 overflow-y-auto lg:max-h-none"
							>
								{chat.length === 0 ? (
									<p className="px-1 py-6 text-center text-xs text-muted-foreground">
										{'"인사말 보내고 3초 뒤에 서버 규칙 요약 알려줘"처럼 만들고 싶은 동작을 적어 보세요.'}
									</p>
								) : (
									chat.map((turn, index) =>
										turn.role === "user" ? (
											<p
												key={index}
												className="ml-auto max-w-[85%] rounded-menu bg-primary/10 px-3 py-2 text-sm text-primary-text shadow-control-boundary"
											>
												{turn.content}
											</p>
										) : (
											<div key={index} className="mr-auto max-w-[90%] space-y-1">
												<p className="text-2xs text-muted-foreground">시루</p>
												<div className="rounded-menu bg-surface-1 px-3 py-2 text-sm text-foreground shadow-control-boundary">
													{turn.content}
												</div>
											</div>
										),
									)
								)}
							</div>

							<div className="flex shrink-0 items-end gap-2">
								<Textarea
									ref={chatInputRef}
									aria-label="AI 도우미에게 보내는 메시지"
									placeholder={
										chat.length === 0
											? "예: 인사말 보내고 3초 뒤에 서버 규칙 요약 알려줘"
											: "예: 두 번째 메시지를 더 친근하게 바꿔줘"
									}
									value={prompt}
									onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
										setPrompt(e.target.value)
									}
									onKeyDown={handleChatKeyDown}
									maxLength={500}
									className="max-h-40 min-h-9 resize-none"
								/>
								<Button
									variant="primary"
									size="icon"
									aria-label="보내기"
									loading={busy}
									disabled={!prompt.trim()}
									icon={<ArrowUp size={16} />}
									onClick={() => void sendPrompt()}
								/>
							</div>

							<p className="shrink-0 text-2xs text-muted-foreground">
								AI가 바꾼 내용은 폼에만 적용돼요. 만들기·수정 완료 버튼을 눌러야 서버에 반영돼요.
							</p>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={onClose} disabled={saving}>
						취소
					</Button>
					<Button variant="primary" loading={saving} onClick={handleSave}>
						{command ? "수정 완료" : "만들기"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
