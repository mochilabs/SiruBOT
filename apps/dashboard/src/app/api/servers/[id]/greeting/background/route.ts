import { createGuildApiHandler } from "@/lib/api-handler";
import { handleGreetingImageUpload } from "@/lib/greeting-image";

// 레이트리밋은 handleGreetingImageUpload 내부에서 "greeting-background" 키로 걸어요.
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
