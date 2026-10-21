import { createGuildApiHandler } from "@/lib/api-handler";
import { handleGreetingImageUpload } from "@/lib/greeting-image";

/**
 * 인사 카드 이미지 레이어 업로드 정규화 — 배경(JPEG)과 달리 투명도를 보존하기 위해
 * data-api의 PNG 정규화(/v1/image/member-card/layer-image, 긴 변 1200px·900KB 이하)를 프록시해요.
 * 레이트리밋은 handleGreetingImageUpload가 "greeting-layer-image" 키로 걸어요 — `rate: null`은 의도된 위임이에요.
 */
export const POST = createGuildApiHandler({
	role: "manage",
	rate: null,
	handler: ({ guildId, request, authz }) =>
		handleGreetingImageUpload(request, authz, guildId, {
			rateLimitAction: "greeting-layer-image",
			dataApiPath: "/v1/image/member-card/layer-image",
			label: "이미지",
			logName: "layer image",
		}),
});
