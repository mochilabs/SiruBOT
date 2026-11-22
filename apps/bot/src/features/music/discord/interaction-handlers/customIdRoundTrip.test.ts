import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setConfigForTesting } from '../../../../lib/config.ts';
import { makeTestConfig } from '../../../../lib/config.testing.ts';
import FilterButtonHandler from './filterButton.ts';
import FilterSelectMenuHandler from './filterSelectMenu.ts';
import SettingsInteractionHandler, { SETTINGS_ACTIONS } from './settings.ts';
import { SettingsModalHandler } from './settingsModal.ts';
import { filterView } from '../views/filter.ts';
import { settingsView, type SettingsMode } from '../views/settings.ts';
import { automixModal, crossfadeModal, jtcTemplateModal } from '../settings/modals.ts';
import { SETTINGS_SCREENS, isMusicSubpage } from '../settings/types.ts';
import { searchResults } from '../views/search.ts';
import { playlistLibraryView } from '../views/playlist.ts';
import { askPlaylistAdd } from '../views/play.ts';
import { voteSkip } from '../views/skip.ts';
import { filterId, libraryId, playlistAddId, searchId, settingsId, voteSkipId } from '../customIds.ts';

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		some = (value?: unknown) => ({ isSome: () => true, unwrap: () => value });
		none = () => ({ isSome: () => false });
	},
	InteractionHandlerTypes: { Button: 'button', SelectMenu: 'select-menu', MessageComponent: 'message-component', ModalSubmit: 'modal-submit' },
	container: {}
}));
vi.mock('@sapphire/decorators', () => ({ ApplyOptions: () => (target: unknown) => target }));

function ids(rendered: unknown): string[] {
	return [...JSON.stringify(rendered).matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]!);
}

const ctx = {} as never;
const BASE_GUILD = {
	sponsorBlockSegments: [],
	djRoleId: null,
	textChannelId: null,
	voiceChannelId: null,
	pinnedChannelId: null,
	pinnedChannelMode: 'play',
	pinnedChannelDeleteInput: false,
	enableController: true,
	related: false,
	repeat: 'off',
	jtcEnabled: false,
	jtcMarkerChannelId: null,
	jtcTemplate: '{user}',
	jtcUserLimit: 0
};
/** 오디오·AI·채팅 유틸 페이지가 읽는 길드 값 */
const EXTRA_GUILD = {
	volume: 100,
	disabledModules: [],
	gaplessEnabled: true,
	crossfadeEnabled: false,
	crossfadeMs: 5000,
	normalizationEnabled: false,
	automixEnabled: false,
	automixMaxTempoChange: 0.06,
	automixMinConfidence: 0.3,
	ttsAnnounceMode: 'sequential',
	aiMode: 'channels',
	aiChannelIds: ['9'],
	emojiEnlargeMode: 'off',
	emojiEnlargeChannelIds: [],
	quoteMode: 'all',
	quoteChannelIds: [],
	embedFixMode: 'channels',
	embedFixChannelIds: ['9'],
	embedFixSites: [],
	countingEnabled: true,
	countingChannelId: '8'
};
const claims = (handler: { parse(i: never): { isSome(): boolean } }, customId: string) =>
	handler.parse({ customId, inCachedGuild: () => true } as never).isSome();

