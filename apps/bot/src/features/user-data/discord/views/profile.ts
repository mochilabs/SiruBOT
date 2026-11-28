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

export function birthdayAnnounceView(enabled: boolean, hasBirthday: boolean) {
	if (!enabled) {
		return notice(`${emoji('success')} 이 서버에서 생일 축하를 받지 않도록 바꿨어요.`);
	}
	const lines = [
		`### ${emoji('cake')} 이 서버에서 생일 축하를 받아요`,
		'',
		hasBirthday
			? '생일 당일, 서버가 정한 시각에 서버 채널로 축하 카드가 올라와요. 이 서버에서만 적용돼요.'
			: `${emoji('warning')} 아직 생일을 등록하지 않았어요. \`/프로필 생일설정\`으로 등록해야 축하받을 수 있어요.`,
		'',
		'-# 서버가 생일 축하를 켜 둔 경우에만 보내요. 새로 켠 서버는 다음 날부터 축하해요.',
		'-# 나이는 저장하지 않아요. 언제든 `/프로필 생일축하`로 끌 수 있어요.'
	];
	return notice(lines.join('\n'));
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

export function profileCardView(filename: string) {
	return createContainer().addMediaGalleryComponents((gallery) => gallery.addItems((item) => item.setURL(`attachment://${filename}`)));
}

export function profileTextView(lines: string[], avatarUrl: string) {
	return createContainer().addSectionComponents((s) =>
		s.addTextDisplayComponents((t) => t.setContent(lines.join('\n'))).setThumbnailAccessory((t) => t.setURL(avatarUrl))
	);
}
