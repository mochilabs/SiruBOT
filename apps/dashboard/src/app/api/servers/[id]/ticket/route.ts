import { NextResponse } from 'next/server';
import { TICKET_CONFIG_DEFAULTS,ticketConfigPatchSchema } from '@sirubot/utils/ticket';

import { createGuildApiHandler } from '@/lib/api-handler';
import { db } from '@/lib/db';
import { READ_RATE, WRITE_RATE } from '@/lib/rate-limit';
import { parseSettingBody } from '@/lib/schemas';

const ALLOWED_PATCH_KEYS = [
	'enabled',
	'categoryId',
	'supportRoleIds',
	'logChannelId',
	'maxOpenPerUser',
	'panelTitle',
	'panelDescription',
	'panelChannelId'
];

export const GET = createGuildApiHandler({
	role: 'manage',
	rate: READ_RATE,
	key: 'ticket-settings-get',
	handler: async ({ guildId }) => {
		try {
			const config = await db.ticketConfig.findUnique({
				where: { guildId }
			});

			if (!config) {
				return NextResponse.json({
					guildId,
					...TICKET_CONFIG_DEFAULTS
				});
			}

			return NextResponse.json(config);
		} catch (error) {
			console.error('Failed to load ticket config:', error);
			return NextResponse.json({ error: '요청을 처리하지 못했어요.' }, { status: 500 });
		}
	}
});

export const PUT = createGuildApiHandler({
	role: 'manage',
	rate: WRITE_RATE,
	key: 'ticket-settings-put',
	handler: async ({ guildId, request }) => {
		try {
			const body = await parseSettingBody(request, ticketConfigPatchSchema, ALLOWED_PATCH_KEYS);
			if (!body.ok) return body.response;

			const data = body.data;

			await db.guild.upsert({
				where: { id: guildId },
				create: { id: guildId },
				update: {}
			});

			const updated = await db.ticketConfig.upsert({
				where: { guildId },
				create: {
					guildId,
					...TICKET_CONFIG_DEFAULTS,
					...data
				},
				update: data
			});

			return NextResponse.json(updated);
		} catch (error) {
			console.error('Failed to update ticket config:', error);
			return NextResponse.json({ error: '요청을 처리하지 못했어요.' }, { status: 500 });
		}
	}
});
