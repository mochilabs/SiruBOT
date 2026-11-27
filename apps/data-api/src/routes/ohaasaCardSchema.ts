import { z } from 'zod';

export const ohaasaCardSchema = z.object({
	zodiacCode: z.string().regex(/^(0[1-9]|1[0-2])$/),
	rank: z.number().int().min(1).max(12),
	luckyItem: z.string().trim().max(300).optional(),
	luckyKey: z.string().trim().max(300).optional(),
	date: z.string().trim().max(40).default('')
});

export const ohaasaTopCardSchema = z.object({
	items: z
		.array(
			z.object({
				zodiacCode: z.string().regex(/^(0[1-9]|1[0-2])$/),
				rank: z.number().int().min(1).max(12)
			})
		)
		.min(1)
		.max(3),
	date: z.string().trim().max(40).default('')
});
