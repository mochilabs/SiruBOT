"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
	children: React.ReactNode;
}

export function Portal({ children }: PortalProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		return () => setMounted(false);
	}, []);

	if (!mounted) return null;

	return createPortal(children, document.body);
}

export function usePopoverCoords(
	triggerRef: React.RefObject<HTMLElement | null>,
	open: boolean
) {
	const [coords, setCoords] = useState({ top: 0, left: 0, right: 0, rightSpace: 0, width: 0 });

	useEffect(() => {
		if (!open) return;

		const update = () => {
			const trigger = triggerRef.current;
			if (!trigger) return;
			const rect = trigger.getBoundingClientRect();
			setCoords({
				top: rect.bottom,
				left: rect.left,
				right: rect.right,
				rightSpace: document.documentElement.clientWidth - rect.right,
				width: rect.width,
			});
		};

		update();
		window.addEventListener("scroll", update, true);
		window.addEventListener("resize", update);

		return () => {
			window.removeEventListener("scroll", update, true);
			window.removeEventListener("resize", update);
		};
	}, [open, triggerRef]);

	return coords;
}
