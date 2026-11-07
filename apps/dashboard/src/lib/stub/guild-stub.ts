"use client";

import { TICKET_CONFIG_DEFAULTS } from "@sirubot/utils/ticket";

import { GUILD_SETTINGS_DEFAULTS } from "@/lib/schemas";

/**
 * 개발 전용 스텁 — 로그인·봇·data-api 없이 서버 대시보드 탭을 채워 보려고 window.fetch를 가로채요.
 * `/design/dashboard` 페이지에서만 설치하고(프로덕션이면 404라 도달하지 않아요) 언마운트하면 원복해요.
 * 쓰기 요청(PUT/POST/PATCH/DELETE)은 서버로 가지 않고 요청 본문을 합쳐 그대로 돌려줘요.
 */

export const STUB_GUILD_ID = "100000000000000001";

const ch = (id: string, name: string, type: number, parentId: string | null, position: number) => ({ id, name, type, parentId, position });

const CHANNELS = [
	ch("200", "일반", 4, null, 0),
	ch("201", "공지", 5, "200", 0),
	ch("202", "잡담", 0, "200", 1),
	ch("203", "음악-신청", 0, "200", 2),
	ch("204", "봇-명령어", 0, "200", 3),
	ch("210", "음성", 4, null, 1),
	ch("211", "라운지", 2, "210", 0),
	ch("212", "노래방", 2, "210", 1),
	ch("213", "방 만들기", 2, "210", 2),
	ch("214", "스테이지", 13, "210", 3)
];

const ROLES = [
	{ id: "300", name: "운영진", color: "#ff7a90", position: 5, managed: false },
	{ id: "301", name: "DJ", color: "#6ea8ff", position: 4, managed: false },
	{ id: "302", name: "멤버", color: null, position: 1, managed: false }
];

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

function stubGet(path: string): unknown | undefined {
	switch (path) {
		case "/settings":
			return { ...GUILD_SETTINGS_DEFAULTS, textChannelId: "203", voiceChannelId: "211", djRoleId: "301", jtcEnabled: true, jtcCategoryId: "210", jtcMarkerChannelId: "213" };
		case "/channels":
			return { channels: CHANNELS };
		case "/roles":
			return { roles: ROLES };
		case "/ai":
			return { mode: "off", channelIds: [], historyCount: 0 };
		case "/custom-commands":
			return { ok: true, prefix: "!", commands: [], slashCount: 0 };
		case "/assets":
			return { assets: [] };
		case "/bot-profile":
			return {
				profile: {
					guildId: STUB_GUILD_ID,
					nickname: "시루",
					username: "시루봇",
					guildAvatarUrl: null,
					guildBannerUrl: null,
					globalAvatarUrl: null,
					canChangeNickname: true,
					lastApply: null,
					updatedAt: Date.now()
				},
				hub: { guilds: 1, subscribed: true },
				refreshFailed: false
			};
		case "/live":
			return { player: null, hub: { guilds: 1, subscribed: true, staleMs: 0 } };
		case "/greeting":
			return { welcome: null, goodbye: null };
		case "/social/subscriptions":
			return { subscriptions: [] };
		case "/ticket":
			return { guildId: STUB_GUILD_ID, ...TICKET_CONFIG_DEFAULTS };
		case "/ticket/tickets":
			return { tickets: [] };
		case "/stats":
			return {
				ok: true,
				range: { days: 30, since: null },
				totalPlays: 128,
				topTracks: [],
				topRequesters: [],
				dailyCounts: [6, 4, 9, 12, 7, 15, 20].map((count, i) => ({ date: day(6 - i), count })),
				period: { first: day(6), last: day(0) }
			};
		default:
			return undefined;
	}
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** fetch 가로채기를 설치하고, 원복 함수를 돌려줘요 */
export function installGuildStub(): () => void {
	const original = window.fetch;
	window.fetch = async (input, init) => {
		const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		const url = new URL(raw, window.location.origin);
		const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

		if (url.pathname === "/api/auth/session") {
			return json({ user: { id: "1", name: "데모 관리자", image: null }, expires: new Date(Date.now() + 86_400_000).toISOString() });
		}
		if (url.pathname === "/api/servers") {
			return json({ guilds: [] });
		}
		const prefix = `/api/servers/${STUB_GUILD_ID}`;
		if (url.pathname.startsWith(prefix)) {
			const path = url.pathname.slice(prefix.length);
			const data = stubGet(path);
			if (method === "GET") return data === undefined ? json({ error: "스텁에 없는 요청이에요." }, 404) : json(data);
			let patch: unknown = {};
			try {
				patch = typeof init?.body === "string" ? JSON.parse(init.body) : {};
			} catch {
				/* 본문이 JSON이 아니면 무시해요 */
			}
			return json({ ...(typeof data === "object" && data ? data : {}), ...(typeof patch === "object" && patch ? patch : {}) });
		}
		return original(input, init);
	};
	return () => {
		window.fetch = original;
	};
}
