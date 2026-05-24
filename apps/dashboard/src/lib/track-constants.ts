export const PAGE_SIZE = 50;

export const fixedTrackFilter = {
	duration: {
		gt: 60 * 1000,
		lt: 60 * 1000 * 60,
	},
	totalPlays: {
		gt: 10,
	},
} as const;
