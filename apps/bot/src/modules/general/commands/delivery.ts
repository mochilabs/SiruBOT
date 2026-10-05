import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { DeliveryError, normalizeTrackingNumber, type DeliveryTrackResult } from '../utils/deliveryService.ts';
import { GatewayDomainError } from '../../../services/dataApiClient.ts';
import { trackDelivery } from '../../../services/dataApiClient.ts';

const MAX_PROGRESS_LINES = 5;

function buildContainer(result: DeliveryTrackResult, trackingNumber: string) {
	const lines: string[] = [`### 📦 ${result.carrier.name || '택배사 정보 없음'} 배송 조회`, ''];
	lines.push(`**상태**: ${result.stateText || '정보 없음'}`);

	const route: string[] = [];
	if (result.fromName) route.push(`출발 ${result.fromName}${result.fromTime ? ` (${result.fromTime})` : ''}`);
	if (result.toName) route.push(`도착 ${result.toName}${result.toTime ? ` (${result.toTime})` : ''}`);
	if (route.length > 0) {
		lines.push(route.join(' → '));
	}

	if (result.progresses.length > 0) {
		lines.push('', '**최근 배송 내역**');
		for (const progress of result.progresses.slice(0, MAX_PROGRESS_LINES)) {
			const parts = [progress.time ?? '시각 미상', progress.statusText].filter(Boolean).join(' · ');
			const location = progress.location ? ` — ${progress.location}` : '';
			lines.push(`- ${parts}${location}`);
		}
		if (result.progresses.length > MAX_PROGRESS_LINES) lines.push(`- 그 외 ${result.progresses.length - MAX_PROGRESS_LINES}건 더 있어요.`);
	}

	lines.push('', `-# tracker.delivery 기준 · 운송장번호 \`${trackingNumber}\``);

	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(lines.join('\n')));
	return container;
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'delivery',
	description: '택배 배송 상태를 조회해요.',
	fullCategory: ['일반']
})
export class DeliveryCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '택배' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '택배 배송 상태를 조회해요.' })
				.addStringOption((option) =>
					option
						.setName('carrier')
						.setNameLocalizations({ ko: '택배사' })
						.setDescription('Carrier name (e.g. CJ Logistics)')
						.setDescriptionLocalizations({ ko: '택배사 이름 (예: cj대한통운, 한진택배, 우체국)' })
						.setRequired(true)
				)
				.addStringOption((option) =>
					option
						.setName('tracking_number')
						.setNameLocalizations({ ko: '운송장번호' })
						.setDescription('Tracking number')
						.setDescriptionLocalizations({ ko: '운송장번호' })
						.setRequired(true)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const carrierHint = interaction.options.getString('carrier', true);
		const trackingNumber = normalizeTrackingNumber(interaction.options.getString('tracking_number', true));

		if (!trackingNumber) {
			throw new UserError({
				identifier: 'delivery_tracking_required',
				message: '❌ 운송장번호를 입력해 주세요.',
				context: { ephemeral: true }
			});
		}

		await interaction.deferReply();

		try {
			const result = await trackDelivery(carrierHint, trackingNumber);
			await interaction.editReply({
				components: [buildContainer(result, trackingNumber)],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error) {
			if (error instanceof DeliveryError || error instanceof GatewayDomainError) {
				throw new UserError({
					identifier: error.identifier,
					message: `❌ ${error.message}`,
					context: { ephemeral: true }
				});
			}
			throw error;
		}
	}
}
