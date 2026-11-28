export class DeliveryError extends Error {
	public constructor(
		public readonly identifier: string,
		message: string
	) {
		super(message);
		this.name = 'DeliveryError';
	}
}

export interface DeliveryCarrier {
	id: string;
	name: string;
	tel?: string;
}

export interface DeliveryProgress {
	time: string | null;
	statusText: string;
	location: string | null;
	description: string | null;
}

export interface DeliveryTrackResult {
	carrier: DeliveryCarrier;
	stateText: string;
	fromName: string | null;
	fromTime: string | null;
	toName: string | null;
	toTime: string | null;
	progresses: DeliveryProgress[];
}

export function normalizeTrackingNumber(raw: string): string {
	return raw.trim().replace(/[\s-]/g, '');
}
