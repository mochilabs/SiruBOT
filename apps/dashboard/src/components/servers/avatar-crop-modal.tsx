"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/toast";

const MAX_ZOOM = 3;

interface ShapeSpec {
	viewportWidth: number;
	viewportHeight: number;
	outputWidth: number;
	outputHeight: number;
	maskClass: string;
	viewportClass: string;
	title: string;
	outputName: string;
}

const SHAPES: Record<CropShape, ShapeSpec> = {
	avatar: {
		viewportWidth: 256,
		viewportHeight: 256,
		outputWidth: 512,
		outputHeight: 512,
		maskClass: "rounded-full",
		viewportClass: "h-[256px] w-[256px] rounded-full",
		title: "프로필 사진 자르기",
		outputName: "avatar.png",
	},
	banner: {
		viewportWidth: 480,
		viewportHeight: 150,
		outputWidth: 960,
		outputHeight: 300,
		maskClass: "rounded-card",
		viewportClass: "w-full max-w-[480px] aspect-[16/5] rounded-card",
		title: "배너 자르기",
		outputName: "banner.png",
	},
};

export type CropShape = "avatar" | "banner";

function clampOffset(viewport: number, displayed: number, offset: number): number {
	if (displayed <= viewport) return (viewport - displayed) / 2;
	return Math.min(0, Math.max(viewport - displayed, offset));
}

interface AvatarCropModalProps {
	source: File | null;
	shape: CropShape;
	onClose: () => void;
	onApply: (file: File) => void;
}

