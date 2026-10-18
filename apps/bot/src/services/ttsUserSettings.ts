import { container } from '@sapphire/framework';
import { MemoryCache } from '@sirubot/utils';

/**
 * 채팅 TTS 사용자 설정 — 길드별 사용자 opt-in과 음성 프리셋(voice/speed/pitch) CRUD.
 *
 * 저장은 Prisma `TtsUserSetting`(복합 PK guildId+userId). 커맨드 쓰기 시 같은 프로세스의
 * 캐시를 무효화한다 — 길드는 샤드에 고정이라 다른 프로세스는 각자 TTL(60s)로 만료된다.
 */

export interface TtsUserPreset {
	enabled: boolean;
	voice: string | null;
	speed: number | null;
	pitch: number | null;
}

/** DB에 행이 없을 때의 기본값 — opt-in off, 프리셋 전부 미설정 */
export const DEFAULT_TTS_USER_PRESET: TtsUserPreset = { enabled: false, voice: null, speed: null, pitch: null };

const CACHE_TTL_MS = 60_000;

export class TtsUserSettingsService {
	private readonly cache = new MemoryCache<string, TtsUserPreset>({ ttl: CACHE_TTL_MS, maxSize: 500 });

	/** 설정 조회 — 행이 없으면 기본값(off). DB 실패 시에도 기본값(fail-safe off). */
	public async get(guildId: string, userId: string): Promise<TtsUserPreset> {
		const key = `${guildId}:${userId}`;
		const cached = this.cache.get(key);
		if (cached) return cached;
		let preset: TtsUserPreset = DEFAULT_TTS_USER_PRESET;
		try {
			const row = await container.db.ttsUserSetting.findUnique({ where: { guildId_userId: { guildId, userId } } });
			if (row) preset = { enabled: row.enabled, voice: row.voice, speed: row.speed, pitch: row.pitch };
		} catch (error) {
			container.logger.error(
				`[ttsUserSettings] 조회 실패 guild=${guildId} user=${userId}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
		this.cache.set(key, preset);
		return preset;
	}

	/** 설정 저장 — upsert 후 같은 키 캐시 갱신. DB 실패 시 false. */
	public async set(guildId: string, userId: string, patch: Partial<Omit<TtsUserPreset, 'enabled'>> & { enabled?: boolean }): Promise<boolean> {
		try {
			const current = await this.get(guildId, userId);
			const next: TtsUserPreset = {
				enabled: patch.enabled ?? current.enabled,
				voice: patch.voice !== undefined ? patch.voice : current.voice,
				speed: patch.speed !== undefined ? patch.speed : current.speed,
				pitch: patch.pitch !== undefined ? patch.pitch : current.pitch
			};
			await container.db.ttsUserSetting.upsert({
				where: { guildId_userId: { guildId, userId } },
				create: { guildId, userId, ...next },
				update: { ...next }
			});
			this.cache.set(`${guildId}:${userId}`, next);
			return true;
		} catch (error) {
			container.logger.error(
				`[ttsUserSettings] 저장 실패 guild=${guildId} user=${userId}: ${error instanceof Error ? error.message : String(error)}`
			);
			return false;
		}
	}
}
