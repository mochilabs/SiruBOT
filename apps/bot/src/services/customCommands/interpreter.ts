/**
 * 커스텀 명령어 인터프리터 — 검증된 스펙의 스텝을 순차 실행해요.
 *
 * - 지금은 send_message / delay 두 스텝만 있어요. v2 액션 추가는 utils의 customCommandStepSchema와
 *   이 switch를 함께 확장해요.
 * - 최대 600초의 대기를 품을 수 있어 실행이 메시지 이벤트 처리보다 오래 남아요. 봇 재시작 시
 *   진행 중 실행은 함께 끝나요 (재개 없음 — v1 계약).
 * - send 실패(채널 삭제·권한 상실 등)면 같은 실행의 남은 스텝을 중단해요 — 뒤 스텝도 같은 채널에
 *   보내야 하므로 어차피 실패할 거예요.
 */
import { customCommandSpecSchema } from '@sirubot/utils';

export interface CustomCommandChannel {
	/** 멘션 해석은 항상 꺼야 해요 — 커스텀 명령어 메시지의 @everyone/@here 악용 방지 */
	send(payload: { content: string; allowedMentions: { parse: [] } }): Promise<unknown>;
}

export type CustomCommandRunResult = { kind: 'ok'; sent: number } | { kind: 'invalid_spec' } | { kind: 'send_failed'; sent: number; error: unknown };

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runCustomCommandSpec(rawSpec: unknown, channel: CustomCommandChannel): Promise<CustomCommandRunResult> {
	const parsed = customCommandSpecSchema.safeParse(rawSpec);
	if (!parsed.success) return { kind: 'invalid_spec' };

	let sent = 0;
	for (const step of parsed.data.steps) {
		if (step.type === 'delay') {
			await sleep(step.seconds * 1000);
			continue;
		}
		try {
			await channel.send({ content: step.text, allowedMentions: { parse: [] } });
			sent++;
		} catch (error) {
			return { kind: 'send_failed', sent, error };
		}
	}
	return { kind: 'ok', sent };
}
