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
	viewportWidth: number; // 크로프 뷰포트 크기(CSS px)
	viewportHeight: number;
	outputWidth: number; // 저장 이미지 크기(px)
	outputHeight: number;
	/** 뷰포트 자리 마스크 클래스 — 아바타는 원형, 배너는 둥근 사각형이에요 */
	maskClass: string;
	/** 뷰포트 자리 클래스 */
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
		// Discord 멤버 배너 비율 16:5 — 논리 뷰포트 480×150, 저장 960×300이에요.
		// 뷰포트는 aspect로 잠가 좁은 화면에서도 종횡비가 유지돼요 (포인터 좌표는 displayScale로 환산).
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

/** 뷰포트 안으로 고정 — 이미지 언저리가 보이면 안 돼요 */
function clampOffset(viewport: number, displayed: number, offset: number): number {
	if (displayed <= viewport) return (viewport - displayed) / 2;
	return Math.min(0, Math.max(viewport - displayed, offset));
}

interface AvatarCropModalProps {
	source: File | null;
	/** 아바타(정사각형·원형 마스크) 또는 배너(16:5) — 배너는 뷰포트가 좁은 화면에서 가로로 꽉 차요 */
	shape: CropShape;
	onClose: () => void;
	onApply: (file: File) => void;
}

/** 봇 프로필 이미지 선택 후 크롭하는 모달 — 아바타는 원형, 배너는 16:5 사각형 마스크예요 */
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

	/** 표시 배율 — 뷰포트가 max-w로 축소된 폭 ÷ 논리 폭. 포인터 좌표를 논리 px로 되돌릴 때 써요. */
	const displayScale = useCallback(() => {
		const rect = viewportRef.current?.getBoundingClientRect();
		return rect && rect.width > 0 ? rect.width / spec.viewportWidth : 1;
	}, [spec]);

	// 파일을 img로 적재해요 — 로드 실패 시 모달 오류로 끝내요.
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

	// 그리기 — 캔버스에 표시 배율·오프셋 그대로 그려요 (DPR로 선명하게).
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
			// 커서 지점의 이미지 좌표가 그대로 머무는 앵커 줌 (표시 좌표 → 논리 좌표 환산)
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
		// 화면 배율로 드래그 변위를 논리 px로 환산해요 — 축소된 뷰포트에서도 잡은 지점이 손에 붙어요.
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
		// CSS px → 원본 px 비율 — 뷰포트 영역만 원본에서 골라내요.
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
							aria-label="크롭 영역 — 드래그로 위치를 옮기고 방향키도 쓸 수 있어요"
							tabIndex={0}
							onPointerDown={handlePointerDown}
							onPointerMove={handlePointerMove}
							onPointerUp={handlePointerUp}
							onPointerCancel={handlePointerUp}
							onKeyDown={handleKeyDown}
							className={`relative max-w-full touch-none select-none overflow-hidden bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${spec.viewportClass} ${
								dragging ? "cursor-grabbing" : "cursor-grab"
							}`}
						>
							<canvas
								ref={canvasRef}
								className="block w-full h-full"
							/>
							{/* 아바타 원형(또는 배너 사각) 마스크 — 뷰포트에 딱 맞춘 inset-0, 축소돼도 어긋나지 않아요 */}
							<div className="pointer-events-none absolute inset-0">
								<div className={`shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] ring-1 ring-white/10 ${spec.maskClass}`} />
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

/** 크로프 전 검증 — GIF는 애니메이션이 살아있어야 해서 자르지 않고 통과해요 */
export function shouldSkipCrop(file: File): boolean {
	return file.type === "image/gif";
}