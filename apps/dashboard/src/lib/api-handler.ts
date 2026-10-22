import { NextResponse } from "next/server";
import { z } from "zod";

import {
	authorizeDashboardAdmin,
	authorizeGuildManage,
	authorizeGuildMember,
	type AuthorizeResult,
	authorizeUser,
	deniedGuildManage,
	deniedGuildMember,
	deniedUser,
	type UserAuthorizeResult,
} from "@/lib/api-guards";
import { guardRateLimit, rateKey as buildRateKey, type RateRule } from "@/lib/rate-limit";
import { zodError } from "@/lib/schemas";

/**
 * 라우트 게이트 역할 — `manage`/`member`는 길드 권한(세션 → accessToken → Discord 확인),
 * `user`는 로그인 세션만, `admin`은 운영자 allowlist(DASHBOARD_ADMIN_IDS fail-closed)예요.
 */
export type ApiRouteRole = "manage" | "member" | "user" | "admin";

/** 인가 성공 결과 — manage/member는 data-api·Discord 확인용 accessToken까지, user/admin은 userId만 가져요. */
type AuthzOk<R extends ApiRouteRole> = R extends "manage" | "member" ? Extract<AuthorizeResult, { ok: true }> : Extract<UserAuthorizeResult, { ok: true }>;

/** 길드 라우트에서만 값이 있는 [id] 세그먼트 — user/admin 라우트에서는 never라 잘못 쓰면 컴파일 오류예요. */
type GuildId<R extends ApiRouteRole> = R extends "manage" | "member" ? string : never;

/** schema를 주면 파싱 결과 타입, 안 주면 undefined예요. */
type DataOf<S> = S extends z.ZodType ? z.infer<S> : undefined;

/** 버킷 키 조립에 들어가는 값 — 기본 조립은 (key, userId[, guildId])예요. */
export interface RateKeyInput {
	key: string;
	userId: string;
	guildId: string | null;
	params: Record<string, string>;
}

/**
 * 레이트리밋 옵션 — `rate`와 `key`를 한 쌍으로 강제해서 "한도는 주는데 버킷 키는 빠뜨린"
 * 라우트를 컴파일로 막아요. 의도적으로 안 거는 라우트(SSE·공용 헬퍼가 대신 거는 업로드)는
 * `rate: null`을 명시해요.
 */
type RateOptions = { rate: RateRule; key: string; rateKey?: (input: RateKeyInput) => string } | { rate: null; key?: never; rateKey?: never };

export interface ApiHandlerContext<R extends ApiRouteRole, S extends z.ZodType | undefined> {
	request: Request;
	/** 동적 세그먼트 전부 — [assetId]·[cmdId]·[subId]처럼 [id] 외 세그먼트도 여기서 읽어요 */
	params: Record<string, string>;
	authz: AuthzOk<R>;
	/** [id] 세그먼트 — manage/member 라우트에서만 string이에요 */
	guildId: GuildId<R>;
	/** schema를 준 라우트에서만 값이 있어요 (JSON 본문 검증 결과) */
	data: DataOf<S>;
}

export type ApiHandlerOptions<R extends ApiRouteRole, S extends z.ZodType | undefined> = RateOptions & {
	role: R;
	/** JSON 본문 검증 — 생략하면 본문은 핸들러가 직접 다뤄요 (소유 검증이 본문 파싱보다 앞서거나 formData인 라우트) */
	schema?: S;
	/** schema 실패 시 고정 메시지 — 없으면 zodError로 첫 이슈 메시지를 그대로 내려요 */
	invalidMessage?: string;
	handler: (context: ApiHandlerContext<R, S>) => Response | Promise<Response>;
};

export type ApiRouteHandler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

function isGuildRole(role: ApiRouteRole): role is "manage" | "member" {
	return role === "manage" || role === "member";
}

async function authorizeRole(role: ApiRouteRole, guildId: string | null): Promise<AuthorizeResult | UserAuthorizeResult> {
	switch (role) {
		case "manage":
			return authorizeGuildManage(guildId ?? "");
		case "member":
			return authorizeGuildMember(guildId ?? "");
		case "user":
			return authorizeUser();
		case "admin":
			return authorizeDashboardAdmin();
	}
}

function deniedResponse(role: ApiRouteRole, authz: Extract<AuthorizeResult, { ok: false }> | Extract<UserAuthorizeResult, { ok: false }>): NextResponse {
	if (role === "manage") return deniedGuildManage(authz);
	if (role === "member") return deniedGuildMember(authz);
	// user/admin 게이트는 401/403만 만들지만 실패 타입은 넓은 AuthorizeResult와 합쳐져 있어요 — 캐스트로 좁혀요.
	return deniedUser(authz as Extract<UserAuthorizeResult, { ok: false }>);
}

/**
 * API 라우트 공용 진입 게이트 — `인가 → 레이트리밋 → (선택) JSON 본문 스키마 → 핸들러` 순서를 한곳에서 보장해요.
 *
 * 라우트는 `export const GET = createGuildApiHandler({ ... })` 형태로 내보내고, 핸들러는 이미
 * 인가·검증을 통과한 컨텍스트만 받으면 돼요. 응답 스키마·route별 에러 문구·500 처리는 각 라우트가
 * 그대로 책임져요 (이 래퍼는 handler를 추가 try/catch로 감싸지 않아요).
 *
 * 커버하지 않는 입구는 계획 문서의 매트릭스대로 라우트가 몸통에서 직접 처리해요:
 * - formData 업로드 → schema 없이 + rate 옵션만
 * - 소유 검증이 본문 파싱보다 앞서는 라우트 → schema 없이 parseSettingBody/zod를 핸들러에서
 * - SSE·공용 헬퍼가 이미 거는 레이트리밋 → rate: null 명시
 */
export function createGuildApiHandler<R extends ApiRouteRole, S extends z.ZodType | undefined = undefined>(
	options: ApiHandlerOptions<R, S>,
): ApiRouteHandler {
	return async (request, context) => {
		const params = await context.params;
		const guildId: string | null = isGuildRole(options.role) ? params.id : null;

		const authz = await authorizeRole(options.role, guildId);
		if (!authz.ok) return deniedResponse(options.role, authz);

		if (options.rate !== null) {
			const bucketKey = options.rateKey
				? options.rateKey({ key: options.key, userId: authz.userId, guildId, params })
				: guildId !== null
					? buildRateKey(options.key, authz.userId, guildId)
					: buildRateKey(options.key, authz.userId);
			const limited = await guardRateLimit(bucketKey, options.rate);
			if (limited) return limited;
		}

		let data: unknown = undefined;
		if (options.schema) {
			// JSON 파싱 실패는 null로 떨어져 스키마 검증 400으로 이어져요 — 기존 라우트의 안전한 본문 읽기와 같은 동작이에요.
			const parsed = options.schema.safeParse(await request.json().catch(() => null));
			if (!parsed.success) {
				return NextResponse.json({ error: options.invalidMessage ?? zodError(parsed.error) }, { status: 400 });
			}
			data = parsed.data;
		}

		// authz·guildId·data는 위 분기에서 role/schema에 맞는 값만 채워져요 — 조건부 타입을 객체 리터럴에 그대로 매칭할 수 없어 한 번에 캐스트해요.
		return await options.handler({
			request,
			params,
			authz,
			guildId,
			data,
		} as unknown as ApiHandlerContext<R, S>);
	};
}
