import { container } from '@sapphire/framework';
import { type AutocompleteInteraction, PermissionFlagsBits, type SlashCommandStringOption } from 'discord.js';
import type { GiveawayStatus } from '@sirubot/utils/giveaway';
import { CHOICE_LIMIT, clipChoiceName } from '../../../../lib/autocomplete.ts';

const STATUS_LABEL: Record<GiveawayStatus, string> = { running: '진행 중', ended: '끝남', cancelled: '취소됨' };

/** 서버 관리 권한이 있는 사람에게만 상태에 맞는 기브어웨이를 후보로 보여줘요 (자동완성은 precondition을 거치지 않아요) */
export function giveawayAutocomplete(statuses: readonly GiveawayStatus[]) {
	return async (interaction: AutocompleteInteraction) => {
		if (!interaction.inCachedGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.respond([]);
		const typed = interaction.options.getFocused().trim().toLowerCase();
		const rows = await container.giveaways.listForAutocomplete(interaction.guildId, statuses).catch(() => []);
		await interaction.respond(
			rows
				.map((row) => ({ row, label: `${row.prize} (${STATUS_LABEL[row.status]})` }))
				.filter(({ label }) => label.toLowerCase().includes(typed))
				.slice(0, CHOICE_LIMIT)
				.map(({ row, label }) => ({ name: clipChoiceName(label), value: row.id }))
		);
	};
}

export function giveawayIdOption(o: SlashCommandStringOption, descriptionEn: string, descriptionKo: string) {
	return o
		.setName('giveaway')
		.setNameLocalizations({ ko: '기브어웨이' })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: descriptionKo })
		.setRequired(true)
		.setAutocomplete(true);
}
