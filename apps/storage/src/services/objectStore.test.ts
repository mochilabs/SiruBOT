import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObjectStore } from './objectStore.ts';

let dir: string;
let store: ObjectStore;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'storage-'));
	store = new ObjectStore(dir);
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('ObjectStore', () => {
	it('저장·조회·삭제가 동작해요', async () => {
		await store.put('guild-assets', 'g1/a.png', new Uint8Array([1, 2, 3]), 'image/png');
		const got = await store.get('guild-assets', 'g1/a.png');
		expect(got).not.toBeNull();
		expect(got!.bytes.length).toBe(3);
		expect(got!.contentType).toBe('image/png');
		await store.delete('guild-assets', 'g1/a.png');
		expect(await store.get('guild-assets', 'g1/a.png')).toBeNull();
	});

	it('경로 탈출 키는 거부해요', async () => {
		await expect(store.put('guild-assets', '../escape.png', new Uint8Array([1]), 'image/png')).rejects.toThrow();
		await expect(store.get('guild-assets', 'a/../../etc/passwd')).rejects.toThrow();
		await expect(store.put('guild-assets', 'g1/a..b.png', new Uint8Array([1]), 'image/png')).rejects.toThrow();
		await expect(store.put('guild-assets', '', new Uint8Array([1]), 'image/png')).rejects.toThrow();
	});

	it('prefix로 목록을 뽑아요', async () => {
		await store.put('guild-assets', 'g1/a.png', new Uint8Array([1]), 'image/png');
		await store.put('guild-assets', 'g1/b.png', new Uint8Array([2]), 'image/png');
		await store.put('guild-assets', 'g2/c.png', new Uint8Array([3]), 'image/png');
		const listed = await store.list('guild-assets', 'g1/');
		expect(listed.map((o) => o.key).sort()).toEqual(['g1/a.png', 'g1/b.png']);
		expect(listed.every((o) => o.contentType === 'image/png')).toBe(true);
		expect(listed.every((o) => typeof o.lastModified === 'string' && o.lastModified.length > 0)).toBe(true);
	});
});
