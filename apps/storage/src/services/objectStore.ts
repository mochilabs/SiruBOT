import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StoredObject {
	key: string;
	size: number;
	contentType: string;
	lastModified: string;
	etag: string;
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const MIME_BY_EXT: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	gz: 'application/gzip'
};

export function contentTypeForKey(key: string): string {
	const ext = path.extname(key).slice(1).toLowerCase();
	return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export const INVALID_OBJECT_PATH_MESSAGE = '경로가 올바르지 않아요.';

export class ObjectPathError extends Error {}

function resolveSegments(root: string, segments: string[]): string {
	for (const segment of segments) {
		// SAFE_SEGMENT는 'a..b'를 통과시키므로 '..' 포함 여부를 따로 막아요.
		if (!SAFE_SEGMENT.test(segment) || segment.includes('..')) throw new ObjectPathError(INVALID_OBJECT_PATH_MESSAGE);
	}
	const full = path.resolve(root, ...segments);
	if (!full.startsWith(path.resolve(root) + path.sep)) throw new ObjectPathError(INVALID_OBJECT_PATH_MESSAGE);
	return full;
}

function resolveObjectPath(root: string, bucket: string, key: string): string {
	const keySegments = key.split('/');
	if (keySegments.some((segment) => segment.length === 0)) throw new ObjectPathError(INVALID_OBJECT_PATH_MESSAGE);
	return resolveSegments(root, [bucket, ...keySegments]);
}

function resolveBucketDir(root: string, bucket: string): string {
	return resolveSegments(root, [bucket]);
}

export class ObjectStore {
	constructor(private readonly root: string) {}

	async put(bucket: string, key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
		const full = resolveObjectPath(this.root, bucket, key);
		await mkdir(path.dirname(full), { recursive: true });
		await writeFile(full, bytes);
		return this.meta(bucket, key, bytes.length, contentType, new Date());
	}

	async get(bucket: string, key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
		const full = resolveObjectPath(this.root, bucket, key);
		try {
			const bytes = await readFile(full);
			return { bytes, contentType: contentTypeForKey(key) };
		} catch {
			return null;
		}
	}

	async delete(bucket: string, key: string): Promise<boolean> {
		const full = resolveObjectPath(this.root, bucket, key);
		try {
			await stat(full);
		} catch {
			return false;
		}
		await rm(full, { force: true });
		return true;
	}

	async list(bucket: string, prefix: string): Promise<StoredObject[]> {
		const base = resolveBucketDir(this.root, bucket);
		const out: StoredObject[] = [];
		const walk = async (dir: string, rel: string): Promise<void> => {
			let entries;
			try {
				entries = await readdir(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of entries) {
				const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
				const entryPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					await walk(entryPath, entryRel);
				} else if (!prefix || entryRel.startsWith(prefix)) {
					const st = await stat(entryPath);
					out.push(this.meta(bucket, entryRel, st.size, contentTypeForKey(entryRel), st.mtime));
				}
			}
		};
		await walk(base, '');
		return out.sort((a, b) => a.key.localeCompare(b.key));
	}

	private meta(bucket: string, key: string, size: number, contentType: string, lastModified: Date): StoredObject {
		return {
			key,
			size,
			contentType,
			lastModified: lastModified.toISOString(),
			etag: createHash('sha256').update(`${bucket}/${key}:${size}`).digest('hex').slice(0, 32)
		};
	}
}
