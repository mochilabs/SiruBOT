import type { PendingRequestPool } from '@sirubot/utils';
import type { ILogObj, Logger } from 'tslog';

export type CorrelateOutcome = 'resolved' | 'unmatched' | 'malformed';

export interface CorrelateSchema<TResponse> {
	safeParse(data: unknown): { success: true; data: TResponse } | { success: false; error: { issues: { message?: string }[] } };
}

export interface CorrelateHubOptions<TResponse extends { requestId: string }, TMeta, TResult> {
	raw: string;
	hub: string;
	mismatch: string;
	logger: Logger<ILogObj>;
	schema: CorrelateSchema<TResponse>;
	pending: PendingRequestPool<TResult>;
	pendingMeta: Map<string, TMeta>;
	matches: (response: TResponse, meta: TMeta) => boolean;
	toResult: (response: TResponse) => TResult;
}

export function correlateHubResponse<TResponse extends { requestId: string }, TMeta, TResult>(
	options: CorrelateHubOptions<TResponse, TMeta, TResult>
): CorrelateOutcome {
	const { raw, hub, mismatch, logger, schema, pending, pendingMeta, matches, toResult } = options;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		logger.debug(`Malformed ${hub} response (not JSON): ${raw.slice(0, 120)}`);
		return 'malformed';
	}
	const result = schema.safeParse(parsed);
	if (!result.success) {
		logger.debug(`Malformed ${hub} response: ${result.error.issues[0]?.message ?? 'invalid shape'}`);
		return 'malformed';
	}
	const response = result.data;
	const meta = pendingMeta.get(response.requestId);
	if (!meta) return 'unmatched';
	// Ignore mismatched metadata rather than resolving; timeout cleans up.
	if (!matches(response, meta)) {
		logger.debug(`Ignored ${hub} response ${response.requestId}, ${mismatch}`);
		return 'unmatched';
	}
	pendingMeta.delete(response.requestId);
	pending.resolve(response.requestId, toResult(response));
	return 'resolved';
}
