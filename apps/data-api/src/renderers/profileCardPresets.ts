/**
 * 프로필 카드 렌더러 — 프리셋 선택 지원.
 * preset 'classic'은 기존 배너형 카드(profileCard.ts), 'dark'·'ticket'은 RINE 스타일 2종이에요.
 */
import { renderProfileCardDark, type ProfileCardDarkInput } from './profileCardDark.ts';
import { renderProfileCardTicket, type ProfileCardTicketInput } from './profileCardTicket.ts';

export type { ProfileCardDarkInput, ProfileCardTicketInput };
export { renderProfileCardDark, renderProfileCardTicket };

export type ProfileCardPreset = 'classic' | 'dark' | 'ticket';

/**
 * 프리셋 래퍼 — 라우트에서 한 번에 분기해요.
 * dark/ticket 공통 필드(이름·핸들·아바타·날짜·역할·곡)는 같은 이름으로 매핑돼요.
 */
export async function renderProfileCardPreset(
	preset: ProfileCardPreset,
	classic: Parameters<(typeof import('./profileCard.ts'))['renderProfileCard']>[0],
	variant: { dark: ProfileCardDarkInput; ticket: ProfileCardTicketInput }
): Promise<Buffer> {
	if (preset === 'dark') return renderProfileCardDark(variant.dark);
	if (preset === 'ticket') return renderProfileCardTicket(variant.ticket);
	const { renderProfileCard } = await import('./profileCard.ts');
	return renderProfileCard(classic);
}
