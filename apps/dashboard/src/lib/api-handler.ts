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
import { parseSettingBody } from "@/lib/schemas";
import { reportRouteError } from "@/lib/sentry";

export type ApiRouteRole = "manage" | "member" | "user" | "admin";

type AuthzOk<R extends ApiRouteRole> = R extends "manage" | "member" ? Extract<AuthorizeResult, { ok: true }> : Extract<UserAuthorizeResult, { ok: true }>;

type GuildId<R extends ApiRouteRole> = R extends "manage" | "member" ? string : never;

type DataOf<S> = S extends z.ZodType ? z.infer<S> : undefined;

export interface RateKeyInput {
	key: string;
	userId: string;
	guildId: string | null;
	params: Record<string, string>;
}

type RateOptions = { rate: RateRule; key: string; rateKey?: (input: RateKeyInput) => string } | { rate: null; key?: never; rateKey?: never };

export interface ApiHandlerContext<R extends ApiRouteRole, S extends z.ZodType | undefined> {
	request: Request;
	params: Record<string, string>;
	authz: AuthzOk<R>;
	guildId: GuildId<R>;
	data: DataOf<S>;
}

export type ApiHandlerOptions<R extends ApiRouteRole, S extends z.ZodType | undefined> = RateOptions & {
	role: R;
	schema?: S;
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
	return deniedUser(authz as Extract<UserAuthorizeResult, { ok: false }>);
}

function schemaAllowedKeys(schema: z.ZodType): readonly string[] {
	return Object.keys((schema as unknown as { shape?: Record<string, unknown> }).shape ?? {});
}

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
			const parsed = await parseSettingBody(request, options.schema, schemaAllowedKeys(options.schema), options.invalidMessage);
			if (!parsed.ok) return parsed.response;
			data = parsed.data;
		}

		let handlerResult: Response;
		try {
			handlerResult = await options.handler({
				request,
				params,
				authz,
				guildId,
				data,
			} as unknown as ApiHandlerContext<R, S>);
		} catch (error) {
			reportRouteError(error, {
				key: String(options.key ?? ''),
				role: options.role,
				guildId,
				userId: authz.userId ?? '',
			});
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
		return handlerResult;
	};
}
