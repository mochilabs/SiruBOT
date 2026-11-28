"use client";

import { m } from "framer-motion";

import { motionBase } from "@/components/motion/durations";

const containerVariants = {
	hidden: {},
	visible: { transition: { staggerChildren: 0.08 } },
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 8 },
	visible: { opacity: 1, y: 0, transition: { duration: motionBase, ease: [0.23, 1, 0.32, 1] } },
} as const;

interface RevealProps {
	stagger?: number;
	className?: string;
	children: React.ReactNode;
}

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

export function RevealItem({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<m.div className={className} variants={itemVariants}>
			{children}
		</m.div>
	);
}