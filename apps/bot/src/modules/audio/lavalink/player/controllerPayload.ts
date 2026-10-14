/**
 * 컨트롤러 페이로드 공용 빌더 — now-playing 카드를 고정 채널에서만 붙이고
 * 카드 첨부 유지/재업로드 정책을 한 곳에서 다룬다.
 * playerNotifier(전송/수정)와 controllerButton(버튼 갱신)이 공유한다.
 */
import { container } from '@sapphire/framework';
import type { AttachmentBuilder, ContainerBuilder, Message } from 'discord.js';
import { getDisplayNowPlayingCard, type NowPlayingCardAttachment } from './nowPlayingCard.ts';
import { controllerView } from '../../view/controller.ts';
import type { CustomPlayer } from './customPlayer.ts';

export interface ControllerCardPayloadOptions {
	/** 컨트롤러에 표시할 볼륨 */
	volume: number;
	/** 카드를 붙일 채널 — 길드 고정 채널과 일치할 때만 카드가 붙는다 */
	textChannelId: string | null | undefined;
	/** 갱신 중인 기존 컨트롤러 메시지 — 없으면(새 전송) 카드를 항상 업로드한다 */
	message?: Message | null;
	/**
	 * 메시지에 붙어 있던 카드의 trackKey — 현재 카드와 다르면 같은 파일명이라도 재업로드한다
	 * (playerNotifier cardTrackKeys 뉘앙스: 볼륨/챕터/일시정지 상태가 바뀐 카드는 파일명이 같다).
	 * 생략하면 기존 첨부를 유지하고 파일명이 없을 때만 업로드한다 (controllerButton 정책).
	 */
	previousTrackKey?: string;
}

export interface ControllerCardPayload {
	/** textChannelId가 길드 고정 채널이었는지 — 카드 리프레시 트리거 판정에도 쓴다 */
	pinned: boolean;
	/** 현재 곡 카드 (고정 채널이 아니면 null) */
	card: NowPlayingCardAttachment | null;
	components: ContainerBuilder;
	/** 유지할 기존 첨부(같은 파일명) — 새 전송이거나 재업로드 시 빈 배열 */
	attachments: { id: string }[];
	/** 이번에 새로 올릴 카드 파일 */
	files: AttachmentBuilder[];
}

/** 고정 채널 판정 → 카드 해석 → 컨트롤러 컴포넌트/첨부 조립까지 한 번에. */
export async function buildControllerCardPayload(player: CustomPlayer, options: ControllerCardPayloadOptions): Promise<ControllerCardPayload> {
	const pinnedChannelId = await container.guildService.getPinnedChannel(player.guildId).catch(() => null);
	const pinned = Boolean(options.textChannelId) && options.textChannelId === pinnedChannelId;
	const card = pinned ? getDisplayNowPlayingCard(player) : null;

	const components = controllerView({
		player,
		volume: options.volume,
		textChannelId: options.textChannelId ?? undefined,
		nowPlayingCardUrl: card?.url
	});

	const cardNeedsUpload = card !== null && options.previousTrackKey !== undefined && options.previousTrackKey !== card.trackKey;
	const attachments =
		card && !cardNeedsUpload && options.message
			? options.message.attachments.filter((file) => file.name === card.filename).map((file) => ({ id: file.id }))
			: [];
	const files = card && (cardNeedsUpload || !options.message?.attachments.some((file) => file.name === card.filename)) ? [card.file] : [];

	return { pinned, card, components, attachments, files };
}
