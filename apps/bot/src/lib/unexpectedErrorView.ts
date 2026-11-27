import { container } from '@sapphire/framework';
import { getConfig } from './config.ts';
import { errorView, type ErrorViewOptions } from './errorView.ts';

export async function unexpectedErrorView(message: string, options: Pick<ErrorViewOptions, 'accentColor'> = {}) {
	const text = await container.incidentNotice.appendTo(message).catch(() => message);
	return errorView(text, { ...options, supportUrl: getConfig().links.supportServerUrl });
}
