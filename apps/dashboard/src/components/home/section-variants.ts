/** 홈 섹션들의 공용 진입 variants — 위에서 살짝 떠오르는 페이드업 1회 (히어로의 spring variants와는 다른 형태) */
export const sectionVariants = {
	hidden: { opacity: 0, y: 24 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
} as const;