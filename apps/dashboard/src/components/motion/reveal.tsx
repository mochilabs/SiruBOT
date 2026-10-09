"use client";

import { m } from "framer-motion";

const containerVariants = {
	hidden: {},
	visible: { transition: { staggerChildren: 0.08 } },
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 24 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
} as const;

interface RevealProps {
	/** 스태거 간격(초). 기본 0.08 */
	stagger?: number;
	className?: string;
	children: React.ReactNode;
}

/**
 * 자식들을 시간차(스태거)로 등장시키는 컨테이너.
 * 자식은 반드시 `RevealItem`만 사용한다.
 *
 * ```tsx
 * <RevealGroup className="grid gap-4 sm:grid-cols-3">
 * 	{cards.map((c) => <RevealItem key={c.id}>{...}</RevealItem>)}
 * </RevealGroup>
 * ```
 */
export function RevealGroup({ stagger = 0.08, className, children }: RevealProps) {
	return (
		<m.div
			className={className}
			variants={{ ...containerVariants, visible: { transition: { staggerChildren: stagger } } }}
			initial="hidden"
			whileInView="visible"
			viewport={{ once: true, margin: "-60px" }}
		>
			{children}
		</m.div>
	);
}

/**
 * `RevealGroup` 안에서 개별 항목을 감싸는 래퍼. 별도 props 없음.
 */
export function RevealItem({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<m.div className={className} variants={itemVariants}>
			{children}
		</m.div>
	);
}