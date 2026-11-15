import { emoji, createContainer } from '@sirubot/utils';
import { notice } from '../../../../lib/notice.ts';

export function birthdaySavedView(month: number, day: number, zodiacText: string) {
	return notice(
		[
			`### ${emoji('cake')} 생일을 저장했어요`,
			'',
			`**${month}월 ${day}일**: 별자리는 **${zodiacText}**예요.`,
			'',
			'-# 생일은 본인에게만 보여요. 다른 사람에게는 별자리만 공개돼요.',
			'-# 이제 `/오하아사`에서 지정 없이도 내 운세를 바로 보여줘요.'
		].join('\n')
	);
}

export function birthdayClearedView(cleared: boolean) {
	return notice(cleared ? `${emoji('trash')} 등록된 생일을 지웠어요.` : `${emoji('info')} 등록된 생일이 없어요.`);
}

export function introSavedView(intro: string) {
	return notice([`### ${emoji('speech')} 소개를 저장했어요`, '', `> ${intro.trim()}`, '', '-# `/프로필 보기`의 프로필 카드에 보여요.'].join('\n'));
}

export function introClearedView(cleared: boolean) {
	return notice(cleared ? `${emoji('trash')} 등록한 소개를 지웠어요.` : `${emoji('info')} 등록한 소개가 없어요.`);
}

/** 프로필 카드 이미지(첨부 파일)를 보여주는 컨테이너 */
export function profileCardView(filename: string) {
	return createContainer().addMediaGalleryComponents((gallery) => gallery.addItems((item) => item.setURL(`attachment://${filename}`)));
}

/** 이미지 렌더 실패 시 쓰는 텍스트 프로필 폴백 */
export function profileTextView(lines: string[], avatarUrl: string) {
	return createContainer().addSectionComponents((s) =>
		s.addTextDisplayComponents((t) => t.setContent(lines.join('\n'))).setThumbnailAccessory((t) => t.setURL(avatarUrl))
	);
}
