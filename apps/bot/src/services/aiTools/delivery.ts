import { normalizeTrackingNumber } from '../../modules/general/utils/deliveryService.ts';
import { trackDelivery } from '../dataApiClient.ts';
import type { AiTool } from './types.ts';

export const deliveryTool: AiTool = {
	name: 'delivery_track',
	description:
		'택배 배송 상태를 조회해요. tracking_number(운송장 번호)와 carrier(택배사: 대한통운, 우체국, 로젠 등)가 필요해요. 택배사 이름을 모르면 사용자에게 물어보세요.',
	properties: {
		tracking_number: {
			type: 'string',
			description: '운송장 번호 (공백·하이픈은 자동 제거돼요)'
		},
		carrier: {
			type: 'string',
			description: '택배사 (예: 대한통운, 우체국, 로젠, 한진, CJ대한통운)'
		}
	},
	required: ['tracking_number', 'carrier'],
	status: '시루가 배송 상태를 확인하는 중..',
	execute: async (args) => {
		const trackingNumber = normalizeTrackingNumber(String(args.tracking_number ?? ''));
		if (!trackingNumber) throw new Error('운송장 번호가 필요해요.');
		const carrierHint = String(args.carrier ?? '').trim();
		if (!carrierHint) throw new Error('택배사 이름이 필요해요.');
		const result = await trackDelivery(carrierHint, trackingNumber);
		return JSON.stringify(result);
	}
};
