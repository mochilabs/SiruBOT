import { z } from "zod";

import { MAX_PLAYLIST_DESCRIPTION_LENGTH } from "@/lib/playlist-constants";

/** 플레이리스트 이름·설명 본문 — 생성(playlists)과 수정(playlists/[id])이 같은 계약을 써요. */
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

/** 곡 검색어 — 플레이리스트 유튜브 검색과 웹 플레이어 검색이 같은 조건을 써요. */
export const searchQuerySchema = z.object({
	query: z.string().trim().min(1).max(200),
});
