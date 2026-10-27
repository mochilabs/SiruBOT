import { container } from '@sapphire/framework';
import { TICKET_TRANSCRIPT_BUCKET } from '@sirubot/utils';
import { gzipSync } from 'node:zlib';
import type { Guild, TextChannel } from 'discord.js';
import type { Ticket } from '@sirubot/prisma';
import { uploadObject } from './dataApiClient.ts';

/**
 * 티켓 대화 기록(transcript) 저장 — 마감 5초 뒤 채널이 삭제되므로 그 전에 원문을 남겨요.
 *
 * 경로: 비공개 버킷 `ticket-transcripts/{guildId}/{ticketId}.json.gz`
 *  - storage의 공개 GET은 이 버킷을 404로 막고, 대시보드가 storage 인증으로 받아 관리자에게만 보여줘요.
 *  - 형식: JSON(gzip) — Discord가 주는 메시지 필드만 필요한 것만 골라 담아요(첨부 원본은 URL만).
 *
 * 실패해도 마감 자체는 계속돼요(티켓 상태는 이미 closed). 실패 사유는 로그·Sentry에만 남겨요.
 */

/** 한 티켓에서 저장하는 최대 메시지 수 — 오래 걸린 채널도 상한을 둬 transcript 폭주를 막아요 */
const MAX_TRANSCRIPT_MESSAGES = 500;
/** Discord API 페이지 상한 */
const FETCH_PAGE_SIZE = 100;

export interface TranscriptMessage {
	id: string;
	authorId: string;
	authorTag: string;
	bot: boolean;
	createdAt: string;
	content: string;
	editedAt: string | null;
	attachments: { name: string; url: string; contentType: string | null; size: number }[];
}

export interface TranscriptFile {
	version: 1;
	guildId: string;
	ticketId: string;
	ticketNumber: number;
	ownerId: string;
	closedById: string | null;
	closeReason: string | null;
	openedAt: string;
	closedAt: string | null;
	messageCount: number;
	truncated: boolean;
	messages: TranscriptMessage[];
}

/** 저장 키 — 대시보드가 같은 규칙으로 조회해요 (계약 중복 방지: 이 함수만 쓰고 문자열을 흩뿌리지 않아요) */
export function ticketTranscriptKey(guildId: string, ticketId: string): string {
	return `${guildId}/${ticketId}.json.gz`;
}

/** 채널 메시지를 오래된 순으로 모아요 — API rate limit을 피하려고 100개씩 순차 조회해요 */
async function collectMessages(channel: TextChannel): Promise<{ messages: TranscriptMessage[]; truncated: boolean }> {
	const collected: TranscriptMessage[] = [];
	let before: string | undefined;
	let truncated = false;

	while (collected.length < MAX_TRANSCRIPT_MESSAGES) {
		const batch = await channel.messages.fetch({ limit: FETCH_PAGE_SIZE, before });
		if (batch.size === 0) break;
		for (const message of batch.values()) {
			collected.push({
				id: message.id,
				authorId: message.author.id,
				authorTag: message.author.tag,
				bot: message.author.bot,
				createdAt: message.createdAt.toISOString(),
				content: message.content,
				editedAt: message.editedAt?.toISOString() ?? null,
				attachments: [...message.attachments.values()].map((attachment) => ({
					name: attachment.name,
					url: attachment.url,
					contentType: attachment.contentType ?? null,
					size: attachment.size
				}))
			});
			if (collected.length >= MAX_TRANSCRIPT_MESSAGES) {
				truncated = batch.size === FETCH_PAGE_SIZE || batch.size > 0;
				break;
			}
		}
		before = batch.last()?.id;
		if (batch.size < FETCH_PAGE_SIZE) break;
	}

	// fetch는 최신→과거 순이므로 뒤집어 시간순으로 저장해요
	collected.reverse();
	return { messages: collected, truncated };
}

/**
 * 저장 시도 — 성공하면 저장 키를 돌려줘요. 실패하면 null(로그만).
 * 호출부(closeTicket)는 이 값을 `Ticket.transcriptKey`에 기록해요.
 */
export async function saveTicketTranscript(
	guild: Guild,
	ticket: Ticket,
	closedById: string | null,
	closeReason: string | null
): Promise<string | null> {
	const channel = guild.channels.cache.get(ticket.channelId);
	if (!channel || !channel.isTextBased()) {
		container.logger.warn(`[ticket] transcript skipped: channel ${ticket.channelId} not available`);
		return null;
	}

	try {
		const { messages, truncated } = await collectMessages(channel as TextChannel);
		const file: TranscriptFile = {
			version: 1,
			guildId: ticket.guildId,
			ticketId: ticket.id,
			ticketNumber: ticket.ticketNumber,
			ownerId: ticket.ownerId,
			closedById,
			closeReason,
			openedAt: ticket.createdAt.toISOString(),
			closedAt: new Date().toISOString(),
			messageCount: messages.length,
			truncated,
			messages
		};

		const key = ticketTranscriptKey(ticket.guildId, ticket.id);
		const payload = gzipSync(Buffer.from(JSON.stringify(file), 'utf8'));
		const saved = await uploadObject(TICKET_TRANSCRIPT_BUCKET, key, payload, 'application/gzip');
		if (!saved) {
			container.logger.warn(`[ticket] transcript upload skipped/failed for ${ticket.id} (storage 미설정 또는 오류)`);
			return null;
		}
		return key;
	} catch (error) {
		container.logger.error(`[ticket] transcript failed for ${ticket.id}: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}
