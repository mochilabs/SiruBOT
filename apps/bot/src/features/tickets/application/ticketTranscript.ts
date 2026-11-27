import { TICKET_TRANSCRIPT_BUCKET } from '@sirubot/utils';
import { gzipSync } from 'node:zlib';
import type { Ticket } from '@sirubot/prisma';
import type { AppLogger } from '../../../lib/appLogger.ts';

export type UploadObject = (
	bucket: string,
	key: string,
	bytes: Uint8Array,
	contentType: string
) => Promise<{ key: string; url: string | null } | null>;

export interface TicketTranscriptDeps {
	logger: AppLogger;
	uploadObject: UploadObject;
}

const MAX_TRANSCRIPT_MESSAGES = 500;
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

/** 대시보드가 같은 규칙으로 조회하는 비공개 버킷 저장 키 */
export function ticketTranscriptKey(guildId: string, ticketId: string): string {
	return `${guildId}/${ticketId}.json.gz`;
}

export interface TranscriptSourceMessage {
	id: string;
	author: { id: string; tag: string; bot: boolean };
	createdAt: Date;
	content: string;
	editedAt: Date | null;
	attachments: { values(): Iterable<{ name: string; url: string; contentType?: string | null; size: number }> };
}

export interface TranscriptMessageBatch {
	readonly size: number;
	values(): Iterable<TranscriptSourceMessage>;
	last(): TranscriptSourceMessage | undefined;
}

/** 대화 기록을 읽을 텍스트 채널 포트 (discord.js TextBasedChannel이 만족해요) */
export interface TranscriptChannelPort {
	messages: { fetch(options: { limit: number; before?: string }): Promise<TranscriptMessageBatch> };
}

/** 채널 메시지를 오래된 순으로 모아요 — API rate limit을 피하려고 100개씩 순차 조회해요 */
async function collectMessages(channel: TranscriptChannelPort): Promise<{ messages: TranscriptMessage[]; truncated: boolean }> {
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
/** channel은 호출부가 티켓 채널을 찾아 텍스트 채널일 때만 넘겨요 (없으면 null). */
export async function saveTicketTranscript(
	deps: TicketTranscriptDeps,
	channel: TranscriptChannelPort | null,
	ticket: Ticket,
	closedById: string | null,
	closeReason: string | null
): Promise<string | null> {
	if (!channel) {
		deps.logger.warn(`[ticket] transcript skipped: channel ${ticket.channelId} not available`);
		return null;
	}

	try {
		const { messages, truncated } = await collectMessages(channel);
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
		const saved = await deps.uploadObject(TICKET_TRANSCRIPT_BUCKET, key, payload, 'application/gzip');
		if (!saved) {
			deps.logger.warn(`[ticket] transcript upload skipped/failed for ${ticket.id} (storage 미설정 또는 오류)`);
			return null;
		}
		return key;
	} catch (error) {
		deps.logger.error(`[ticket] transcript failed for ${ticket.id}: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}