export function AvatarCropModal({ source, shape, onClose, onApply }: AvatarCropModalProps) {
	const toast = useToast();
	const spec = SHAPES[shape];
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const imageRef = useRef<HTMLImageElement | null>(null);
	const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

	const [fitScale, setFitScale] = useState(1);
	const [zoom, setZoom] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [dragging, setDragging] = useState(false);

	const crop = useMemo(() => {
		const image = imageRef.current;
		if (!image) return null;
		const scale = fitScale * zoom;
		const displayed = { width: image.width * scale, height: image.height * scale };
		return { scale, offset, displayed };
	}, [fitScale, zoom, offset]);

	const displayScale = useCallback(() => {
		const rect = viewportRef.current?.getBoundingClientRect();
		return rect && rect.width > 0 ? rect.width / spec.viewportWidth : 1;
	}, [spec]);

	useEffect(() => {
		if (!source) return;
		const url = URL.createObjectURL(source);
		const image = new Image();
		image.onload = () => {
			imageRef.current = image;
			const cover = Math.max(spec.viewportWidth / image.width, spec.viewportHeight / image.height);
			setFitScale(cover);
			setZoom(1);
			setOffset({
				x: (spec.viewportWidth - image.width * cover) / 2,
				y: (spec.viewportHeight - image.height * cover) / 2,
			});
		};
		image.onerror = () => toast.error("이미지를 불러오지 못했어요.", "다른 이미지로 시도해 주세요.");
		image.src = url;
		return () => URL.revokeObjectURL(url);
		// spec은 shape에 따라 고정이에요 — source가 바뀔 때만 다시 적재해요. toast는 정숫값이라 deps에 안 돼요.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [source]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const image = imageRef.current;
		if (!canvas || !image || !crop) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = spec.viewportWidth * dpr;
		canvas.height = spec.viewportHeight * dpr;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, spec.viewportWidth, spec.viewportHeight);
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(image, offset.x, offset.y, crop.displayed.width, crop.displayed.height);
	}, [offset, crop, fitScale, zoom, spec]);

	const handleWheel = useCallback(
		(event: WheelEvent) => {
			event.preventDefault();
			const image = imageRef.current;
			const rect = viewportRef.current?.getBoundingClientRect();
			if (!image || !rect) return;
			const nextZoom = Math.min(MAX_ZOOM, Math.max(1, zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
			if (nextZoom === zoom) return;
			const scale = rect.width > 0 ? rect.width / spec.viewportWidth : 1;
			const cursorX = (event.clientX - rect.left) / scale;
			const cursorY = (event.clientY - rect.top) / scale;
			const ratio = zoom / nextZoom;
			const width = image.width * fitScale * nextZoom;
			const height = image.height * fitScale * nextZoom;
			setOffset({
				x: clampOffset(spec.viewportWidth, width, cursorX - (cursorX - offset.x) * ratio),
				y: clampOffset(spec.viewportHeight, height, cursorY - (cursorY - offset.y) * ratio),
			});
			setZoom(nextZoom);
		},
		[zoom, fitScale, offset, spec],
	);

	// 휠은 preventDefault가 필요해 passive 리스너도 등록해요.
	useEffect(() => {
		const el = viewportRef.current;
		if (!el || !crop) return;
		el.addEventListener("wheel", handleWheel, { passive: false });
		return () => el.removeEventListener("wheel", handleWheel);
	}, [crop, handleWheel]);

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!crop) return;
		dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
		event.currentTarget.setPointerCapture(event.pointerId);
		setDragging(true);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId || !crop) return;
		const scale = displayScale();
		setOffset({
			x: clampOffset(spec.viewportWidth, crop.displayed.width, offset.x + (event.clientX - drag.lastX) / scale),
			y: clampOffset(spec.viewportHeight, crop.displayed.height, offset.y + (event.clientY - drag.lastY) / scale),
		});
		drag.lastX = event.clientX;
		drag.lastY = event.clientY;
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		if (dragRef.current?.pointerId !== event.pointerId) return;
		dragRef.current = null;
		event.currentTarget.releasePointerCapture(event.pointerId);
		setDragging(false);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (!crop) return;
		const move = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
		if (!move) return;
		event.preventDefault();
		setOffset({
			x: clampOffset(spec.viewportWidth, crop.displayed.width, offset.x + move[0]),
			y: clampOffset(spec.viewportHeight, crop.displayed.height, offset.y + move[1]),
		});
	};

	const handleApply = useCallback(() => {
		const image = imageRef.current;
		if (!image || !crop) return;
		const out = document.createElement("canvas");
		out.width = spec.outputWidth;
		out.height = spec.outputHeight;
		const ctx = out.getContext("2d");
		if (!ctx) {
			toast.error("이미지를 잘라내지 못했어요.", "잠시 후 다시 시도해 주세요.");
			return;
		}
		const ratio = 1 / crop.scale;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(
			image,
			-offset.x * ratio,
			-offset.y * ratio,
			spec.viewportWidth * ratio,
			spec.viewportHeight * ratio,
			0,
			0,
			spec.outputWidth,
			spec.outputHeight,
		);
		out.toBlob(
			(blob) => {
				if (!blob) {
					toast.error("이미지를 잘라내지 못했어요.", "잠시 후 다시 시도해 주세요.");
					return;
				}
				onApply(new File([blob], spec.outputName, { type: "image/png" }));
			},
			"image/png",
		);
	}, [crop, offset, onApply, spec, toast]);

	const handleReset = () => {
		const image = imageRef.current;
		if (!image) return;
		const cover = Math.max(spec.viewportWidth / image.width, spec.viewportHeight / image.height);
		setZoom(1);
		setOffset({
			x: (spec.viewportWidth - image.width * cover) / 2,
			y: (spec.viewportHeight - image.height * cover) / 2,
		});
	};

	return (
		<Dialog open={source !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{spec.title}</DialogTitle>
					<DialogDescription>
						드래그로 위치를 옮기고, 휠·슬라이더로 크기를 조절해요. GIF는 자르지 않고 그대로 저장돼요.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="flex justify-center">
						<div
							ref={viewportRef}
							role="application"
							aria-label="크롭 영역, 드래그로 위치를 옮기고 방향키도 쓸 수 있어요"
							tabIndex={0}
							onPointerDown={handlePointerDown}
							onPointerMove={handlePointerMove}
							onPointerUp={handlePointerUp}
							onPointerCancel={handlePointerUp}
							onKeyDown={handleKeyDown}
							className={`relative max-w-full touch-none select-none overflow-hidden bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-ring ${spec.viewportClass} ${
								dragging ? "cursor-grabbing" : "cursor-grab"
							}`}
						>
							<canvas
								ref={canvasRef}
								className="block w-full h-full"
							/>
							<div className="pointer-events-none absolute inset-0">
								{/* 마스크 div 자체는 w-full h-full이어야 9999px 확산 shadow가 뷰포트 "바깥"만 덮어요 —
								    크기가 0이면 shadow가 크롭 영역까지 전부 덮어 이미지가 어둡게 보여요. */}
								<div className={`h-full w-full shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] ring-1 ring-border ${spec.maskClass}`} />
							</div>
						</div>
					</div>
					<Slider
						label="크기"
						min={1}
						max={MAX_ZOOM}
						step={0.01}
						value={zoom}
						onChange={(value) => {
							setZoom(value);
							const ratio = value / zoom;
							setOffset((prev) => ({
								x: clampOffset(spec.viewportWidth, (crop?.displayed.width ?? 0) * ratio, prev.x * ratio),
								y: clampOffset(spec.viewportHeight, (crop?.displayed.height ?? 0) * ratio, prev.y * ratio),
							}));
						}}
						showValue
						formatValue={(value) => `${Math.round(value * 100)}%`}
						disabled={!crop}
					/>
				</div>
				<DialogFooter>
					<Button variant="ghost" size="md" icon={<RotateCcw size={14} />} onClick={handleReset} disabled={!crop}>
						원래대로
					</Button>
					<Button variant="secondary" size="md" onClick={onClose}>
						취소
					</Button>
					<Button variant="primary" size="md" onClick={handleApply} disabled={!crop}>
						적용
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function shouldSkipCrop(file: File): boolean {
	return file.type === "image/gif";
}