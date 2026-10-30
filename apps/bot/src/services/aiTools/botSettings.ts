import { container } from '@sapphire/framework';
import { ChannelType, type Guild, type GuildBasedChannel, type Role } from 'discord.js';
import { checkManageGuild } from '../../modules/audio/utils/permissionCheck.ts';
import type { AiMode, PinnedChannelMode } from '../guildSettings/types.ts';
import type { AiTool, AiToolContext } from './types.ts';

function requireGuild(ctx: AiToolContext): string {
	if (!ctx.guildId) throw new Error('서버 채널에서만 봇 설정을 사용할 수 있어요.');
	return ctx.guildId;
}

function requireManageGuildPermission(ctx: AiToolContext): void {
	requireGuild(ctx);
	if (!ctx.member) throw new Error('사용자 권한을 확인할 수 없어요.');
	let allowed = false;
	try {
		allowed = checkManageGuild(ctx.member);
	} catch {
		allowed = false;
	}
	if (!allowed) {
		throw new Error('봇 설정은 서버 관리(Manage Guild) 권한이 있는 멤버만 변경할 수 있어요.');
	}
}

function isNoneValue(val: unknown): boolean {
	if (val === null || val === undefined) return true;
	const s = String(val).trim().toLowerCase();
	return s === '' || s === 'none' || s === 'null' || s === '해제' || s === '삭제' || s === '없음';
}

