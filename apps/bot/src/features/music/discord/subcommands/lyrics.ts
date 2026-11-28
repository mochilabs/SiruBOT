import { container, UserError } from '@sapphire/framework';
import { emoji, resolveYouTubeVideoId } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageComponentInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { isLyricsNotFound, searchLyrics, searchLyricsForTrack } from '../../../../services/dataApiClient.ts';
import { LYRICS_BUTTON_IDS, liveLyricsView, lyricsView } from '../views/lyrics.ts';
import { buildLiveLyricsText, parseLiveLines, startLiveLoop } from '../utils/liveLyrics.ts';
import { buildLyricsText, hasTranslation, type LyricsViewMode } from '../utils/lyricsText.ts';
import { type ComponentSession, createComponentSession } from '../../../../lib/componentSession.ts';
import { errorView } from '../../../../lib/errorView.ts';
import { inFreshGuildTheme } from '../../../../lib/guildThemeScope.ts';

export const name = 'lyrics';
export const ko = '가사';
export const description = '가사를 검색해요.';
export const descriptionEn = 'Search the lyrics of a song.';
export const preconditions = ['TextChannelAllowed'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: '현재 재생 중인 곡 또는 검색한 곡의 가사를 보여줘요.' })
		.addStringOption((option) =>
			option
				.setName('query')
				.setDescription('Song title to search lyrics for (leave empty for current track)')
				.setNameLocalizations({ ko: '검색어' })
				.setDescriptionLocalizations({ ko: '가사를 검색할 곡 제목 (비우면 현재 재생곡)' })
				.setRequired(false)
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply();

	let query = interaction.options.getString('query');
	let current: { title: string; artist: string; durationMs: number; sourceName: string | null; videoId: string | null } | null = null;

	if (!query) {
		const player = container.audio.getPlayer(interaction.guildId);
		if (player?.queue.current) {
			const track = player.queue.current;
			query = `${track.info.author} ${track.info.title}`.replace(/\(.*?\)|\[.*?\]/g, '').trim();
			current = {
				title: track.info.title,
				artist: track.info.author,
				durationMs: track.info.duration,
				sourceName: track.info.sourceName ?? null,
				videoId: resolveYouTubeVideoId(track)
			};
		} else {
			throw new UserError({
				identifier: 'lyrics_no_track',
				message: `${emoji('error')} 검색어를 입력하거나 곡을 재생 중이어야 해요.`,
				context: { ephemeral: true }
			});
		}
	}

	try {
		// 가사 없음은 빈 결과로 바꿔 아래 "찾을 수 없었어요" 분기 하나로 처리해요.
		const results = await (current ? searchLyricsForTrack(current).catch(() => searchLyrics(query)) : searchLyrics(query)).catch(
			(error: unknown) => {
				if (isLyricsNotFound(error)) return [];
				throw error;
			}
		);

		if (!results || results.length === 0 || (!results[0].plainLyrics && !results[0].syncedLyrics)) {
			await interaction.editReply({
				components: [errorView(`${emoji('error')} **${query}**에 대한 가사를 찾을 수 없었어요.`)],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		let result = results[0];
		let mode: LyricsViewMode = hasTranslation(result) ? 'both' : 'original';
		const liveLines = current ? parseLiveLines(result.syncedLyrics) : null;
		const trackKey = (t: { info: { identifier: string; uri?: string | null } } | null | undefined) =>
			t ? `${t.info.identifier}|${t.info.uri ?? ''}` : null;
		const startKey = trackKey(container.audio.getPlayer(interaction.guildId)?.queue.current);
		const render = (disabled = false) => {
			const translation = hasTranslation(result) ? 'ready' : result.translation?.status === 'pending' ? 'pending' : 'none';
			return {
				components: [
					lyricsView(result.trackName, buildLyricsText(result, mode), {
						translation,
						mode,
						disabled,
						live: liveLines !== null
					})
				],
				flags: [MessageFlags.IsComponentsV2 as const]
			};
		};

		const message = await interaction.editReply(render());
		const needsSession = hasTranslation(result) || result.translation?.status === 'pending' || liveLines !== null;
		if (!needsSession) return;

		const startViewSession = (): void => {
			createComponentSession(message, {
				time: 10 * 60 * 1000,
				owner: { userId: interaction.user.id },
				logger: container.logger,
				onCollect: async (button, session) => {
					if (button.customId === LYRICS_BUTTON_IDS.live && liveLines) {
						session.settle('live');
						await startLive(button);
						return;
					}
					if (button.customId === LYRICS_BUTTON_IDS.refresh) {
						const refreshed = await searchLyrics(query!).catch(() => null);
						if (refreshed?.[0]) result = refreshed[0];
						if (hasTranslation(result)) mode = 'both';
					} else if (button.customId === LYRICS_BUTTON_IDS.original) mode = 'original';
					else if (button.customId === LYRICS_BUTTON_IDS.translation) mode = 'translation';
					else if (button.customId === LYRICS_BUTTON_IDS.both) mode = 'both';
					await button.update(render());
				},
				onTimeout: async () => {
					await interaction.editReply(render(true)).catch(() => null);
				}
			});
		};

		const startLive = async (button: MessageComponentInteraction): Promise<void> => {
			const lines = liveLines!;
			const currentTranslation = () => (hasTranslation(result) ? result.translation!.lines! : null);
			const livePayload = (text: string) => ({
				components: [liveLyricsView(result.trackName, text)],
				flags: [MessageFlags.IsComponentsV2 as const]
			});
			await button.update(livePayload(buildLiveLyricsText(lines, -1, currentTranslation())));
			// 번역이 아직 준비 중이면 실시간 동안 10초마다 다시 불러와 줄에 붙여요. 위 update가 실패하면 타이머를 만들지 않아요.
			const refreshTimer = setInterval(() => {
				if (hasTranslation(result) || result.translation?.status !== 'pending' || !current) return;
				void searchLyricsForTrack(current)
					.then((fresh) => void (fresh[0] && (result = fresh[0])))
					.catch(() => null);
			}, 10_000);

			let liveSession: ComponentSession | undefined;
			const stop = startLiveLoop({
				lines,
				getTranslation: currentTranslation,
				getPositionMs: () => container.audio.getPlayer(interaction.guildId)?.position ?? null,
				isSameTrack: () => trackKey(container.audio.getPlayer(interaction.guildId)?.queue.current) === startKey,
				// 인터랙션 토큰은 15분 뒤 만료되고 타이머 중 서버 색 변경도 반영하기 위해 메시지를 직접 고쳐요.
				render: (text) => inFreshGuildTheme(interaction.guildId, async () => void (await message.edit(livePayload(text)))),
				onEnd: async () => {
					clearInterval(refreshTimer);
					liveSession?.settle('ended');
					await inFreshGuildTheme(interaction.guildId, () => message.edit(render())).catch(() => null);
					startViewSession();
				}
			});
			liveSession = createComponentSession(message, {
				time: 6 * 60 * 60 * 1000,
				filter: (i) => i.customId === LYRICS_BUTTON_IDS.liveStop,
				logger: container.logger,
				onCollect: async (stopButton) => {
					await stopButton.deferUpdate();
					stop('user');
				},
				onTimeout: () => stop('error')
			});
		};

		startViewSession();
	} catch (error) {
		container.logger.error(`[lyrics] lyrics search failed (guild ${interaction.guildId}): ${error}`);
		throw new UserError({
			identifier: 'lyrics_search_failed',
			message: `${emoji('error')} 가사를 검색하는 중 오류가 발생했어요.`,
			context: { ephemeral: true }
		});
	}
}
