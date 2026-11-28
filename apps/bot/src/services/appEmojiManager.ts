import { ensureAppEmojisLoaded, setAppEmojiIdMap } from '@sirubot/utils';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { ClientApplication } from 'discord.js';
import type { AppLogger } from '../lib/appLogger.ts';
import type { Stoppable } from '../lib/lifecycle.ts';

const NAME_REGEX = /^[a-z0-9_]{2,32}$/;
const MAX_PNG_BYTES = 256 * 1024;

export interface AppEmojiManagerDeps {
	logger: AppLogger;
	getApplication: () => ClientApplication | null | undefined;
}

export class AppEmojiManager implements Stoppable {
	public readonly name = '앱 이모지 재동기화';
	private refreshScheduled = false;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;

	public constructor(private readonly deps: AppEmojiManagerDeps) {}

	public async sync(upload: boolean): Promise<void> {
		await ensureAppEmojisLoaded();

		const application = this.deps.getApplication();
		if (!application) return;

		let map: Record<string, string> = {};
		try {
			const emojis = await application.emojis.fetch();
			for (const emoji of emojis.values()) map[emoji.name] = emoji.id;
		} catch (error) {
			this.deps.logger.warn(`[appEmoji] 앱 이모지 조회 실패 (${this.describe(error)}) — 커밋 매핑으로 진행`);
			if (!upload) this.scheduleRefresh();
			return;
		}

		if (upload) {
			await this.uploadMissing(application, map);
		}

		if (Object.keys(map).length) {
			setAppEmojiIdMap(map);
		}
		// 다른 샤드는 shard 0의 신규 이모지 업로드보다 먼저 조회할 수 있어 한 번 더 동기화한다.
		if (!upload) this.scheduleRefresh();
	}

	private scheduleRefresh(): void {
		if (this.stopped || this.refreshScheduled) return;
		this.refreshScheduled = true;
		this.refreshTimer = setTimeout(() => void this.sync(false), 30_000);
		this.refreshTimer.unref?.();
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this.refreshTimer = null;
	}

	private async uploadMissing(application: ClientApplication, map: Record<string, string>): Promise<void> {
		const dir = await this.sourceDir();
		if (!dir) return;

		let files: string[] = [];
		try {
			files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.png')).sort();
		} catch {
			return;
		}

		let created = 0;
		for (const file of files) {
			const name = basename(file, '.png');
			if (!NAME_REGEX.test(name)) continue;
			if (map[name]) continue;

			try {
				const buffer = await readFile(join(dir, file));
				if (buffer.byteLength > MAX_PNG_BYTES) continue;
				const createdEmoji = await application.emojis.create({ name, attachment: buffer });
				map[createdEmoji.name] = createdEmoji.id;
				created++;
				this.deps.logger.info(`[appEmoji] :${name}: 등록 (id ${createdEmoji.id})`);
			} catch (error) {
				this.deps.logger.warn(`[appEmoji] :${name}: 업로드 실패 (${this.describe(error)})`);
			}
		}
		if (created > 0) this.deps.logger.info(`[appEmoji] 미등록 이모지 ${created}개 자동 등록 완료`);
	}

	private async sourceDir(): Promise<string | null> {
		const candidates = [
			join(process.cwd(), 'resources', 'emoji_replacement'),
			join(process.cwd(), '..', '..', 'resources', 'emoji_replacement'),
			join(process.cwd(), 'apps', 'bot', 'resources', 'emoji_replacement'),
			join('/app', 'resources', 'emoji_replacement')
		];
		for (const dir of candidates) {
			try {
				await readdir(dir);
				return dir;
			} catch {}
		}
		return null;
	}

	private describe(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	public async list(): Promise<Array<{ id: string; name: string }>> {
		const application = this.deps.getApplication();
		if (!application) return [];
		const emojis = await application.emojis.fetch();
		return [...emojis.values()].map((emoji) => ({ id: emoji.id, name: emoji.name })).sort((a, b) => a.name.localeCompare(b.name));
	}

	public async forceReupload(): Promise<{ created: number; failed: number; map: Record<string, string> }> {
		const application = this.deps.getApplication();
		if (!application) throw new Error('application unavailable');
		const dir = await this.sourceDir();
		if (!dir) throw new Error('emoji source dir not found');

		const existing = await application.emojis.fetch();
		let deleted = 0;
		for (const emoji of existing.values()) {
			try {
				await application.emojis.delete(emoji.id);
				deleted++;
			} catch (error) {
				this.deps.logger.warn(`[appEmoji] :${emoji.name}: 삭제 실패 (${this.describe(error)})`);
			}
		}

		const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.png') && NAME_REGEX.test(basename(f, '.png'))).sort();
		const map: Record<string, string> = {};
		let created = 0;
		let failed = 0;
		for (const file of files) {
			const name = basename(file, '.png');
			try {
				const buffer = await readFile(join(dir, file));
				if (buffer.byteLength > MAX_PNG_BYTES) {
					failed++;
					continue;
				}
				const emoji = await application.emojis.create({ name, attachment: buffer });
				map[emoji.name] = emoji.id;
				created++;
			} catch (error) {
				failed++;
				this.deps.logger.warn(`[appEmoji] :${name}: 재등록 실패 (${this.describe(error)})`);
			}
		}

		setAppEmojiIdMap(map);
		await this.saveIdMap(map);

		this.deps.logger.info(`[appEmoji] 강제 재업로드 완료: 삭제 ${deleted} / 생성 ${created} / 실패 ${failed}`);
		return { created, failed, map };
	}

	private async saveIdMap(map: Record<string, string>): Promise<void> {
		const payload = `${JSON.stringify(map, null, 2)}\n`;
		const targets = [
			join(process.cwd(), 'resources', 'emoji_replacement', 'emoji-ids.json'),
			join(process.cwd(), 'resources', 'emoji-ids.json'),
			join(process.cwd(), 'apps', 'bot', 'resources', 'emoji-ids.json'),
			join('/app', 'resources', 'emoji_replacement', 'emoji-ids.json')
		];
		for (const path of targets) {
			try {
				await writeFile(path, payload, 'utf-8');
				this.deps.logger.info(`[appEmoji] 매핑 저장: ${path}`);
			} catch {}
		}
	}
}