function resolveChannel(guild: Guild, input: string): GuildBasedChannel {
	const trimmed = String(input).trim();
	const mentionMatch = /^<#([^>]+)>$/.exec(trimmed);
	const rawId = mentionMatch ? mentionMatch[1]! : trimmed;

	// 1. Direct ID lookup
	const byId = guild.channels.cache.get(rawId);
	if (byId) return byId;

	// 2. Name lookup (with or without '#')
	const cleanName = trimmed.replace(/^#/, '').toLowerCase();
	const byName = guild.channels.cache.find((c) => c.name.toLowerCase() === cleanName);
	if (byName) return byName;

	// 3. Partial match
	const partial = guild.channels.cache.find((c) => c.name.toLowerCase().includes(cleanName));
	if (partial) return partial;

	throw new Error(`'${input}' 채널을 찾을 수 없어요. 채널 이름이나 멘션을 확인해 주세요.`);
}

function resolveTextChannel(guild: Guild, input: string): GuildBasedChannel {
	const ch = resolveChannel(guild, input);
	if (!ch.isTextBased()) {
		throw new Error(`'#${ch.name}' 채널은 텍스트 채널이 아니에요.`);
	}
	return ch;
}

function resolveVoiceChannel(guild: Guild, input: string): GuildBasedChannel {
	const ch = resolveChannel(guild, input);
	if (!ch.isVoiceBased()) {
		throw new Error(`'#${ch.name}' 채널은 음성 채널이 아니에요.`);
	}
	return ch;
}

function resolveCategoryChannel(guild: Guild, input: string): GuildBasedChannel {
	const ch = resolveChannel(guild, input);
	if (ch.type !== ChannelType.GuildCategory) {
		throw new Error(`'${ch.name}' 채널은 카테고리가 아니에요. 카테고리를 지정해 주세요.`);
	}
	return ch;
}

function resolveRole(guild: Guild, input: string): Role {
	const trimmed = String(input).trim();
	const mentionMatch = /^<@&([^>]+)>$/.exec(trimmed);
	const rawId = mentionMatch ? mentionMatch[1]! : trimmed;

	// 1. Direct ID lookup
	const byId = guild.roles.cache.get(rawId);
	if (byId) return byId;

	// 2. Name lookup (with or without '@')
	const cleanName = trimmed.replace(/^@/, '').toLowerCase();
	const byName = guild.roles.cache.find((r) => r.name.toLowerCase() === cleanName);
	if (byName) return byName;

	// 3. Partial match
	const partial = guild.roles.cache.find((r) => r.name.toLowerCase().includes(cleanName));
	if (partial) return partial;

	throw new Error(`'${input}' 역할을 찾을 수 없어요. 역할 이름이나 멘션을 확인해 주세요.`);
}

export const botSettingsGetTool: AiTool = {
	name: 'bot_settings_get',
	description:
		'현재 서버의 봇 설정(기본 텍스트/음성 채널, 음악 고정 채널 및 모드, DJ 역할, 임시 음성방(JTC), AI 채팅 모드, 채팅 TTS, 숫자 세기 채널 등)을 조회해요. 모든 사용자가 조회할 수 있어요.',
	properties: {},
	required: [],
	status: '시루가 봇 설정을 확인하는 중..',
	execute: async (_args, ctx) => {
		const guildId = requireGuild(ctx);
		const guild = container.client?.guilds?.cache?.get(guildId);

		const [guildConfig, jtcSettings, aiSettings, ttsSettings, chatToolSettings] = await Promise.all([
			container.guildService.getGuild(guildId),
			container.guildService.getJtcSettings(guildId),
			container.guildService.getAiSettings(guildId),
			container.guildService.getTtsSettings(guildId),
			container.guildService.getChatToolSettings(guildId)
		]);

		const defaultText = guildConfig.textChannelId ? guild?.channels?.cache?.get(guildConfig.textChannelId) : null;
		const defaultVoice = guildConfig.voiceChannelId ? guild?.channels?.cache?.get(guildConfig.voiceChannelId) : null;
		const pinnedChannel = guildConfig.pinnedChannelId ? guild?.channels?.cache?.get(guildConfig.pinnedChannelId) : null;
		const djRole = guildConfig.djRoleId ? guild?.roles?.cache?.get(guildConfig.djRoleId) : null;
		const jtcCategory = jtcSettings.categoryId ? guild?.channels?.cache?.get(jtcSettings.categoryId) : null;
		const countingChannel = chatToolSettings.countingChannelId ? guild?.channels?.cache?.get(chatToolSettings.countingChannelId) : null;

		return JSON.stringify({
			status: 'ok',
			channels: {
				default_text: defaultText
					? { id: defaultText.id, name: defaultText.name }
					: guildConfig.textChannelId
						? { id: guildConfig.textChannelId, name: null }
						: null,
				default_voice: defaultVoice
					? { id: defaultVoice.id, name: defaultVoice.name }
					: guildConfig.voiceChannelId
						? { id: guildConfig.voiceChannelId, name: null }
						: null,
				pinned: pinnedChannel
					? {
							id: pinnedChannel.id,
							name: pinnedChannel.name,
							mode: guildConfig.pinnedChannelMode,
							delete_input: guildConfig.pinnedChannelDeleteInput
						}
					: guildConfig.pinnedChannelId
						? {
								id: guildConfig.pinnedChannelId,
								name: null,
								mode: guildConfig.pinnedChannelMode,
								delete_input: guildConfig.pinnedChannelDeleteInput
							}
						: null
			},
			dj_role: djRole ? { id: djRole.id, name: djRole.name } : guildConfig.djRoleId ? { id: guildConfig.djRoleId, name: null } : null,
			jtc: {
				enabled: jtcSettings.enabled,
				category: jtcCategory
					? { id: jtcCategory.id, name: jtcCategory.name }
					: jtcSettings.categoryId
						? { id: jtcSettings.categoryId, name: null }
						: null,
				template: jtcSettings.template,
				user_limit: jtcSettings.userLimit,
				marker_channel_id: jtcSettings.markerChannelId
			},
			ai: {
				mode: aiSettings.mode,
				allowed_channel_count: aiSettings.channelIds.length
			},
			tts: {
				mode: ttsSettings.mode,
				volume: guildConfig.ttsVolume,
				duck: guildConfig.ttsDuckLevel
			},
			counting: {
				enabled: chatToolSettings.countingEnabled,
				channel: countingChannel
					? { id: countingChannel.id, name: countingChannel.name }
					: chatToolSettings.countingChannelId
						? { id: chatToolSettings.countingChannelId, name: null }
						: null
			}
		});
	}
};

export const botSettingsSetTool: AiTool = {
	name: 'bot_settings_set',
	description:
		'서버의 봇 설정을 변경해요. 서버 관리(ManageGuild) 권한이 필요해요. ' +
		'지정한 항목만 변경돼요. 기본 채널(default_text_channel, default_voice_channel), 고정 채널(pinned_channel, pinned_mode: play|select, pinned_delete_input), ' +
		'DJ 역할(dj_role), 임시 음성방(jtc_enabled, jtc_category, jtc_template, jtc_user_limit), AI 정책(ai_mode, ai_channel_toggle), ' +
		'채팅 TTS(tts_volume, tts_duck, tts_channel_toggle), 카운팅(counting_enabled, counting_channel). ' +
		'채널이나 역할을 해제하려면 null 또는 "none"을 넘기세요.',
	properties: {
		default_text_channel: {
			type: 'string',
			description: '기본 텍스트 채널 이름, 멘션(<#...>), 또는 ID ("none" 또는 null이면 해제)'
		},
		default_voice_channel: {
			type: 'string',
			description: '기본 음성 채널 이름, 멘션(<#...>), 또는 ID ("none" 또는 null이면 해제)'
		},
		pinned_channel: {
			type: 'string',
			description: '음악 고정 명령어 채널 이름, 멘션, 또는 ID ("none" 또는 null이면 해제)'
		},
		pinned_mode: {
			type: 'string',
			enum: ['play', 'select'],
			description: '고정 채널 재생 모드 (play: 즉시 재생, select: 검색 목록에서 선택)'
		},
		pinned_delete_input: {
			type: 'boolean',
			description: '고정 채널에서 사용자가 보낸 명령어 메시지 자동 삭제 여부'
		},
		dj_role: {
			type: 'string',
			description: 'DJ 역할 이름, 멘션(<@&...>), 또는 ID ("none" 또는 null이면 해제)'
		},
		jtc_enabled: {
			type: 'boolean',
			description: '임시 음성방(JTC: Join to Create) 기능 활성화 여부'
		},
		jtc_category: {
			type: 'string',
			description: '임시 음성방이 생성될 카테고리 이름 또는 ID'
		},
		jtc_template: {
			type: 'string',
			description: '임시 음성방 이름 템플릿 (예: {user}님의 방, 최대 100자)'
		},
		jtc_user_limit: {
			type: 'integer',
			description: '임시 음성방 기본 인원 제한 (0은 무제한, 1~99)'
		},
		ai_mode: {
			type: 'string',
			enum: ['disabled', 'all', 'channels'],
			description: 'AI 채팅 허용 범위 (disabled: 끄기, all: 전체 채널, channels: 지정 채널만)'
		},
		ai_channel_toggle: {
			type: 'object',
			properties: {
				channel: { type: 'string', description: '채널 이름, 멘션, 또는 ID' },
				enabled: { type: 'boolean', description: 'AI 채팅 활성화 여부' }
			},
			required: ['channel', 'enabled'],
			description: '특정 채널의 AI 채팅 허용/차단 토글'
		},
		tts_volume: {
			type: 'integer',
			description: '채팅 TTS 음량 (0~150)'
		},
		tts_duck: {
			type: 'integer',
			description: '채팅 TTS 시 음악 더킹(볼륨 낮춤) 레벨 (0~100)'
		},
		tts_channel_toggle: {
			type: 'object',
			properties: {
				channel: { type: 'string', description: '채널 이름, 멘션, 또는 ID' },
				enabled: { type: 'boolean', description: 'TTS 낭독 활성화 여부' }
			},
			required: ['channel', 'enabled'],
			description: '특정 채널의 채팅 TTS 낭독 허용/차단 토글'
		},
		counting_enabled: {
			type: 'boolean',
			description: '숫자 세기(카운팅) 활성화 여부'
		},
		counting_channel: {
			type: 'string',
			description: '숫자 세기 채널 이름, 멘션, 또는 ID ("none" 또는 null이면 해제)'
		}
	},
	required: [],
	status: '시루가 봇 설정을 변경하는 중..',
	execute: async (args, ctx) => {
		const guildId = requireGuild(ctx);
		requireManageGuildPermission(ctx);

		const guild = container.client?.guilds?.cache?.get(guildId);
		if (!guild) {
			throw new Error('서버 정보를 찾을 수 없어요.');
		}

		const updated: Record<string, unknown> = {};

		// 1. 채널 설정
		if (args.default_text_channel !== undefined) {
			if (isNoneValue(args.default_text_channel)) {
				await container.guildService.setDefaultTextChannel(guildId, null);
				updated.default_text_channel = null;
			} else {
				const ch = resolveTextChannel(guild, String(args.default_text_channel));
				await container.guildService.setDefaultTextChannel(guildId, ch.id);
				updated.default_text_channel = { id: ch.id, name: ch.name };
			}
		}

		if (args.default_voice_channel !== undefined) {
			if (isNoneValue(args.default_voice_channel)) {
				await container.guildService.setDefaultVoiceChannel(guildId, null);
				updated.default_voice_channel = null;
			} else {
				const ch = resolveVoiceChannel(guild, String(args.default_voice_channel));
				await container.guildService.setDefaultVoiceChannel(guildId, ch.id);
				updated.default_voice_channel = { id: ch.id, name: ch.name };
			}
		}

		if (args.pinned_channel !== undefined) {
			if (isNoneValue(args.pinned_channel)) {
				await container.guildService.setPinnedChannel(guildId, null);
				updated.pinned_channel = null;
			} else {
				const ch = resolveTextChannel(guild, String(args.pinned_channel));
				await container.guildService.setPinnedChannel(guildId, ch.id);
				updated.pinned_channel = { id: ch.id, name: ch.name };
			}
		}

		if (args.pinned_mode !== undefined && args.pinned_mode !== null) {
			const mode = String(args.pinned_mode);
			if (!['play', 'select'].includes(mode)) {
				throw new Error('고정 채널 모드는 play 또는 select 중 하나여야 해요.');
			}
			const savedMode = await container.guildService.setPinnedChannelMode(guildId, mode as PinnedChannelMode);
			updated.pinned_mode = savedMode;
		}

		if (args.pinned_delete_input !== undefined && args.pinned_delete_input !== null) {
			const deleteInput = Boolean(args.pinned_delete_input);
			await container.guildService.setPinnedChannelDeleteInput(guildId, deleteInput);
			updated.pinned_delete_input = deleteInput;
		}

		// 2. DJ 역할
		if (args.dj_role !== undefined) {
			if (isNoneValue(args.dj_role)) {
				await container.guildService.setDJRole(guildId, null);
				updated.dj_role = null;
			} else {
				const role = resolveRole(guild, String(args.dj_role));
				await container.guildService.setDJRole(guildId, role.id);
				updated.dj_role = { id: role.id, name: role.name };
			}
		}

		// 3. 임시 음성방(JTC)
		if (args.jtc_category !== undefined && args.jtc_category !== null) {
			const category = resolveCategoryChannel(guild, String(args.jtc_category));
			await container.tempVoiceService.setupMarkerChannel(guildId, category.id);
			updated.jtc_category = { id: category.id, name: category.name };
		}

		if (args.jtc_enabled !== undefined && args.jtc_enabled !== null) {
			const enabled = Boolean(args.jtc_enabled);
			await container.guildService.setJtcEnabled(guildId, enabled);
			updated.jtc_enabled = enabled;
		}

		if (args.jtc_template !== undefined && args.jtc_template !== null) {
			const template = String(args.jtc_template).slice(0, 100);
			await container.guildService.setJtcTemplate(guildId, template);
			updated.jtc_template = template;
		}

		if (args.jtc_user_limit !== undefined && args.jtc_user_limit !== null) {
			const limit = Math.max(0, Math.min(99, Math.round(Number(args.jtc_user_limit))));
			await container.guildService.setJtcUserLimit(guildId, limit);
			updated.jtc_user_limit = limit;
		}

		// 4. AI 정책
		if (args.ai_mode !== undefined && args.ai_mode !== null) {
			const mode = String(args.ai_mode);
			if (!['disabled', 'all', 'channels'].includes(mode)) {
				throw new Error('AI 모드는 disabled, all, channels 중 하나여야 해요.');
			}
			const saved = await container.guildService.setAiMode(guildId, mode as AiMode);
			updated.ai_mode = saved;
		}

		if (args.ai_channel_toggle && typeof args.ai_channel_toggle === 'object') {
			const toggle = args.ai_channel_toggle as { channel?: unknown; enabled?: unknown };
			if (toggle.channel) {
				const targetChannel = resolveTextChannel(guild, String(toggle.channel));
				const allText = guild.channels.cache.filter((c) => c.isTextBased()).map((c) => c.id);
				const res = await container.guildService.setChannelAiEnabled(guildId, targetChannel.id, Boolean(toggle.enabled), allText);
				updated.ai_channel_toggle = {
					channel: { id: targetChannel.id, name: targetChannel.name },
					enabled: Boolean(toggle.enabled),
					result_mode: res.mode
				};
			}
		}

		// 5. 채팅 TTS
		if (args.tts_volume !== undefined && args.tts_volume !== null) {
			const vol = Math.max(0, Math.min(150, Math.round(Number(args.tts_volume))));
			const { volume: savedVol } = await container.guildService.updateTtsVolume(guildId, vol);
			updated.tts_volume = savedVol;
		}

		if (args.tts_duck !== undefined && args.tts_duck !== null) {
			const duck = Math.max(0, Math.min(100, Math.round(Number(args.tts_duck))));
			const { ttsDuckLevel: savedDuck } = await container.guildService.updateTtsDuck(guildId, duck);
			updated.tts_duck = savedDuck;
		}

		if (args.tts_channel_toggle && typeof args.tts_channel_toggle === 'object') {
			const toggle = args.tts_channel_toggle as { channel?: unknown; enabled?: unknown };
			if (toggle.channel) {
				const targetChannel = resolveTextChannel(guild, String(toggle.channel));
				const allText = guild.channels.cache.filter((c) => c.isTextBased()).map((c) => c.id);
				const res = await container.guildService.setChannelTtsEnabled(guildId, targetChannel.id, Boolean(toggle.enabled), allText);
				updated.tts_channel_toggle = {
					channel: { id: targetChannel.id, name: targetChannel.name },
					enabled: Boolean(toggle.enabled),
					result_mode: res.mode
				};
			}
		}

		// 6. 카운팅 채널
		if (args.counting_enabled !== undefined && args.counting_enabled !== null) {
			const enabled = Boolean(args.counting_enabled);
			const saved = await container.guildService.setCountingEnabled(guildId, enabled);
			updated.counting_enabled = saved;
		}

		if (args.counting_channel !== undefined) {
			if (isNoneValue(args.counting_channel)) {
				await container.guildService.setCountingChannel(guildId, null);
				updated.counting_channel = null;
			} else {
				const ch = resolveTextChannel(guild, String(args.counting_channel));
				await container.guildService.setCountingChannel(guildId, ch.id);
				updated.counting_channel = { id: ch.id, name: ch.name };
			}
		}

		if (Object.keys(updated).length === 0) {
			throw new Error('변경할 봇 설정 항목이 지정되지 않았어요.');
		}

		return JSON.stringify({
			status: 'ok',
			updated
		});
	}
};

export const botSettingsTools: AiTool[] = [botSettingsGetTool, botSettingsSetTool];
