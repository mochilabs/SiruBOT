import { defineCustomId, field } from '../../../lib/customId.ts';

/**
 * 오디오 모듈의 customId 선언 — 뷰는 `encode`, 인터랙션 핸들러·컬렉터는 `decode`로 같은 선언을 써요.
 * 대기열 목록(`queue`)은 화면 상태가 커서 `utils/queueViewId.ts`에 따로 선언해요.
 */

/** 재생 컨트롤러 버튼 — `views/controller.ts` ↔ `interaction-handlers/controllerButton.ts` */
export const controllerId = defineCustomId({
	namespace: 'controller',
	version: 1,
	actions: {
		prev: {},
		pause: {},
		resume: {},
		next: {},
		stop: {},
		repeat: { mode: field.oneOf(['off', 'track', 'queue'] as const) },
		chapter: { direction: field.oneOf(['prev', 'next'] as const) },
		volume: { direction: field.oneOf(['up', 'down'] as const) },
		/** 컨트롤러 아래 '대기열 보기' 버튼 */
		queueView: {}
	}
});

/** 필터 패널 — `views/filter.ts` ↔ `filterSelectMenu.ts`(select) · `filterButton.ts`(reset) */
export const filterId = defineCustomId({
	namespace: 'filter',
	version: 1,
	actions: { select: {}, reset: {} }
});

/**
 * 서버 설정 패널과 방 이름 템플릿 모달 — `views/settings.ts` ↔ `settings.ts` · `settingsModal.ts`
 * 액션 이름은 `{동작}{대상}` 형태이고, 어느 화면(mode)으로 다시 그릴지는 핸들러의 표가 정해요.
 */
export const settingsId = defineCustomId({
	namespace: 'settings',
	version: 1,
	actions: {
		navigate: {},
		back: {},
		toggleController: {},
		toggleRelated: {},
		toggleRepeat: {},
		togglePinDelete: {},
		toggleJtc: {},
		selectSponsorblock: {},
		resetSponsorblock: {},
		selectDj: {},
		removeDj: {},
		selectText: {},
		selectVoice: {},
		selectPin: {},
		selectPinMode: {},
		removeText: {},
		removeVoice: {},
		removePin: {},
		jtcTemplate: {},
		selectJtcCategory: {},
		selectJtcLimit: {},
		/** 방 이름 템플릿 모달과 그 안의 입력칸 — 컴포넌트 핸들러가 아니라 `settingsModal.ts`가 받아요. */
		jtcTemplateModal: {},
		jtcTemplateInput: {}
	}
});

/** 검색 결과 셀렉트·취소 버튼 — 메시지 컬렉터(`subcommands/search.ts`, `listeners/commandChannel.ts`)가 받아요. */
export const searchId = defineCustomId({
	namespace: 'search',
	version: 1,
	actions: { select: {}, cancel: {} }
});

/** 내 음악 보관함 — `views/playlist.ts` ↔ `views/playlistPanel.ts` 컬렉터. sessionId는 패널을 연 때마다 새로 만드는 UUID예요. */
export const libraryId = defineCustomId({
	namespace: 'library',
	version: 1,
	actions: {
		prev: { sessionId: field.token({ maxLength: 36 }) },
		next: { sessionId: field.token({ maxLength: 36 }) },
		create: { sessionId: field.token({ maxLength: 36 }) },
		add: { sessionId: field.token({ maxLength: 36 }) },
		home: { sessionId: field.token({ maxLength: 36 }) },
		open: { sessionId: field.token({ maxLength: 36 }) },
		remove: { sessionId: field.token({ maxLength: 36 }) },
		delete: { sessionId: field.token({ maxLength: 36 }) },
		cancel: { sessionId: field.token({ maxLength: 36 }) },
		confirm: { sessionId: field.token({ maxLength: 36 }) },
		play: { sessionId: field.token({ maxLength: 36 }) },
		/** 곡 추가·새 플레이리스트 모달과 그 입력칸 */
		form: { formId: field.token({ maxLength: 36 }) },
		formValue: {}
	}
});

/** 플레이리스트 재생 후 '나머지 곡 추가' 질문 버튼 — `features/music/playback/audioService.ts` 컬렉터가 받아요. */
export const playlistAddId = defineCustomId({
	namespace: 'playlist-add',
	version: 1,
	actions: { addRemaining: {}, skipRemaining: {} }
});

/** 투표 건너뛰기 버튼 — 투표 메시지마다 상호작용 ID를 실어 같은 채널의 투표가 섞이지 않게 해요. */
export const voteSkipId = defineCustomId({
	namespace: 'skip-vote',
	version: 1,
	actions: { vote: { interactionId: field.snowflake() } }
});