describe('audio custom id round trips', () => {
	beforeEach(() => setConfigForTesting(makeTestConfig()));
	afterEach(() => setConfigForTesting(null));

	it('filter view ids are claimed by exactly the matching handler', () => {
		const rendered = ids(filterView({ activeFilters: ['bass'] }).toJSON());
		expect(rendered.map((id) => filterId.decode(id)?.action)).toEqual(['select', 'reset']);
		const button = new FilterButtonHandler(ctx, ctx);
		const select = new FilterSelectMenuHandler(ctx, ctx);
		expect(rendered.map((id) => claims(button as never, id))).toEqual([false, true]);
		expect(rendered.map((id) => claims(select as never, id))).toEqual([true, false]);
		expect(claims(button as never, 'filter:reset')).toBe(false);
	});

	it.each([...SETTINGS_SCREENS] as SettingsMode[])('settings %s view ids are claimed by the settings handler', (mode) => {
		const guild = {
			sponsorBlockSegments: [],
			djRoleId: null,
			textChannelId: null,
			voiceChannelId: null,
			pinnedChannelId: null,
			pinnedChannelMode: 'play',
			pinnedChannelDeleteInput: false,
			enableController: true,
			related: false,
			repeat: 'off',
			jtcEnabled: false,
			jtcMarkerChannelId: null,
			jtcTemplate: '{user}',
			jtcUserLimit: 0,
			...EXTRA_GUILD
		};
		const rendered = ids(settingsView(guild as never, mode).toJSON());
		const handler = new SettingsInteractionHandler(ctx, ctx);
		for (const id of rendered) {
			expect(settingsId.decode(id), id).not.toBeNull();
			expect(claims(handler as never, id), id).toBe(true);
		}
		if (mode !== 'main') expect(rendered).toContain(settingsId.encode('back'));
		expect(claims(handler as never, 'settings:toggle:controller')).toBe(false);
	});

	it('every settings action redraws the screen that holds its own control', () => {
		const guild = {
			sponsorBlockSegments: ['sponsor'],
			djRoleId: '1',
			textChannelId: '2',
			voiceChannelId: '3',
			pinnedChannelId: '4',
			pinnedChannelMode: 'play',
			pinnedChannelDeleteInput: false,
			enableController: true,
			related: false,
			repeat: 'off',
			jtcEnabled: true,
			jtcMarkerChannelId: '5',
			jtcTemplate: '{user}',
			jtcUserLimit: 0,
			...EXTRA_GUILD
		};
		// 설정을 바꾸는 액션(고정 화면 + apply)만 검사해요. 화면 이동(navigate/back)과 모달(jtcTemplate)은 표의 다른 형태예요.
		for (const [action, entry] of Object.entries(SETTINGS_ACTIONS)) {
			if (!('apply' in entry) || typeof entry.mode !== 'string') continue;
			const mode = entry.mode;
			const actions = ids(settingsView(guild as never, mode).toJSON()).map((id) => settingsId.decode(id)?.action);
			expect(actions, `${action} -> ${mode}`).toContain(action);
		}
	});

	it('표의 모든 컨트롤이 자기 화면에만 그려지고, 컨트롤 없는 액션은 뒤로가기뿐이에요 (B-08)', () => {
		const guild = { ...BASE_GUILD, ...EXTRA_GUILD };
		const noControl = Object.entries(SETTINGS_ACTIONS)
			.filter(([, entry]) => !entry.control)
			.map(([action]) => action);
		expect(noControl).toEqual(['back']);
		const renderedActions = (screen: SettingsMode) =>
			ids(settingsView(guild as never, screen, { channelId: '9' }).toJSON()).map((id) => settingsId.decode(id)?.action);
		for (const [action, entry] of Object.entries(SETTINGS_ACTIONS)) {
			if (!entry.control) continue;
			expect(renderedActions(entry.control.screen), `${action} on ${entry.control.screen}`).toContain(action);
			// navigate는 첫 화면 외에 음악 하위 페이지 위의 이동 셀렉트로도 그려져요
			for (const other of SETTINGS_SCREENS.filter(
				(screen) => screen !== entry.control!.screen && !(action === 'navigate' && isMusicSubpage(screen))
			)) {
				expect(renderedActions(other), `${action} not on ${other}`).not.toContain(action);
			}
		}
	});

	it('모달 ID는 모달 핸들러만 받아요 (믹서 모달 포함)', () => {
		const modalHandler = new SettingsModalHandler(ctx, ctx);
		const componentHandler = new SettingsInteractionHandler(ctx, ctx);
		for (const modal of [crossfadeModal(5), automixModal({ maxTempoChangePercent: 6, minConfidence: 0.3 })]) {
			const [modalId, ...inputs] = [...JSON.stringify(modal.toJSON()).matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]!);
			expect(modalHandler.parse({ customId: modalId } as never).isSome()).toBe(true);
			for (const id of [modalId!, ...inputs]) expect(claims(componentHandler as never, id)).toBe(false);
		}
	});

	it('the jtc template modal is claimed by the modal handler only', () => {
		const modal = JSON.stringify(jtcTemplateModal('방').toJSON());
		const [modalId, inputId] = [...modal.matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]!);
		expect(modalId).toBe(settingsId.encode('jtcTemplateModal'));
		expect(inputId).toBe(settingsId.encode('jtcTemplateInput'));
		const modalHandler = new SettingsModalHandler(ctx, ctx);
		expect(modalHandler.parse({ customId: modalId } as never).isSome()).toBe(true);
		expect(modalHandler.parse({ customId: 'settings:jtc-template' } as never).isSome()).toBe(false);
		expect(claims(new SettingsInteractionHandler(ctx, ctx) as never, modalId!)).toBe(false);
	});

	it('search view ids decode to select and cancel', () => {
		const tracks = [{ info: { title: '곡', author: 'a', duration: 1000 } }];
		const rendered = ids(searchResults('q', tracks as never).toJSON());
		expect(rendered.map((id) => searchId.decode(id)?.action)).toEqual(['select', 'cancel']);
	});

	it('library view ids decode with the panel session id', () => {
		const detail = { playlist: { name: '목록' }, tracks: [{ id: 'e1', track: { title: '곡', artist: 'a' } }] };
		const playlists = [{ id: 'p1', name: '목록', description: '', _count: { tracks: 1 } }];
		const session = '123e4567-e89b-12d3-a456-426614174000';
		for (const [state, withDetail] of [
			[{ kind: 'list', page: 0 }, false],
			[{ kind: 'tracks', playlistId: 'p1', page: 0 }, true],
			[{ kind: 'remove', playlistId: 'p1', page: 0, entryId: 'e1' }, true],
			[{ kind: 'delete', playlistId: 'p1', page: 0 }, true]
		] as const) {
			const rendered = ids(playlistLibraryView(session, state as never, playlists as never, (withDetail ? detail : null) as never).toJSON());
			expect(rendered.length).toBeGreaterThan(0);
			for (const id of rendered) expect(libraryId.decode(id), id).toMatchObject({ sessionId: session });
		}
	});

	it('playlist add and vote skip view ids decode', () => {
		const container = askPlaylistAdd({
			playlist: { name: 'p' },
			selectedTrack: { info: { title: 't', author: 'a', duration: 1, uri: 'u', artworkUrl: null, identifier: 'i' }, requester: { id: 'u' } },
			remainTracks: [{}],
			player: { queue: { tracks: [], current: null }, paused: false }
		} as never);
		expect(ids(container.toJSON()).map((id) => playlistAddId.decode(id)?.action)).toEqual(['addRemaining', 'skipRemaining']);

		const customId = voteSkipId.encode('vote', { interactionId: '100000000000000001' });
		const view = voteSkip({
			requiredVotes: 2,
			votes: 1,
			trackToSkip: { info: { title: 't', author: 'a', duration: 1, uri: 'u', artworkUrl: null } } as never,
			customId
		});
		expect(voteSkipId.decode(ids(view.toJSON())[0]!)).toEqual({ action: 'vote', interactionId: '100000000000000001' });
	});
});
