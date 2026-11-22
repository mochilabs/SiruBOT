import { createGuildApiHandler } from "@/lib/api-handler";
import { handleGreetingImageUpload } from "@/lib/greeting-image";

/**
 * 인사 카드 배경 업로드 정규화 — data-api의 정규화
 * (/v1/image/member-card/background — 정지 이미지는 JPEG 긴 변 1600px·900KB 이하, 움직이는 GIF는 GIF 900KB·5초 이하)를 프록시해요.
 * 레이트리밋은 handleGreetingImageUpload가 "greeting-background" 키로 걸어요 — `rate: null`은 의도된 위임이에요.
 */
export const POST = createGuildApiHandler({
	role: "manage",
	rate: null,
	handler: ({ guildId, request, authz }) =>
		handleGreetingImageUpload(request, authz, guildId, {
			rateLimitAction: "greeting-background",
			dataApiPath: "/v1/image/member-card/background",
			label: "배경 이미지",
			logName: "background",
			allowGif: true,
		}),
});
