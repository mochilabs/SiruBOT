import { container } from '@sapphire/framework';
import { WARN_COLOR } from '@sirubot/utils';
import { ChannelType, ContainerBuilder, GuildMember, PermissionFlagsBits, VoiceBasedChannel, VoiceState } from 'discord.js';

interface RoomInfo {
	guildId: string;
	ownerId: string;
}

interface JtcSettings {
	enabled: boolean;
	categoryId: string | null;
	markerChannelId: string | null;
	template: string;
	userLimit: number;
}

const MARKER_CHANNEL_NAME = '🔊 임시방 만들기';

/** 빈 임시방 자동 삭제 유예 시간(ms) — JTC_EMPTY_GRACE_MS 환경변수, 기본 30초 */
export function jtcEmptyGraceMs(): number {
	return Number(process.env.JTC_EMPTY_GRACE_MS) || 30_000;
}

/** 유예 시간을 한국어로 — '30초', '1분', '1분 30초' */
export function jtcEmptyGraceText(): string {
	const totalSeconds = Math.round(jtcEmptyGraceMs() / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes === 0) return `${seconds}초`;
	if (seconds === 0) return `${minutes}분`;
	return `${minutes}분 ${seconds}초`;
}

export class TempVoiceService {
	private readonly rooms = new Map<string, RoomInfo>();
	private readonly emptyTimers = new Map<string, NodeJS.Timeout>();
	private readonly creating = new Set<string>();
	private readonly EMPTY_GRACE_MS = jtcEmptyGraceMs();

