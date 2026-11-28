import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
	role: "manage",
	rate: READ_RATE,
	key: "ticket-list-get",
	handler: async ({ guildId, request }) => {
		const status = new URL(request.url).searchParams.get("status");
		try {
			const tickets = await db.ticket.findMany({
				where: { guildId, ...(status === "open" || status === "closed" ? { status } : {}) },
				orderBy: [{ createdAt: "desc" }],
				take: 100,
				select: {
					id: true,
					channelId: true,
					ticketNumber: true,
					ownerId: true,
					status: true,
					claimedById: true,
					closedById: true,
					closeReason: true,
					transcriptKey: true,
					transcribedAt: true,
					createdAt: true,
					closedAt: true
				}
			});
			return NextResponse.json({ tickets });
		} catch (error) {
			console.error("Failed to load tickets:", error);
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
	}
});

export const POST = createGuildApiHandler({
	role: "manage",
	rate: WRITE_RATE,
	key: "ticket-force-close",
	handler: async ({ guildId, request }) => {
		const body = (await request.json().catch(() => null)) as { ticketId?: unknown; reason?: unknown } | null;
		const ticketId = typeof body?.ticketId === "string" ? body.ticketId : "";
		const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : "대시보드에서 마감";
		if (!ticketId) return NextResponse.json({ error: "티켓 ID가 필요해요." }, { status: 400 });

		const ticket = await db.ticket.findFirst({ where: { id: ticketId, guildId }, select: { id: true, status: true } });
		if (!ticket) return NextResponse.json({ error: "티켓을 찾을 수 없어요." }, { status: 404 });
		if (ticket.status !== "open") return NextResponse.json({ error: "이미 마감된 티켓이에요." }, { status: 409 });

		const updated = await db.ticket.update({
			where: { id: ticket.id },
			data: { status: "closed", closeReason: reason, closedAt: new Date() }
		});
		return NextResponse.json({ ticket: updated });
	}
});
