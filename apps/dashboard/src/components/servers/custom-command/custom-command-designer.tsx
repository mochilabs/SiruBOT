"use client";

import { useRef, useState } from "react";
import type {
	CustomCommandAccentColor,
	CustomCommandDesign,
	CustomCommandDesignItem,
} from "@sirubot/utils/customCommand";
import {
	CUSTOM_COMMAND_ACCENT_COLOR_VALUES,
	CUSTOM_COMMAND_ACCENT_COLORS,
} from "@sirubot/utils/customCommand";
import { ArrowDown, ArrowUp, Images, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

import { AssetPicker } from "../asset-picker";

import { useDesignUpload } from "./use-design-upload";
import { useListEditor } from "./use-list-editor";

const ACCENT_LABELS: Record<CustomCommandAccentColor, string> = {
	blue: "파랑",
	green: "초록",
	red: "빨강",
	purple: "보라",
	gray: "회색",
};

const KIND_OPTIONS: Array<{ value: CustomCommandDesignItem["kind"]; label: string }> = [
	{ value: "text", label: "텍스트" },
	{ value: "separator", label: "구분선" },
	{ value: "section", label: "섹션 (썸네일)" },
	{ value: "media", label: "이미지 갤러리" },
];

function accentHex(color: CustomCommandAccentColor): string {
	return `#${CUSTOM_COMMAND_ACCENT_COLOR_VALUES[color].toString(16).padStart(6, "0")}`;
}

function createDesignItem(kind: CustomCommandDesignItem["kind"]): CustomCommandDesignItem {
	switch (kind) {
		case "text":
			return { kind: "text", content: "" };
		case "separator":
			return { kind: "separator" };
		case "section":
			return { kind: "section", content: "", thumbnailUrl: "https://" };
		case "media":
			return { kind: "media", urls: ["https://"] };
	}
}

interface CustomCommandDesignerProps {
	guildId: string;
	design: CustomCommandDesign;
	saving: boolean;
	onChange: (design: CustomCommandDesign) => void;
}

const MEDIA_URL_LIMIT = 10;

export function CustomCommandDesigner({
	guildId,
	design,
	saving,
	onChange,
}: CustomCommandDesignerProps) {
	const toast = useToast();
	const [pickerTarget, setPickerTarget] = useState<{ index: number; multiple: boolean } | null>(null);

	const designRef = useRef(design);
	designRef.current = design;

	const { keys: itemKeys, updateItem, moveItem, removeItem } = useListEditor(design.items, (items) =>
		onChange({ ...designRef.current, items }),
	);

	const changeKind = (index: number, kind: CustomCommandDesignItem["kind"]) => {
		updateItem(index, createDesignItem(kind));
	};

	const applyUrls = (index: number, kind: "section" | "media", urls: string[]) => {
		const item = designRef.current.items[index];
		if (!item) return;
		if (kind === "section" && item.kind === "section") {
			updateItem(index, {
				kind: "section",
				content: item.content,
				thumbnailUrl: urls[0] ?? item.thumbnailUrl,
			});
			return;
		}
		if (item.kind !== "media") return;
		const merged = [...item.urls, ...urls];
		updateItem(index, {
			kind: "media",
			urls: merged.slice(0, MEDIA_URL_LIMIT),
		});
		if (merged.length > MEDIA_URL_LIMIT) {
			toast.warning(`이미지는 ${MEDIA_URL_LIMIT}개까지만 넣을 수 있어요.`, "초과한 이미지는 추가하지 못했어요.");
		}
	};

	const { uploading, singleFileInputRef, multiFileInputRef, requestUpload, handleUpload } = useDesignUpload(guildId, applyUrls);

	return (
		<div className="space-y-3 rounded-menu bg-muted/20 p-3">
			<div className="flex items-center justify-between gap-2">
				<p className="text-xs font-medium text-muted-foreground">
					디자인 메시지: 텍스트·구분선·섹션·이미지로 꾸며요 (구성 요소 10개 이하)
				</p>
				<div className="flex items-center gap-1">
					{CUSTOM_COMMAND_ACCENT_COLORS.map((color) => (
						<button
							key={color}
							type="button"
							aria-label={`강조색 ${ACCENT_LABELS[color]}`}
							disabled={saving}
							className={`relative h-5 w-5 rounded-full border-2 after:absolute after:inset-y-[min(0px,calc((100%-44px)/2))] after:inset-x-[min(0px,calc((100%-24px)/2))] ${
								design.accentColor === color
									? "border-foreground"
									: "border-transparent"
							}`}
							style={{ backgroundColor: accentHex(color) }}
							onClick={() => onChange({ ...design, accentColor: color })}
						/>
					))}
				</div>
			</div>

			{design.items.map((item, index) => (
				<div
					key={itemKeys[index] ?? index}
					className="space-y-2 rounded-menu bg-surface-2 p-3"
				>
					<div className="flex items-center gap-2">
						<Select
							value={item.kind}
							onValueChange={(value: string | null) => {
								if (
									value === "text" ||
									value === "separator" ||
									value === "section" ||
									value === "media"
								) {
									changeKind(index, value);
								}
							}}
						>
							<SelectTrigger size="sm" aria-label="구성 요소 종류">
								<SelectValue>
									{(value: string) =>
										KIND_OPTIONS.find((option) => option.value === value)
											?.label ?? value
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{KIND_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="ml-auto flex items-center gap-1">
							<Button
								variant="icon"
								size="icon-xs"
								aria-label="위로 이동"
								disabled={index === 0 || saving}
								icon={<ArrowUp size={14} />}
								onClick={() => moveItem(index, -1)}
							/>
							<Button
								variant="icon"
								size="icon-xs"
								aria-label="아래로 이동"
								disabled={index === design.items.length - 1 || saving}
								icon={<ArrowDown size={14} />}
								onClick={() => moveItem(index, 1)}
							/>
							<Button
								variant="icon"
								size="icon-xs"
								aria-label="구성 요소 삭제"
								disabled={saving}
								icon={<Trash2 size={14} />}
								onClick={() => removeItem(index)}
							/>
						</div>
					</div>

					{item.kind === "text" && (
						<Textarea
							placeholder="표시할 텍스트 (## 로 제목, **굵게** 가능, {argv0} 인수 치환)"
							value={item.content}
							onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
								updateItem(index, { kind: "text", content: e.target.value })
							}
							maxLength={2000}
							disabled={saving}
							className="min-h-12"
						/>
					)}
					{item.kind === "section" && (
						<div className="space-y-2">
							<Textarea
								placeholder="본문 ({argv0} 인수 치환 가능)"
								value={item.content}
								onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
									updateItem(index, {
										kind: "section",
										content: e.target.value,
										thumbnailUrl: item.thumbnailUrl,
									})
								}
								maxLength={2000}
								disabled={saving}
								className="min-h-12"
							/>
							<Input
								type="text"
								placeholder="썸네일 이미지 주소 (https://...)"
								value={item.thumbnailUrl}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									updateItem(index, {
										kind: "section",
										content: item.content,
										thumbnailUrl: e.target.value,
									})
								}
								disabled={saving}
							/>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="secondary"
									size="sm"
									icon={<Upload size={16} />}
									loading={uploading}
									disabled={saving}
									onClick={() => requestUpload({ index, kind: "section" })}
								>
									업로드
								</Button>
								<Button
									variant="secondary"
									size="sm"
									icon={<Images size={16} />}
									disabled={saving}
									onClick={() => setPickerTarget({ index, multiple: false })}
								>
									에셋에서 선택
								</Button>
							</div>
						</div>
					)}
					{item.kind === "media" && (
						<div className="space-y-2">
							<Textarea
								placeholder="이미지 주소를 한 줄에 하나씩 (https://, 최대 10개)"
								value={item.urls.join("\n")}
								onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
									updateItem(index, {
										kind: "media",
										urls: e.target.value
											.split("\n")
											.map((url) => url.trim())
											.filter(Boolean),
									})
								}
								disabled={saving}
								className="min-h-12"
							/>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="secondary"
									size="sm"
									icon={<Upload size={16} />}
									loading={uploading}
									disabled={saving}
									onClick={() => requestUpload({ index, kind: "media" })}
								>
									업로드
								</Button>
								<Button
									variant="secondary"
									size="sm"
									icon={<Images size={16} />}
									disabled={saving}
									onClick={() => setPickerTarget({ index, multiple: true })}
								>
									에셋에서 선택
								</Button>
							</div>
						</div>
					)}
				</div>
			))}

			<Button
				variant="secondary"
				size="sm"
				disabled={design.items.length >= 10 || saving}
				icon={<Plus size={16} />}
				onClick={() =>
					onChange({ ...design, items: [...design.items, createDesignItem("text")] })
				}
			>
				구성 요소 추가
			</Button>

			<input
				ref={singleFileInputRef}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				className="hidden"
				onChange={(event) => {
					void handleUpload(event.target.files);
					event.target.value = "";
				}}
			/>
			<input
				ref={multiFileInputRef}
				type="file"
				multiple
				accept="image/png,image/jpeg,image/webp,image/gif"
				className="hidden"
				onChange={(event) => {
					void handleUpload(event.target.files);
					event.target.value = "";
				}}
			/>

			<AssetPicker
				guildId={guildId}
				multiple={pickerTarget?.multiple ?? false}
				open={pickerTarget !== null}
				onClose={() => setPickerTarget(null)}
				onSelect={(urls) => {
					if (!pickerTarget) return;
					const item = designRef.current.items[pickerTarget.index];
					if (item) applyUrls(pickerTarget.index, item.kind === "media" ? "media" : "section", urls);
					setPickerTarget(null);
				}}
			/>

			<DesignPreview design={design} />
		</div>
	);
}

