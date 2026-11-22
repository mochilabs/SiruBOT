import { addSeparator, createContainer, emoji } from '@sirubot/utils';
import { BOT_TAGLINE } from '@sirubot/utils/brand';
import { getBotModule, type BotModuleId } from '@sirubot/utils/modules';
import { ActionRowBuilder, ContainerBuilder, StringSelectMenuBuilder } from 'discord.js';
import { commandMention } from '../../lib/commandMention.ts';
import { helpId } from '../customIds.ts';
import { helpCategoryLines, visibleHelpModules, type HelpContext } from '../help/helpCatalog.ts';

/** 카테고리 셀렉트의 customId — 컬렉터가 이 값으로 가려내요 */
export const helpCategoryCustomId = helpId.encode('category');

/** 셀렉트 값: 모듈 id, 첫 화면은 'home' */
export type HelpPage = BotModuleId | 'home';
export const HELP_HOME = 'home' as const;

function categorySelect(page: HelpPage, ctx: HelpContext): ActionRowBuilder<StringSelectMenuBuilder> {
	const select = new StringSelectMenuBuilder()
		.setCustomId(helpCategoryCustomId)
		.setPlaceholder('카테고리를 골라 주세요')
		.setMinValues(1)
		.setMaxValues(1)
		.addOptions(
			{ label: '처음 화면', value: HELP_HOME, emoji: { name: '🏠' }, default: page === HELP_HOME },
			...visibleHelpModules(ctx).map((m) => ({
				label: m.label,
				value: m.id,
				emoji: { name: m.emoji },
				description: m.description,
				default: page === m.id
			}))
		);
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function homeText(ctx: HelpContext): string {
	return [
		`### 안녕하세요, 시루예요! ${emoji('music_note')}`,
		BOT_TAGLINE,
		'',
		'**처음이라면**',
		`1. 음성 채널에 들어가서 ${commandMention('play', ctx.index)}로 노래를 틀어 보세요.`,
		'2. 채팅에서 저를 멘션해서 질문하거나 명령할 수 있어요.',
		`3. 관리자라면 ${commandMention('settings', ctx.index)}이나 웹 대시보드에서 서버에 맞게 설정해요.`
	].join('\n');
}

/**
 * `/도움말` 화면. 첫 화면(home)이나 카테고리 하나를 보여주고, 아래에 카테고리 셀렉트를 둬요.
 * `selectable=false`면 셀렉트를 빼요 (세션이 끝난 뒤 화면).
 */
export function helpView(page: HelpPage, ctx: HelpContext, selectable = true): ContainerBuilder {
	const container = createContainer();
	if (page === HELP_HOME) {
		container.addTextDisplayComponents((t) => t.setContent(homeText(ctx)));
	} else {
		const module = getBotModule(page);
		const body = helpCategoryLines(page, ctx);
		container.addTextDisplayComponents((t) => t.setContent([`### ${module.emoji} ${module.label}`, ...body].join('\n')));
	}
	if (selectable) {
		addSeparator(container);
		container.addActionRowComponents(categorySelect(page, ctx));
	}
	return container;
}

/** 셀렉트 값이 이 사람이 볼 수 있는 페이지인지 확인해요 (관리 카테고리 권한 등) */
export function parseHelpPage(value: string | undefined, ctx: HelpContext): HelpPage | null {
	if (value === HELP_HOME) return HELP_HOME;
	return visibleHelpModules(ctx).find((m) => m.id === value)?.id ?? null;
}
