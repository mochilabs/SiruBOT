"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ImagePlus, LayoutTemplate, Shapes, Type, UserRound } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Button } from "@/components/primitives/button";
import { SectionLabel } from "@/components/primitives/section-label";
import { toApiError, toError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
	GREETING_TEMPLATES,
	type GreetingConfig,
	type GreetingImage,
	type GreetingKind,
	type GreetingLayer,
	PRESET_BACKGROUNDS} from "@/types/member-greeting";

import {
	CARD_H,
	CARD_W,
	clampRatio,
	createAvatarLayer,
	createImageLayer,
	createShapeLayer,
	createTextLayer,
	drawGreetingPreview,
	hitTestLayer,
	loadImage,
	presetGradient
} from "./greeting-draw";
import { LayerPanel } from "./layer-panel";
import { LayerProperties } from "./layer-properties";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp";

interface GreetingImageEditorProps {
	guildId: string;
	kind: GreetingKind;
	config: GreetingConfig;
	image: GreetingImage;
	saving: boolean;
	/** 탭이 보일 때만 캔버스를 그려요 — 탭 셸이 패널을 마운트 유지하기 때문이에요 */
	active: boolean;
	onPatch: (next: GreetingConfig) => void;
}

/** 레이어 기반 드래그 이미지 편집기 — 브라우저 canvas 실시간 미리보기 + 레이어/속성 패널 */
export function GreetingImageEditor({ guildId, config, image, saving, active, onPatch }: GreetingImageEditorProps) {
	const toast = useToast();
	const { data: session } = useSession();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const backgroundFileInputRef = useRef<HTMLInputElement>(null);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [backgroundUploading, setBackgroundUploading] = useState(false);

	const avatarSrc = session?.user?.image ?? null;

	const patchImage = useCallback(
		(next: GreetingImage) => {
			onPatch({ ...config, useImage: true, image: next });
		},
		[config, onPatch]
	);

	const patchLayer = useCallback(
		(layerId: string, partial: Partial<GreetingLayer>) => {
			patchImage({
				...image,
				layers: image.layers.map((layer) => (layer.id === layerId ? ({ ...layer, ...partial } as GreetingLayer) : layer))
			});
		},
		[image, patchImage]
	);

	// ── 캔버스 드로잉 — 편집 상태가 바뀔 때마다 재그려요 ──
	useEffect(() => {
		if (!active) return;
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		let cancelled = false;
		void drawGreetingPreview(ctx, image, { selectedId, avatarSrc, guildName: "" }, () => cancelled);
		return () => {
			cancelled = true;
		};
	}, [active, image, selectedId, avatarSrc]);

	// ── 드래그 이동 (pointer capture + rAF 스로틀) ──
	const dragRef = useRef<{ layerId: string; pointerId: number } | null>(null);
	const dragPointRef = useRef<{ x: number; y: number } | null>(null);
	const dragFrameRef = useRef<number | null>(null);

	const canvasPercent = useCallback((clientX: number, clientY: number) => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const px = ((clientX - rect.left) / rect.width) * CARD_W;
		const py = ((clientY - rect.top) / rect.height) * CARD_H;
		return { x: clampRatio((px / CARD_W) * 100), y: clampRatio((py / CARD_H) * 100) };
	}, []);

	const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (saving) return;
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const rect = canvas.getBoundingClientRect();
		const px = ((event.clientX - rect.left) / rect.width) * CARD_W;
		const py = ((event.clientY - rect.top) / rect.height) * CARD_H;
		const visible = image.layers.filter((layer) => !layer.hidden);
		const hit = hitTestLayer(ctx, visible, px, py);
		if (hit) {
			setSelectedId(hit.id);
			dragRef.current = { layerId: hit.id, pointerId: event.pointerId };
			canvas.setPointerCapture(event.pointerId);
		} else {
			setSelectedId(null);
		}
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const point = canvasPercent(event.clientX, event.clientY);
		if (!point) return;
		dragPointRef.current = point;
		if (dragFrameRef.current == null) {
			dragFrameRef.current = requestAnimationFrame(() => {
				dragFrameRef.current = null;
				const next = dragPointRef.current;
				if (!next) return;
				patchLayer(drag.layerId, { x: next.x, y: next.y });
			});
		}
	};

	const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		dragRef.current = null;
		dragPointRef.current = null;
		if (dragFrameRef.current != null) {
			cancelAnimationFrame(dragFrameRef.current);
			dragFrameRef.current = null;
		}
		canvasRef.current?.releasePointerCapture(event.pointerId);
	};

	// ── 레이어 조작 ──
	const addLayer = useCallback(
		(layer: GreetingLayer) => {
			patchImage({ ...image, layers: [...image.layers, layer] });
			setSelectedId(layer.id);
		},
		[image, patchImage]
	);

	const removeLayer = useCallback(
		(id: string) => {
			patchImage({ ...image, layers: image.layers.filter((layer) => layer.id !== id) });
			setSelectedId((prev) => (prev === id ? null : prev));
		},
		[image, patchImage]
	);

	const duplicateLayer = useCallback(
		(id: string) => {
			const index = image.layers.findIndex((layer) => layer.id === id);
			if (index < 0) return;
			const source = image.layers[index];
			const copy = { ...source, id: crypto.randomUUID() } as GreetingLayer;
			const next = [...image.layers];
			next.splice(index + 1, 0, copy);
			patchImage({ ...image, layers: next });
			setSelectedId(copy.id);
		},
		[image, patchImage]
	);

	const moveLayer = useCallback(
		(id: string, dir: 1 | -1) => {
			const index = image.layers.findIndex((layer) => layer.id === id);
			if (index < 0) return;
			const target = index + dir;
			if (target < 0 || target >= image.layers.length) return;
			const next = [...image.layers];
			[next[index], next[target]] = [next[target], next[index]];
			patchImage({ ...image, layers: next });
		},
		[image, patchImage]
	);

	const toggleHidden = useCallback(
		(id: string) => {
			const layer = image.layers.find((item) => item.id === id);
			if (!layer) return;
			patchLayer(id, { hidden: !layer.hidden });
		},
		[image, patchLayer]
	);

	const applyTemplate = useCallback(
		(template: (typeof GREETING_TEMPLATES)[number]) => {
			patchImage({
				background: { ...template.image.background },
				layers: template.image.layers.map((layer) => ({ ...layer }))
			});
			setSelectedId(null);
		},
		[patchImage]
	);

	// ── 업로드 (이미지 레이어 / 커스텀 배경) — POST /background로 dataURI 정규화를 재사용해요 ──
	const uploadFile = useCallback(
		async (file: File | null): Promise<string | null> => {
			if (!file) return null;
			if (file.size > MAX_UPLOAD_BYTES) {
				toast.error("이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요.");
				return null;
			}
			if (!`${ACCEPTED_IMAGE_TYPES},`.includes(`${file.type},`)) {
				toast.error("PNG, JPEG, WebP 이미지만 지원해요.");
				return null;
			}
			const form = new FormData();
			form.append("file", file);
			const res = await fetch(`/api/servers/${guildId}/greeting/background`, { method: "POST", body: form });
			if (!res.ok) throw await toApiError(res, "이미지를 준비하지 못했어요.");
			const body = (await res.json()) as { dataUri?: unknown };
			if (typeof body.dataUri !== "string" || !body.dataUri.startsWith("data:image/")) {
				throw new Error("이미지 응답이 올바르지 않아요.");
			}
			return body.dataUri;
		},
		[guildId, toast]
	);

	const handleImageUpload = useCallback(
		async (file: File | null) => {
			setUploading(true);
			try {
				const dataUri = await uploadFile(file);
				if (!dataUri) return;
				const img = await loadImage(dataUri);
				let width = 400;
				let height = 400;
				if (img && img.naturalWidth > 0) {
					width = 400;
					height = Math.max(1, Math.round((400 * img.naturalHeight) / img.naturalWidth));
				}
				addLayer(createImageLayer(dataUri, width, height));
				toast.success("이미지 레이어를 추가했어요.");
			} catch (err) {
				const apiError = toError(err, "이미지를 준비하지 못했어요.");
				toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
			} finally {
				setUploading(false);
			}
		},
		[addLayer, uploadFile, toast]
	);

	const handleBackgroundUpload = useCallback(
		async (file: File | null) => {
			setBackgroundUploading(true);
			try {
				const dataUri = await uploadFile(file);
				if (!dataUri) return;
				patchImage({ ...image, background: { presetId: null, dataUri } });
				toast.success("배경 이미지를 넣었어요.", "인사 설정을 저장하면 모든 카드에 적용돼요.");
			} catch (err) {
				const apiError = toError(err, "배경 이미지를 준비하지 못했어요.");
				toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
			} finally {
				setBackgroundUploading(false);
			}
		},
		[image, patchImage, uploadFile, toast]
	);

	const selectedLayer = selectedId ? (image.layers.find((layer) => layer.id === selectedId) ?? null) : null;

	return (
		<div className="space-y-5 rounded-card border border-border-subtle bg-surface-2 p-4">
			<SectionLabel>미리보기</SectionLabel>
			<canvas
				ref={canvasRef}
				width={CARD_W}
				height={CARD_H}
				className="block w-full cursor-crosshair touch-none rounded-card border border-border bg-muted"
				style={{ aspectRatio: "1200 / 675" }}
				role="img"
				aria-label="인사 카드 미리보기 — 레이어를 클릭해 선택하고 드래그로 옮겨요"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
			/>

			<SectionLabel>배경</SectionLabel>
			<div className="flex flex-wrap gap-2" role="radiogroup" aria-label="카드 배경 프리셋">
				{PRESET_BACKGROUNDS.map((preset) => {
					const selected = image.background.presetId === preset.id && !image.background.dataUri;
					return (
						<button
							key={preset.id}
							type="button"
							role="radio"
							aria-checked={selected}
							disabled={saving}
							onClick={() => patchImage({ ...image, background: { presetId: preset.id, dataUri: null } })}
							className={cn(
								"pointer-coarse:h-11 w-fit cursor-pointer rounded-control border p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								selected ? "border-primary ring-2 ring-ring/40" : "border-border hover:border-border-strong"
							)}
						>
							<PresetSwatch id={preset.id} />
							<span className="block pt-1 text-2xs font-medium text-foreground">{preset.name}</span>
						</button>
					);
				})}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<input
					ref={backgroundFileInputRef}
					type="file"
					accept={ACCEPTED_IMAGE_TYPES}
					className="sr-only"
					onChange={(event) => {
						void handleBackgroundUpload(event.target.files?.[0] ?? null);
						event.target.value = "";
					}}
				/>
				<Button
					variant="secondary"
					size="sm"
					icon={<ImagePlus size={14} />}
					loading={backgroundUploading}
					onClick={() => backgroundFileInputRef.current?.click()}
					disabled={saving}
					className="pointer-coarse:h-11"
				>
					커스텀 배경 업로드
				</Button>
				{image.background.dataUri && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => patchImage({ ...image, background: { presetId: "rose", dataUri: null } })}
						disabled={saving || backgroundUploading}
						className="pointer-coarse:h-11"
					>
						배경 초기화
					</Button>
				)}
			</div>
			<p className="text-2xs text-muted-foreground">3MB 이하 PNG·JPEG·WebP는 JPEG(긴 변 1600px)로 줄여 저장돼요.</p>

			<SectionLabel>템플릿</SectionLabel>
			<div className="flex flex-wrap gap-2">
				{GREETING_TEMPLATES.map((template) => (
					<Button
						key={template.id}
						variant="secondary"
						size="sm"
						icon={<LayoutTemplate size={14} />}
						disabled={saving}
						onClick={() => applyTemplate(template)}
						className="pointer-coarse:h-11"
					>
						{template.name}
					</Button>
				))}
			</div>

			<SectionLabel>요소 추가</SectionLabel>
			<div className="flex flex-wrap gap-2">
				<Button variant="secondary" size="sm" icon={<Type size={14} />} disabled={saving} onClick={() => addLayer(createTextLayer())} className="pointer-coarse:h-11">
					텍스트
				</Button>
				<Button variant="secondary" size="sm" icon={<UserRound size={14} />} disabled={saving} onClick={() => addLayer(createAvatarLayer())} className="pointer-coarse:h-11">
					아바타
				</Button>
				<Button variant="secondary" size="sm" icon={<Shapes size={14} />} disabled={saving} onClick={() => addLayer(createShapeLayer())} className="pointer-coarse:h-11">
					도형
				</Button>
				<input
					ref={fileInputRef}
					type="file"
					accept={ACCEPTED_IMAGE_TYPES}
					className="sr-only"
					onChange={(event) => {
						void handleImageUpload(event.target.files?.[0] ?? null);
						event.target.value = "";
					}}
				/>
				<Button
					variant="secondary"
					size="sm"
					icon={<ImagePlus size={14} />}
					loading={uploading}
					disabled={saving}
					onClick={() => fileInputRef.current?.click()}
					className="pointer-coarse:h-11"
				>
					이미지
				</Button>
			</div>

			<SectionLabel>레이어</SectionLabel>
			<LayerPanel
				layers={image.layers}
				selectedId={selectedId}
				saving={saving}
				onSelect={setSelectedId}
				onToggleHidden={toggleHidden}
				onRemove={removeLayer}
				onDuplicate={duplicateLayer}
				onMove={moveLayer}
			/>

			<SectionLabel>선택한 레이어 속성</SectionLabel>
			<LayerProperties layer={selectedLayer} saving={saving} onPatchLayer={patchLayer} />
		</div>
	);
}

/** 프리셋 그라디언트 스와치 — 서버 렌더러와 같은 그라디언트를 작은 캔버스로 그려요 */
function PresetSwatch({ id }: { id: string }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const gradient = presetGradient(id);
		ctx.fillStyle = gradient.base;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		const g = ctx.createLinearGradient(0, canvas.height, canvas.width, 0);
		g.addColorStop(0, gradient.from);
		g.addColorStop(1, gradient.to);
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}, [id]);
	return <canvas ref={ref} width={64} height={40} className="block h-10 w-16 rounded-sm" aria-hidden />;
}
