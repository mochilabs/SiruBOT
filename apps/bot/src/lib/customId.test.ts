import { beforeEach, describe, expect, it } from 'vitest';
import { CUSTOM_ID_MAX_LENGTH, defineCustomId, field, registeredCustomIdNamespaces, resetCustomIdRegistryForTesting } from './customId.ts';

const USER = '123456789012345678';

function demo() {
	return defineCustomId({
		namespace: 'demo',
		version: 1,
		actions: {
			open: {},
			page: { ownerId: field.snowflake(), page: field.uint({ maxDigits: 7 }) },
			pick: { token: field.nullable(field.token({ maxLength: 20 })), mode: field.oneOf(['a', 'b'] as const) }
		}
	});
}

describe('customId codec', () => {
	beforeEach(() => resetCustomIdRegistryForTesting());

	it('round-trips every action', () => {
		const id = demo();
		expect(id.encode('open')).toBe('demo:v1:open');
		expect(id.decode('demo:v1:open')).toEqual({ action: 'open' });
		expect(id.decode(id.encode('page', { ownerId: USER, page: 3 }))).toEqual({ action: 'page', ownerId: USER, page: 3 });
		expect(id.decode(id.encode('pick', { token: 'x.1', mode: 'b' }))).toEqual({ action: 'pick', token: 'x.1', mode: 'b' });
		expect(id.encode('pick', { token: null, mode: 'a' })).toBe('demo:v1:pick:-:a');
		expect(id.decode('demo:v1:pick:-:a')).toEqual({ action: 'pick', token: null, mode: 'a' });
	});

	it('returns null for another namespace or version', () => {
		const id = demo();
		expect(id.decode('other:v1:open')).toBeNull();
		expect(id.decode('demo:v2:open')).toBeNull();
		expect(id.decode('demo:open')).toBeNull();
	});

	it.each([
		'',
		'demo:v1:',
		'demo:v1:unknown',
		'demo:v1:open:extra',
		'demo:v1:page',
		`demo:v1:page:${USER}`,
		'demo:v1:page:abc:1',
		`demo:v1:page:${USER}:01`,
		`demo:v1:page:${USER}:-1`,
		`demo:v1:page:${USER}:12345678`,
		`demo:v1:page:${USER}:1:2`,
		'demo:v1:pick:x:c',
		'demo:v1:pick:-x:a'
	])('returns null for malformed id %j', (customId) => {
		expect(demo().decode(customId)).toBeNull();
	});

	it('rejects values containing the delimiter or other unsafe characters', () => {
		const id = demo();
		expect(() => id.encode('pick', { token: 'a:b', mode: 'a' })).toThrow();
		expect(() => id.encode('pick', { token: '-', mode: 'a' })).toThrow();
		expect(() => id.encode('pick', { token: '', mode: 'a' })).toThrow();
		expect(() => id.encode('page', { ownerId: 'a:b', page: 1 })).toThrow();
		expect(() => id.encode('page', { ownerId: USER, page: -1 })).toThrow();
		expect(() => id.encode('page', { ownerId: USER, page: 1.5 })).toThrow();
		expect(() => id.encode('pick', { token: null, mode: 'z' as never })).toThrow();
	});

	it('enforces the 100 character limit at declaration and encode time', () => {
		expect(() =>
			defineCustomId({
				namespace: 'wide',
				version: 1,
				actions: { go: { a: field.token({ maxLength: 60 }), b: field.token({ maxLength: 40 }) } }
			})
		).toThrow(/100/);
		const id = defineCustomId({ namespace: 'edge', version: 1, actions: { go: { a: field.token({ maxLength: 89 }) } } });
		expect(id.encode('go', { a: 'x'.repeat(CUSTOM_ID_MAX_LENGTH - 'edge:v1:go:'.length) })).toHaveLength(CUSTOM_ID_MAX_LENGTH);
		expect(() => id.encode('go', { a: 'x'.repeat(CUSTOM_ID_MAX_LENGTH - 'edge:v1:go:'.length + 1) })).toThrow();
	});

	it('rejects duplicate namespaces and invalid names', () => {
		demo();
		expect(() => demo()).toThrow(/이미/);
		expect(registeredCustomIdNamespaces()).toEqual(['demo']);
		expect(() => defineCustomId({ namespace: 'Bad:ns', version: 1, actions: {} })).toThrow();
		expect(() => defineCustomId({ namespace: 'ok', version: 0, actions: {} })).toThrow();
		expect(() => defineCustomId({ namespace: 'act', version: 1, actions: { 'a:b': {} } })).toThrow();
		expect(() => defineCustomId({ namespace: 'act2', version: 1, actions: { go: { action: field.uint() } } })).toThrow();
	});
});
