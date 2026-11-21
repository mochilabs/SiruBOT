import { NextResponse } from 'next/server';
import type { StarboardSettings as StarboardSettingsRow } from '@sirubot/prisma';
import { STARBOARD_SETTINGS_DEFAULTS, type StarboardSettings,starboardSettingsPatchSchema } from '@sirubot/utils/starboard';

import { createGuildApiHandler } from '@/lib/api-handler';
import { notifyGuildSettingsChanged } from '@/lib/data-api/client';
import { db } from '@/lib/db';
import { READ_RATE, WRITE_RATE } from '@/lib/rate-limit';

function toSettings(row: StarboardSettingsRow | null): StarboardSettings {
	if (!row) return STARBOARD_SETTINGS_DEFAULTS;
	return {
		channelId: row.channelId,
		emoji: row.emoji,
		threshold: row.threshold,
		excludeSelf: row.excludeSelf,
		excludeNsfw: row.excludeNsfw,
		ignoredChannelIds: row.ignoredChannelIds
	};
}

/** 스타보드 설정 — 행이 없어도 기본값을 내려줘요. 봇은 저장 후 설정 무효화 브로드캐스트로 캐시를 비워요. */
export const GET = createGuildApiHandler({
	role: 'manage',
	rate: READ_RATE,
	key: 'starboard-settings-get',
	handler: async ({ guildId }) => {
		try {
			const row = await db.starboardSettings.findUnique({ where: { guildId } });
			return NextResponse.json(toSettings(row));
		} catch (error) {
			console.error('Failed to load starboard settings:', error);
			return NextResponse.json({ error: '요청을 처리하지 못했어요.' }, { status: 500 });
		}
	}
});

export const PUT = createGuildApiHandler({
	role: 'manage',
	rate: WRITE_RATE,
	key: 'starboard-settings-put',
	schema: starboardSettingsPatchSchema,
	handler: async ({ guildId, data }) => {
		try {
			// 설정 행은 Guild를 외래키로 참조해요 — 봇이 아직 만들지 않은 길드여도 저장되게 먼저 보장해요
			await db.guild.upsert({ where: { id: guildId }, create: { id: guildId }, update: {} });

			const row = await db.starboardSettings.upsert({
				where: { guildId },
				create: { guildId, ...data },
				update: data
			});

			notifyGuildSettingsChanged(guildId).catch((error) => {
				console.warn(`Failed to notify starboard settings change (guild ${guildId}):`, error);
			});

			return NextResponse.json(toSettings(row));
		} catch (error) {
			console.error('Failed to update starboard settings:', error);
			return NextResponse.json({ error: '요청을 처리하지 못했어요.' }, { status: 500 });
		}
	}
});
