import { createApiFetcher } from "@/lib/swr";

export const fetcher = createApiFetcher<unknown>("요청을 처리하지 못했어요.");
