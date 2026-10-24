"use client";

import { Field } from "@/components/primitives/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { WebhookAvatarField } from "./webhook-avatar-field";

/** 웹훅 프로필 설정 상태 요약 — 접힌 헤더에 한 줄로 보여줘요. */
export function webhookProfileSummary(name: string, avatarUrl: string | null, showThumbnail: boolean): string {
	const profilePart = name.trim() ? (avatarUrl ? "커스텀 프로필" : "커스텀 표시명") : avatarUrl ? "커스텀 프로필 사진" : "기본 프로필";
	const thumbPart = showThumbnail ? "섬네일 표시" : "섬네일 끔";
	return `${profilePart} · ${thumbPart}`;
}

interface WebhookProfileSectionProps {
	guildId: string;
	name: string;
	onNameChange: (value: string) => void;
	namePlaceholder?: string;
	avatarValue: string | null;
	onAvatarChange: (value: string | null) => void;
	showThumbnail: boolean;
	onShowThumbnailChange: (value: boolean) => void;
	fallbackGuildAvatarUrl?: string | null;
	fallbackGlobalAvatarUrl?: string | null;
	disabled?: boolean;
	surface?: "surface-1" | "surface-2";
}

/** 웹훅 표시명·프로필 사진·섬네일 설정을 한 카드에 묶어 보여주는 컴팩트 섹션이에요. */
export function WebhookProfileSection({
	guildId,
	name,
	onNameChange,
	namePlaceholder = "웹훅 표시명",
	avatarValue,
	onAvatarChange,
	showThumbnail,
	onShowThumbnailChange,
	fallbackGuildAvatarUrl = null,
	fallbackGlobalAvatarUrl = null,
	disabled = false,
	surface = "surface-1",
}: WebhookProfileSectionProps) {
	return (
		<div className={cn("rounded-card space-y-4 p-4", surface === "surface-2" ? "bg-surface-2" : "bg-surface-1")}>
			<div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
				<WebhookAvatarField
					guildId={guildId}
					value={avatarValue}
					onChange={onAvatarChange}
					fallbackGuildAvatarUrl={fallbackGuildAvatarUrl}
					fallbackGlobalAvatarUrl={fallbackGlobalAvatarUrl}
					disabled={disabled}
				/>
				<Field
					label="웹훅 표시명"
					description={`${name.length}/80 · 비우면 기본 이름으로 보내요. discord·clyde는 쓸 수 없어요 (Discord 규칙).`}
					className="min-w-0 flex-1"
				>
					{({ id, describedBy }) => (
						<Input
							id={id}
							aria-describedby={describedBy}
							value={name}
							onChange={(event) => onNameChange(event.target.value)}
							placeholder={namePlaceholder}
							maxLength={80}
							disabled={disabled}
						/>
					)}
				</Field>
			</div>
			<div className="flex flex-col gap-1.5">
				<Switch
					checked={showThumbnail}
					onChange={onShowThumbnailChange}
					label="방송 시작 섬네일 이미지 표시"
					labelPosition="right"
					disabled={disabled}
				/>
				<p className="text-xs text-muted-foreground">
					라이브 미리보기 이미지를 임베드에 넣어요. 트위치는 이미지가 없어 자동으로 생략돼요.
				</p>
			</div>
		</div>
	);
}
