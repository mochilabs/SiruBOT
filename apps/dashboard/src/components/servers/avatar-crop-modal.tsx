"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Modal } from "@/components/overlay/modal";
import { Button } from "@/components/primitives/button";
import { Slider } from "@/components/primitives/slider";

const VIEWPORT = 256; // 크로프 뷰포트 크기(CSS px)
const OUTPUT = 512; // 저장 이미지 크기(px) — 80px 아바타에 충분한 여윳값
const MAX_ZOOM = 3;

/** 이미지 좌표를 뷰포트 안으로 고정 — 이미지 언저리가 보이면 안 돼요 */
function clampOffset(displayed: number, offset: number): number {
	if (displayed <= VIEWPORT) return (VIEWPORT - displayed) / 2;
	return Math.min(0, Math.max(VIEWPORT - displayed, offset));
}

interface AvatarCropModalProps {
	source: File | null;
	onClose: () => void;
	onApply: (file: File) => void;
}

/** 봇 프로필 사진 선택 후 크롭하는 모달 — 원형 아바타처럼 보이는 정사각형 크로프예요 */
export function AvatarCropModal({ source, onClose, onApply }: AvatarCropModalProps) {
	const toast = useToast();
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

	// 파일을 img로 적재해요 — 로드 실패 시 모달 오류로 끝내요.
	useEffect(() => {
		if (!source) return;
		const url = URL.createObjectURL(source);
		const image = new Image();
		image.onload = () => {
			imageRef.current = image;
			const cover = Math.max(VIEWPORT / image.width, VIEWPORT / image.height);
			setFitScale(cover);
			setZoom(1);
			setOffset({ x: (VIEWPORT - image.width * cover) / 2, y: (VIEWPORT - image.height * cover) / 2 });
		};
		image.onerror = () => toast.error("이미지를 불러오지 못했어요.", "다른 이미지로 시도해 주세요.");
		image.src = url;
		return () => URL.revokeObjectURL(url);
	}, [source, toast]);

	// 그리기 — 캔버스에 표시 배율·오프셋 그대로 그려요 (DPR로 선명하게).
	useEffect(() => {
		const canvas = canvasRef.current;
		const image = imageRef.current;
		if (!canvas || !image || !crop) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = VIEWPORT * dpr;
		canvas.height = VIEWPORT * dpr;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, VIEWPORT, VIEWPORT);
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(image, offset.x, offset.y, crop.displayed.width, crop.displayed.height);
	}, [offset, crop, fitScale, zoom]);

	const handleWheel = useCallback(
		(event: WheelEvent) => {
			event.preventDefault();
			const image = imageRef.current;
			const rect = viewportRef.current?.getBoundingClientRect();
			if (!image || !rect) return;
			const nextZoom = Math.min(MAX_ZOOM, Math.max(1, zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
			if (nextZoom === zoom) return;
			// 커서 지점의 이미지 좌표가 그대로 머무는 앵커 줌
			const cursorX = event.clientX - rect.left;
			const cursorY = event.clientY - rect.top;
			const ratio = zoom / nextZoom;
			const width = image.width * fitScale * nextZoom;
			const height = image.height * fitScale * nextZoom;
			setOffset({
				x: clampOffset(width, cursorX - (cursorX - offset.x) * ratio),
				y: clampOffset(height, cursorY - (cursorY - offset.y) * ratio),
			});
			setZoom(nextZoom);
		},
		[zoom, fitScale, offset],
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
		setOffset({
			x: clampOffset(crop.displayed.width, offset.x + (event.clientX - drag.lastX)),
			y: clampOffset(crop.displayed.height, offset.y + (event.clientY - drag.lastY)),
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
			x: clampOffset(crop.displayed.width, offset.x + move[0]),
			y: clampOffset(crop.displayed.height, offset.y + move[1]),
		});
	};

	const handleApply = useCallback(() => {
		const image = imageRef.current;
		if (!image || !crop) return;
		const out = document.createElement("canvas");
		out.width = OUTPUT;
		out.height = OUTPUT;
		const ctx = out.getContext("2d");
		if (!ctx) {
			toast.error("이미지를 잘라내지 못했어요.", "잠시 후 다시 시도해 주세요.");
			return;
		}
		// CSS px → 원본 px 비율 — 뷰포트 영역만 원본에서 골라내요.
		const ratio = 1 / crop.scale;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(image, -offset.x * ratio, -offset.y * ratio, VIEWPORT * ratio, VIEWPORT * ratio, 0, 0, OUTPUT, OUTPUT);
		out.toBlob(
			(blob) => {
				if (!blob) {
					toast.error("이미지를 잘라내지 못했어요.", "잠시 후 다시 시도해 주세요.");
					return;
				}
				onApply(new File([blob], "avatar.png", { type: "image/png" }));
			},
			"image/png",
		);
	}, [crop, offset, onApply, toast]);

	const handleReset = () => {
		const image = imageRef.current;
		if (!image) return;
		const cover = Math.max(VIEWPORT / image.width, VIEWPORT / image.height);
		setZoom(1);
		setOffset({ x: (VIEWPORT - image.width * cover) / 2, y: (VIEWPORT - image.height * cover) / 2 });
	};

	return (
		<Modal open={source !== null} onClose={onClose}>
			<Modal.Header onClose={onClose}>프로필 사진 자르기</Modal.Header>
			<Modal.Body className="space-y-4">
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
						className={`relative h-[256px] w-[256px] touch-none select-none overflow-hidden rounded-control border border-border bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
							dragging ? "cursor-grabbing" : "cursor-grab"
						}`}
					>
						<canvas ref={canvasRef} className="h-[256px] w-[256px]" />
						{/* 원형 아바타 모양 마스크 — 바깥 어둡게, 안이 저장되는 영역이에요 */}
						<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
							<div className="h-[256px] w-[256px] rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] ring-1 ring-white/10" />
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
							x: clampOffset((crop?.displayed.width ?? 0) * ratio, prev.x * ratio),
							y: clampOffset((crop?.displayed.height ?? 0) * ratio, prev.y * ratio),
						}));
					}}
					showValue
					formatValue={(value) => `${Math.round(value * 100)}%`}
					disabled={!crop}
				/>
				<p className="text-center text-xs text-muted-foreground">
					드래그로 위치를 옮기고, 휠·슬라이더로 크기를 조절해요. GIF는 자르지 않고 그대로 저장돼요.
				</p>
			</Modal.Body>
			<Modal.Footer>
				<Button variant="ghost" size="md" icon={<RotateCcw size={14} />} onClick={handleReset} disabled={!crop}>
					원래대로
				</Button>
				<Button variant="secondary" size="md" onClick={onClose}>
					취소
				</Button>
				<Button variant="primary" size="md" onClick={handleApply} disabled={!crop}>
					적용
				</Button>
			</Modal.Footer>
		</Modal>
	);
}

/** 크로프 전 검증 — GIF는 애니메이션이 살아있어야 해서 자르지 않고 통과해요 */
export function shouldSkipCrop(file: File): boolean {
	return file.type === "image/gif";
}