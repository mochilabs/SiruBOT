"use client";

import type { GreetingLayer } from "@sirubot/utils/memberGreeting";
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Image as ImageIcon, Shapes, Trash2, Type, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { layerLabel } from "./greeting-draw";

function layerTypeIcon(layer: GreetingLayer): React.ReactNode {
	switch (layer.type) {
		case "text":
			return <Type size={14} aria-hidden />;
		case "avatar":
			return <UserRound size={14} aria-hidden />;
		case "image":
			return <ImageIcon size={14} aria-hidden />;
		case "shape":
			return <Shapes size={14} aria-hidden />;
	}
}

interface LayerPanelProps {
	layers: GreetingLayer[];
	selectedId: string | null;
	saving: boolean;
	onSelect: (id: string) => void;
	onToggleHidden: (id: string) => void;
	onRemove: (id: string) => void;
	onDuplicate: (id: string) => void;
	onMove: (id: string, dir: 1 | -1) => void;
}

/** 레이어 목록 — 위=앞(가장 나중에 그려지는 레이어). 순서/보임/삭제/복제를 다뤄요. */
export function LayerPanel({ layers, selectedId, saving, onSelect, onToggleHidden, onRemove, onDuplicate, onMove }: LayerPanelProps) {
	if (layers.length === 0) {
		return <p className="text-sm text-muted-foreground">레이어가 없어요. 요소 추가에서 텍스트·아바타·이미지·도형을 추가해 보세요.</p>;
	}
	// 위=앞 → 배열 역순으로 표시 (배열 마지막이 최상단 레이어)
	const display = [...layers].map((layer, index) => ({ layer, arrayIndex: index })).reverse();

	return (
		<ul className="space-y-1.5" role="list">
			{display.map(({ layer, arrayIndex }) => {
				const selected = layer.id === selectedId;
				const hidden = layer.hidden === true;
				return (
					<li
						key={layer.id}
						className={cn(
							"flex items-center gap-1 rounded-control bg-surface-1 p-1",
							selected && "ring-2 ring-ring/40"
						)}
					>
						<button
							type="button"
							onClick={() => onSelect(layer.id)}
							className="flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<span className={cn("text-muted-foreground", hidden && "opacity-40")} aria-hidden>
								{layerTypeIcon(layer)}
							</span>
							<span className={cn("min-w-0 flex-1 truncate text-xs font-semibold", hidden ? "text-muted-foreground" : "text-foreground")}>
								{layerLabel(layer)}
							</span>
						</button>
						<Button
							variant="icon"
							size="sm"
							icon={hidden ? <EyeOff size={14} /> : <Eye size={14} />}
							aria-label={hidden ? "레이어 보이기" : "레이어 숨기기"}
							title={hidden ? "보이기" : "숨기기"}
							onClick={() => onToggleHidden(layer.id)}
							disabled={saving}
						/>
						<Button
							variant="icon"
							size="sm"
							icon={<ChevronUp size={14} />}
							aria-label="레이어 앞으로"
							title="앞으로"
							onClick={() => onMove(layer.id, 1)}
							disabled={saving || arrayIndex === layers.length - 1}
						/>
						<Button
							variant="icon"
							size="sm"
							icon={<ChevronDown size={14} />}
							aria-label="레이어 뒤로"
							title="뒤로"
							onClick={() => onMove(layer.id, -1)}
							disabled={saving || arrayIndex === 0}
						/>
						<Button
							variant="icon"
							size="sm"
							icon={<Copy size={14} />}
							aria-label="레이어 복제"
							title="복제"
							onClick={() => onDuplicate(layer.id)}
							disabled={saving}
						/>
						<Button
							variant="icon"
							size="sm"
							icon={<Trash2 size={14} />}
							aria-label="레이어 삭제"
							title="삭제"
							onClick={() => onRemove(layer.id)}
							disabled={saving}
						/>
					</li>
				);
			})}
		</ul>
	);
}