export function DesignPreview({ design }: { design: CustomCommandDesign }) {
	return (
		<div className="rounded-menu border border-border bg-surface-1 p-3">
			<p className="mb-2 text-xs text-muted-foreground">미리보기 (근사치)</p>
			<div
				className="space-y-1 rounded-menu border-l-4 bg-surface-2 p-3"
				style={{ borderLeftColor: accentHex(design.accentColor) }}
			>
				{design.items.map((item, index) => {
					switch (item.kind) {
						case "text":
							return (
								<div key={index} className="space-y-0.5">
									{item.content.split("\n").map((line, lineIndex) =>
										line.startsWith("## ") ? (
											<p
												key={lineIndex}
												className="text-sm font-bold text-foreground"
											>
												{line.slice(3)}
											</p>
										) : (
											<p
												key={lineIndex}
												className="whitespace-pre-wrap text-sm text-foreground"
											>
												{line}
											</p>
										),
									)}
								</div>
							);
						case "separator":
							return <div key={index} className="my-2 h-px bg-border" />;
						case "section":
							return (
								<div key={index} className="flex items-start gap-2">
									<p className="flex-1 whitespace-pre-wrap text-sm text-foreground">
										{item.content}
									</p>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={item.thumbnailUrl}
										alt=""
										referrerPolicy="no-referrer"
										className="h-14 w-14 shrink-0 rounded object-cover"
									/>
								</div>
							);
						case "media":
							return (
								<div key={index} className="flex flex-wrap gap-1">
									{item.urls.slice(0, 10).map((url, urlIndex) => (
										// eslint-disable-next-line @next/next/no-img-element
										<img
											key={urlIndex}
											src={url}
											alt=""
											referrerPolicy="no-referrer"
											className="h-20 rounded object-cover"
										/>
									))}
								</div>
							);
					}
				})}
			</div>
		</div>
	);
}
