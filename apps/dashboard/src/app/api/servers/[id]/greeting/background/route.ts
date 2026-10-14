import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { handleGreetingImageUpload } from "@/lib/greeting-image";

/**
 * 인사 카드 배경 업로드 정규화 — data-api의 JPEG 정규화
 * (/v1/image/member-card/background, 긴 변 1600px·900KB 이하)를 프록시해요.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const authz = await authorizeGuildManage(id);
	if (!authz.ok) return deniedGuildManage(authz);

	return handleGreetingImageUpload(request, authz, id, {
		rateLimitAction: "greeting-background",
		dataApiPath: "/v1/image/member-card/background",
		label: "배경 이미지",
		logName: "background",
	});
}