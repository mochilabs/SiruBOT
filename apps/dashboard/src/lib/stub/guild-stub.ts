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
	{ id: "302", name: "멤버", color: null, position: 1, managed: false },
	{ id: "303", name: "게이머", color: "#5fb3a1", position: 3, managed: false },
	{ id: "304", name: "음악 감상", color: "#f0b232", position: 3, managed: false },
	{ id: "305", name: "공지 알림", color: "#ee6f8b", position: 2, managed: false },
	{ id: "306", name: "스터디", color: "#8a7bff", position: 2, managed: false }
];

const stubIso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const STUB_IMAGE = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#8a7bff"/><circle cx="160" cy="90" r="40" fill="#fff" opacity=".6"/></svg>');

const stubUuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stubPanelButton = (n: number, roleId: string, label: string, emoji: string | null, style: "secondary" | "primary" | "success" | "danger", position: number) => ({ id: stubUuid(n), roleId, label, emoji, style, position });

const STUB_ROLE_PANELS = [
	{
		id: "panel1", guildId: STUB_GUILD_ID, name: "관심사 역할", title: "관심사 역할을 골라요", description: "버튼을 누르면 역할을 받고, 한 번 더 누르면 해제돼요.", imageUrl: STUB_IMAGE, imageLayout: "gallery", imagePosition: "middle", accentColor: "#5fb3a1", mode: "button", clickCount: 342, channelId: "202", messageId: "900000000000000001", createdAt: stubIso(20), updatedAt: stubIso(2),
		buttons: [
			stubPanelButton(1, "303", "게이머", "🎮", "primary", 0),
			stubPanelButton(2, "304", "음악 감상", "🎧", "success", 1),
			stubPanelButton(3, "306", "스터디", "📚", "secondary", 2),
			stubPanelButton(4, "305", "공지 알림", "🔔", "danger", 3)
		]
	},
	{
		id: "panel2", guildId: STUB_GUILD_ID, name: "이벤트 알림", title: "이벤트 알림 받기", description: "이모지로 반응하면 이벤트 알림 역할을 받아요.", imageUrl: STUB_IMAGE, imageLayout: "thumbnail", imagePosition: "middle", accentColor: null, mode: "reaction", clickCount: 58, channelId: null, messageId: null, createdAt: stubIso(6), updatedAt: stubIso(6),
		buttons: [
			stubPanelButton(5, "305", "공지 알림", "🔔", "secondary", 0),
			stubPanelButton(6, "303", "게이머", "🎮", "secondary", 1)
		]
	},
	{
		id: "panel3", guildId: STUB_GUILD_ID, name: "새 패널", title: "역할 패널", description: "역할을 선택해 주세요.", imageUrl: null, imageLayout: "gallery", imagePosition: "middle", accentColor: null, mode: "button", clickCount: 0, channelId: null, messageId: null, createdAt: stubIso(0), updatedAt: stubIso(0),
		buttons: []
	}
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
			return {
					ok: true,
					prefix: "!",
					slashCount: 1,
					commands: [
						{ id: "cc1", name: "아침브리핑", description: "오늘 일정과 인사를 보내요", method: "prefix", spec: { steps: [{}, {}, {}] }, createdAt: stubIso(9), updatedAt: stubIso(2) },
						{ id: "cc2", name: "공지", description: "", method: "slash", spec: { steps: [{}] }, createdAt: stubIso(5), updatedAt: stubIso(5) }
					]
				};
		case "/assets":
			return {
					assets: [
						{ id: "as1", name: "welcome-banner.png", url: STUB_IMAGE, mimeType: "image/png", sizeBytes: 482_000, createdAt: stubIso(12) },
						{ id: "as2", name: "logo.webp", url: STUB_IMAGE, mimeType: "image/webp", sizeBytes: 96_000, createdAt: stubIso(4) },
						{ id: "as3", name: "event-poster.gif", url: STUB_IMAGE, mimeType: "image/gif", sizeBytes: 2_300_000, createdAt: stubIso(1) }
					]
				};
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
		case "/role-panels":
			return STUB_ROLE_PANELS;
		case "/live":
			return { player: null, hub: { guilds: 1, subscribed: true, staleMs: 0 } };
		case "/greeting":
			return { welcome: null, goodbye: null };
		case "/social/subscriptions":
			return {
					subscriptions: [
						{ id: "sub1", guildId: STUB_GUILD_ID, platform: "youtube", sourcePlatformId: "UC1", sourceName: "시루 공식 채널", targetChannelId: "203", messageTemplate: null, webhookName: null, webhookAvatarUrl: null, showThumbnail: true, status: "active", createdAt: stubIso(8), updatedAt: stubIso(8) },
						{ id: "sub2", guildId: STUB_GUILD_ID, platform: "chzzk", sourcePlatformId: "c2", sourceName: "시루 라이브", targetChannelId: "203", messageTemplate: "{channel} 방송 시작!", webhookName: "방송알림", webhookAvatarUrl: null, showThumbnail: false, status: "disabled", createdAt: stubIso(6), updatedAt: stubIso(3) },
						{ id: "sub3", guildId: STUB_GUILD_ID, platform: "twitch", sourcePlatformId: "t3", sourceName: "sirulive", targetChannelId: "203", messageTemplate: null, webhookName: null, webhookAvatarUrl: null, showThumbnail: true, status: "failed", createdAt: stubIso(3), updatedAt: stubIso(1) }
					]
				};
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
