import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { handleGreetingImageUpload } from "@/lib/greeting-image";

/**
 * 인사 카드 이미지 레이어 업로드 정규화 — 배경(JPEG)과 달리 투명도를 보존하기 위해
 * data-api의 PNG 정규화(/v1/image/member-card/layer-image, 긴 변 1200px·900KB 이하)를 프록시해요.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const authz = await authorizeGuildManage(id);
	if (!authz.ok) return deniedGuildManage(authz);

	return handleGreetingImageUpload(request, authz, id, {
		rateLimitAction: "greeting-layer-image",
		dataApiPath: "/v1/image/member-card/layer-image",
		label: "이미지",
		logName: "layer image",
	});
}