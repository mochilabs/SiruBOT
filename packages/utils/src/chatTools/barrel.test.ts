import { describe, expect, it } from 'vitest';
import * as shell from '../chatTools.ts';
import * as counting from './counting.ts';
import * as embedFix from './embedFix.ts';
import * as emoji from './emoji.ts';
import * as messageLink from './messageLink.ts';
import * as og from './og.ts';

describe('chatTools 재수출 셸', () => {
	const domains = { emoji, messageLink, embedFix, og, counting };

	it('셸 export가 도메인 모듈 export의 합집합과 같아요 (누락 재수출 방지)', () => {
		const domainKeys = Object.keys(domains.emoji).concat(
			Object.keys(domains.messageLink),
			Object.keys(domains.embedFix),
			Object.keys(domains.og),
			Object.keys(domains.counting)
		);
		expect(new Set(Object.keys(shell))).toEqual(new Set(domainKeys));
	});

	it('도메인 간 export 이름이 겹치지 않아요 (모호한 re-export 방지)', () => {
		const domainKeys = Object.keys(domains.emoji).concat(
			Object.keys(domains.messageLink),
			Object.keys(domains.embedFix),
			Object.keys(domains.og),
			Object.keys(domains.counting)
		);
		expect(new Set(domainKeys).size).toBe(domainKeys.length);
	});
});
