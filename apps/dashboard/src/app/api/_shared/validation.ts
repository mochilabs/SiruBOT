import { z } from "zod";

import { MAX_PLAYLIST_DESCRIPTION_LENGTH } from "@/lib/playlist-constants";

export const playlistMetadataSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "플레이리스트 이름을 입력해 주세요.")
		.max(50, "이름은 최대 50자까지 입력할 수 있어요."),
	description: z
		.string()
		.trim()
		.max(
			MAX_PLAYLIST_DESCRIPTION_LENGTH,
			`설명은 최대 ${MAX_PLAYLIST_DESCRIPTION_LENGTH}자까지 입력할 수 있어요.`,
		)
		.nullish()
		.transform((value) => (value ? value : null)),
});

export const searchQuerySchema = z.object({
	query: z.string().trim().min(1).max(200),
});
