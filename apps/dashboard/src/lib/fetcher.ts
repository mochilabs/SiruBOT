import { createApiFetcher } from "@/lib/swr";

/**
 * 전역 SWR 기본 fetcher — createApiFetcher 한 곳에 구현을 두고 위임해요.
 * 실패하면 서버의 한국어 메시지를 담은 ApiError를 던져 명시적 fetcher를 안 넘긴 조회도 같은 계약이에요.
 */
export const fetcher = createApiFetcher<unknown>("요청을 처리하지 못했어요.");