	public async handleVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
		try {
			const guildId = newState.guild.id;
			await this.handleRoomTransitions(oldState, newState);

			const settings = await container.guildService.getJtcSettings(guildId);
			if (!settings.enabled || !settings.markerChannelId) return;

			const member = newState.member;
			if (!member || member.user.bot) return;
			if (newState.channelId === settings.markerChannelId && oldState.channelId !== settings.markerChannelId) {
				await this.createRoom(member, settings);
			}
		} catch (error) {
			container.logger.error(`[tempVoice] voice state handling failed (guild ${newState.guild.id}): ${error}`);
		}
	}

	public handleChannelDelete(channelId: string): void {
		this.rooms.delete(channelId);
		this.clearEmptyTimer(channelId);
	}

	public async createRoomFromMarker(member: GuildMember, settings: JtcSettings): Promise<VoiceBasedChannel | null> {
		return this.createRoom(member, settings);
	}

	public async setupMarkerChannel(guildId: string, categoryId: string): Promise<string> {
		const guild = await container.client.guilds.fetch(guildId);
		const category = await guild.channels.fetch(categoryId);
		if (!category || category.type !== ChannelType.GuildCategory) {
			throw new Error('selected channel is not a category');
		}

		const settings = await container.guildService.getJtcSettings(guildId);
		let marker = settings.markerChannelId ? await guild.channels.fetch(settings.markerChannelId).catch(() => null) : null;

		if (marker && marker.isVoiceBased()) {
			if (marker.parentId !== categoryId) await marker.setParent(categoryId);
		} else {
			marker = await guild.channels.create({ name: MARKER_CHANNEL_NAME, type: ChannelType.GuildVoice, parent: categoryId });
		}

		await container.guildService.setJtcCategory(guildId, categoryId, marker.id);
		return marker.id;
	}

	private async handleRoomTransitions(oldState: VoiceState, newState: VoiceState): Promise<void> {
		const leftId = oldState.channelId;
		const rightId = newState.channelId;
		if (leftId === rightId) return;

		if (leftId) {
			const room = this.rooms.get(leftId);
			if (room) {
				if (oldState.member && room.ownerId === oldState.member.id) {
					await this.handleOwnerLeave(leftId, room, oldState.member);
				}
				await this.checkEmpty(leftId, oldState.channel);
			}
		}

		if (rightId && this.rooms.has(rightId)) {
			this.clearEmptyTimer(rightId);
		}
	}

	private async handleOwnerLeave(channelId: string, room: RoomInfo, member: GuildMember): Promise<void> {
		const channel = member.guild.channels.cache.get(channelId);
		if (!channel || !channel.isVoiceBased()) {
			this.rooms.delete(channelId);
			return;
		}

		const successors = channel.members.filter((m) => !m.user.bot && m.id !== member.id);
		if (successors.size === 0) return;

		const successor = successors.first();
		if (!successor) return;

		await channel.permissionOverwrites.delete(member.id).catch(() => null);
		await channel.permissionOverwrites.edit(successor.id, { ManageChannels: true, MoveMembers: true }).catch(() => null);
		room.ownerId = successor.id;
	}

	private async checkEmpty(channelId: string, channel: VoiceState['channel']): Promise<void> {
		if (!channel || !channel.isVoiceBased()) {
			this.rooms.delete(channelId);
			this.clearEmptyTimer(channelId);
			return;
		}

		const humans = channel.members.filter((m) => !m.user.bot);
		if (humans.size > 0) {
			this.clearEmptyTimer(channelId);
			return;
		}

		if (this.emptyTimers.has(channelId)) return;
		this.scheduleEmptyCheck(channelId);
	}

	/** 유예 시간 후 빈방 확인(deleteIfEmpty)을 다시 건다 — 중복 타이머 없음. */
	private scheduleEmptyCheck(channelId: string): void {
		const timer = setTimeout(() => void this.deleteIfEmpty(channelId), this.EMPTY_GRACE_MS);
		this.emptyTimers.set(channelId, timer);
	}

	private async deleteIfEmpty(channelId: string): Promise<void> {
		this.emptyTimers.delete(channelId);
		if (!this.rooms.has(channelId)) return;

		// 추적은 "채널이 실제로 사라졌거나, 확인 시점에 확실히 비어서 삭제된" 경우에만 끝낸다.
		// 유예 시점에 사람이 있었는데 untrack해 버리면 그 방은 영구 고아가 된다(JTC 고아 채널 버그).
		const channel = await container.client.channels.fetch(channelId).catch(() => null);
		if (!channel || !channel.isVoiceBased()) {
			this.rooms.delete(channelId);
			return;
		}

		const humans = channel.members.filter((m) => !m.user.bot);
		if (humans.size > 0) {
			// 사람이 다시 있음 — 추적을 유지하고 다음 유예 확인을 다시 건다 (입장 시 checkEmpty도 타이머를 지운다).
			this.scheduleEmptyCheck(channelId);
			return;
		}

		try {
			await channel.delete(`임시 음성채널: ${jtcEmptyGraceText()}간 비어 있음`);
			this.rooms.delete(channelId);
		} catch (error) {
			container.logger.error(`[tempVoice] failed to delete empty room ${channelId}: ${error}`);
			// 삭제 실패(권한 등) — 추적을 유지해 다음 유예마다 재시도한다.
			this.scheduleEmptyCheck(channelId);
		}
	}

	private async createRoom(member: GuildMember, settings: JtcSettings): Promise<VoiceBasedChannel | null> {
		const guildId = member.guild.id;
		// 같은 멤버의 중복 진입 이벤트만 막는다 — guild-wide 락이면 다른 멤버의 동시 생성이
		// 응답 없음(null)으로 조용히 버려져 마커 채널에 발이 묶인다.
		const createKey = `${guildId}:${member.id}`;
		if (this.creating.has(createKey)) return null;

		const owned = [...this.rooms.entries()].find(([, room]) => room.guildId === guildId && room.ownerId === member.id);
		if (owned) {
			const ownedChannel = member.guild.channels.cache.get(owned[0]);
			if (ownedChannel?.isVoiceBased()) {
				await member.voice.setChannel(ownedChannel).catch(() => null);
				this.clearEmptyTimer(owned[0]);
				return ownedChannel;
			}
			this.rooms.delete(owned[0]);
		}

		this.creating.add(createKey);
		try {
			const channel = await member.guild.channels.create({
				name: this.renderName(settings.template, member.displayName),
				type: ChannelType.GuildVoice,
				parent: settings.categoryId ?? undefined,
				userLimit: settings.userLimit > 0 ? settings.userLimit : undefined,
				permissionOverwrites: [{ id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] }]
			});
			this.rooms.set(channel.id, { guildId, ownerId: member.id });
			try {
				await member.voice.setChannel(channel);
			} catch (moveError) {
				// 방 생성·추적은 성공했고 이동만 실패한 상태 — 추적을 버리면 빈 방이 채널에 남고,
				// 실패로 보고하면 방이 있는데 "못 만들었다"가 된다. 유예 확인을 걸어 빈 방이면 정리한다.
				container.logger.warn(`[tempVoice] failed to move member into created room ${channel.id}: ${moveError}`);
				this.scheduleEmptyCheck(channel.id);
				return channel;
			}
			return channel;
		} catch (error) {
			container.logger.error(`[tempVoice] failed to create room for guild ${guildId}: ${error}`);
			// 마커 채널 진입자에게 실패 사실을 알려요 — 무응답 두면 "왜 안 만들어지지?" 상태가 돼요.
			try {
				const settings = await container.guildService.getJtcSettings(guildId);
				const marker = settings.markerChannelId ? member.guild.channels.cache.get(settings.markerChannelId) : undefined;
				if (marker?.isTextBased()) {
					await marker.send({
						components: [
							new ContainerBuilder()
								.setAccentColor(WARN_COLOR)
								.addTextDisplayComponents((textDisplay) =>
									textDisplay.setContent('❌ 임시 음성 채널을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
								)
						]
					});
				}
			} catch (notifyError) {
				container.logger.debug(`[tempVoice] failed to notify room create failure: ${notifyError}`);
			}
			return null;
		} finally {
			this.creating.delete(createKey);
		}
	}

	private renderName(template: string, displayName: string): string {
		const sanitized = displayName.replace(/["*`|\\]/g, '').trim() || '사용자';
		const rendered = template.replaceAll('{user}', sanitized).trim() || `${sanitized}의 방`;
		return rendered.slice(0, 100);
	}

	private clearEmptyTimer(channelId: string): void {
		const timer = this.emptyTimers.get(channelId);
		if (timer) {
			clearTimeout(timer);
			this.emptyTimers.delete(channelId);
		}
	}
}

export type { JtcSettings };
