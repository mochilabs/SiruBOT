import { container } from '@sapphire/framework';
import { ensureAppEmojisLoaded, setAppEmojiIdMap } from '@sirubot/utils';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { ClientApplication } from 'discord.js';

/** 이모지 이름 규칙 — Discord 앱 이모지 이름 (2~32자, 소문자/숫자/언더스코어) */
const NAME_REGEX = /^[a-z0-9_]{2,32}$/;
/** 앱 이모지 PNG 최대 크기 (Discord 제한 256KiB) */
const MAX_PNG_BYTES = 256 * 1024;

/**
 * 앱 이모지 매니저 — 부팅 시 앱 이모지(application emoji)를 조회하고,
 * `resources/emoji_replacement/*.png` 중 아직 등록되지 않은 이모지를 자동으로 업로드한 뒤
 * 이름→ID 매핑을 `emoji()`가 쓰는 캐시에 주입한다.
 *
 * 기존에는 `scripts/upload-emojis.ts`를 운영자가 토큰이 있는 환경에서 수동 실행해야 했어요.
 * 이제는 봇이 부팅할 때(shard 0) 알아서 동기화하므로, PNG만 커밋하면 다음 배포부터 반영돼요.
 *
 * - 조회·업로드 실패 시에도 예외를 던지지 않는다(emoji()가 유니코드 폴백으로 동작).
 * - 업로드는 이름 기준으로 idempotent — 이미 있으면 건너뛰어 멀티 인스턴스 재시작에도 안전.
 */
export class AppEmojiManager {
	private refreshScheduled = false;

	/**
	 * 앱 이모지를 동기화한다.
	 * @param upload true면 미등록 PNG를 업로드한다 (shard 0만). false면 조회·캐시만.
	 */
	public async sync(upload: boolean): Promise<void> {
		// 커밋 매핑 먼저, API가 없어도 emoji()가 커밋된 87종 이상은 즉시 동작한다(오프라인 폴백).
		await ensureAppEmojisLoaded();

		const application = container.client.application;
		if (!application) return;

		// API로 최신 앱 이모지 조회 → 이름→ID 맵 (커밋 매핑보다 우선, 미등록분 포함)
		let map: Record<string, string> = {};
		try {
			const emojis = await application.emojis.fetch();
			for (const emoji of emojis.values()) map[emoji.name] = emoji.id;
		} catch (error) {
			// API 실패 — 커밋 매핑은 이미 반영됐으니 업로드 없이 종료.
			container.logger.warn(`[appEmoji] 앱 이모지 조회 실패 (${this.describe(error)}) — 커밋 매핑으로 진행`);
			if (!upload) this.scheduleRefresh();
			return;
		}

		// 미등록 PNG 업로드는 shard 0에서만
		if (upload) {
			await this.uploadMissing(application, map);
		}

		// 조회한 맵이 있을 때만 최종 캐시에 주입한다
		if (Object.keys(map).length) {
			setAppEmojiIdMap(map);
		}
		// 다른 샤드는 shard 0의 신규 이모지 업로드보다 먼저 조회할 수 있어 한 번 더 동기화한다.
		if (!upload) this.scheduleRefresh();
	}

	private scheduleRefresh(): void {
		if (this.refreshScheduled) return;
		this.refreshScheduled = true;
		setTimeout(() => void this.sync(false), 30_000).unref?.();
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
			if (map[name]) continue; // 이미 등록됨

			try {
				const buffer = await readFile(join(dir, file));
				if (buffer.byteLength > MAX_PNG_BYTES) continue;
				const createdEmoji = await application.emojis.create({ name, attachment: buffer });
				map[createdEmoji.name] = createdEmoji.id;
				created++;
				container.logger.info(`[appEmoji] :${name}: 등록 (id ${createdEmoji.id})`);
			} catch (error) {
				// 이름 중복 레이스(멀티 인스턴스)나 요청 실패 — 다음 배포/재시작에서 재시도.
				container.logger.warn(`[appEmoji] :${name}: 업로드 실패 (${this.describe(error)})`);
			}
		}
		if (created > 0) container.logger.info(`[appEmoji] 미등록 이모지 ${created}개 자동 등록 완료`);
	}

	/** PNG 소스 디렉터리 — 존재하는 후보 중 첫 번째를 반환한다. */
	private async sourceDir(): Promise<string | null> {
		const candidates = [
			join(process.cwd(), 'resources', 'emoji_replacement'), // repo 루트 / Docker(/app)
			join(process.cwd(), '..', '..', 'resources', 'emoji_replacement'), // apps/bot CWD
			join(process.cwd(), 'apps', 'bot', 'resources', 'emoji_replacement'), // repo 루트에서 봇 리소스
			join('/app', 'resources', 'emoji_replacement') // Docker 절대 경로 (방어)
		];
		for (const dir of candidates) {
			try {
				await readdir(dir);
				return dir;
			} catch {
				// 존재하지 않으면 다음 후보
			}
		}
		return null;
	}

	private describe(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	/** 현재 등록된 앱 이모지 목록을 이름순으로 반환한다. */
	public async list(): Promise<Array<{ id: string; name: string }>> {
		const application = container.client.application;
		if (!application) return [];
		const emojis = await application.emojis.fetch();
		return [...emojis.values()].map((emoji) => ({ id: emoji.id, name: emoji.name })).sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * 전체 앱 이모지를 삭제한 뒤 로컬 PNG로 다시 등록한다 — ID 갱신 필요 시(이미지가 API로 반영 안 될 때).
	 * 완료 후 이름→ID 매핑을 캐시에 주입하고, 커밋 대상 `emoji-ids.json` 두 본에 저장한다.
	 */
	public async forceReupload(): Promise<{ created: number; failed: number; map: Record<string, string> }> {
		const application = container.client.application;
		if (!application) throw new Error('application unavailable');
		const dir = await this.sourceDir();
		if (!dir) throw new Error('emoji source dir not found');

		// 1) 기존 전량 삭제
		const existing = await application.emojis.fetch();
		let deleted = 0;
		for (const emoji of existing.values()) {
			try {
				await application.emojis.delete(emoji.id);
				deleted++;
			} catch (error) {
				container.logger.warn(`[appEmoji] :${emoji.name}: 삭제 실패 (${this.describe(error)})`);
			}
		}

		// 2) 로컬 PNG 전량 재등록 (신규 ID 발급)
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
				container.logger.warn(`[appEmoji] :${name}: 재등록 실패 (${this.describe(error)})`);
			}
		}

		// 3) 매핑 캐시 주입 + 커밋 대상 JSON 두 본 저장
		setAppEmojiIdMap(map);
		await this.saveIdMap(map);

		container.logger.info(`[appEmoji] 강제 재업로드 완료: 삭제 ${deleted} / 생성 ${created} / 실패 ${failed}`);
		return { created, failed, map };
	}

	/** 이름→ID 매핑을 canonical(레포 루트)과 런타임(apps/bot) JSON 두 본에 저장한다. */
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
				container.logger.info(`[appEmoji] 매핑 저장: ${path}`);
			} catch {
				// 존재하지 않는 후보 경로는 무시 (CWD/컨테이너 환경 차이)
			}
		}
	}
}
