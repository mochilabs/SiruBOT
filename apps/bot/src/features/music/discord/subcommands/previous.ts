import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { previousReplayed } from '../views/previous.ts';
import { actorFromMember } from '../../application/actor.ts';

export const name = 'previous';
export const ko = '이전곡';
export const description = '이전에 재생한 곡을 다시 재생해요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Play the previous track again.';
export const preconditions = ['NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	// 복원/필터 준비는 Lavalink REST 왕복이므로 3초 응답 제한에 걸리기 전에 defer한다.
	await interaction.deferReply();
	// 인가·플레이어 확인·재생 기록 확인·이전곡 재생은 유스케이스가 맡아요.
	const { track } = await container.music.previous(actorFromMember(interaction.member));

	await interaction.editReply({
		components: [previousReplayed(track.info.title ?? '알 수 없는 곡')],
		flags: [MessageFlags.IsComponentsV2]
	});
}
