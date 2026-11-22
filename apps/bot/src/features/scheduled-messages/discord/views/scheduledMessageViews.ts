import { MessageFlags } from 'discord.js';
import { describeRecurrence, formatKstDateTime } from '@sirubot/utils/scheduledMessage';
import { notice } from '../../../../lib/notice.ts';
import type { ScheduledMessageEntry } from '../../application/scheduledMessageService.ts';

/** 한 줄 결과 안내 (Components V2) */
export function scheduledMessageNoticeView(message: string) {
	return { flags: MessageFlags.IsComponentsV2 as const, components: [notice(message)] };
}

const STATUS_LABELS = { pending: '대기', running: '보내는 중', failed: '실패' } as const;

/** 자동완성·목록에 쓰는 본문 요약 (줄바꿈은 공백으로) */
export function contentSnippet(content: string, max: number): string {
	const flat = content.replace(/\s+/g, ' ').trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** 목록 한 줄 */
export function scheduledMessageLine(entry: ScheduledMessageEntry): string {
	const when = entry.status === 'failed' ? `${formatKstDateTime(entry.runAt)} 실패` : formatKstDateTime(entry.runAt);
	const repeat = describeRecurrence(entry.recurrence);
	const error = entry.status === 'failed' && entry.lastError ? `\n  -# 이유: ${contentSnippet(entry.lastError, 120)}` : '';
	return `- <#${entry.channelId}> · ${when} · ${repeat} · ${STATUS_LABELS[entry.status]}\n  ${contentSnippet(entry.content, 80)}${error}`;
}

/** 목록 화면 — 4000자 안에 들어오도록 줄을 잘라요 */
export function scheduledMessageListView(entries: readonly ScheduledMessageEntry[]) {
	const header = `### 🕒 예약 메시지 ${entries.length}개`;
	const lines: string[] = [];
	let length = header.length;
	for (const entry of entries) {
		const line = scheduledMessageLine(entry);
		if (length + line.length + 1 > 3800) {
			lines.push(`-# 외 ${entries.length - lines.length}개는 대시보드에서 볼 수 있어요.`);
			break;
		}
		lines.push(line);
		length += line.length + 1;
	}
	return scheduledMessageNoticeView(`${header}\n${lines.join('\n')}`);
}
