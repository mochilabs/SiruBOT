import { emoji, type AppEmojiFallbackKey } from '@sirubot/utils';
import { SPONSORBLOCK_SEGMENTS as SPONSORBLOCK_SEGMENT_NAMES, type SponsorBlockSegment } from '@sirubot/utils/guildSettingsContract';
import type { TtsAnnounceMode } from '../../../../services/guildSettings/playback.ts';
import type { AiMode } from '../../../../services/guildSettings/types.ts';

export const repeatLabels: Record<string, string> = {
	off: '반복 없음',
	track: '한 곡 반복',
	queue: '전체 반복'
};

// SponsorBlock 세그먼트 정의 — 이름 목록은 길드 설정 계약(@sirubot/utils/guildSettingsContract)이 단일 소스이고,
// 여기서는 세그먼트별 표시 정보(라벨·이모지·설명)만 붙여요. 계약에 구간이 늘면 타입 오류로 알려줘요.
type SegmentMeta = {
	label: string;
	appEmojiName: AppEmojiFallbackKey;
	description: string;
};

type SegmentType = SegmentMeta & { name: SponsorBlockSegment };

const SEGMENT_META: Record<SponsorBlockSegment, SegmentMeta> = {
	sponsor: { label: '스폰서', appEmojiName: 'money', description: '유료 홍보 및 광고 구간' },
	selfpromo: { label: '자기 홍보', appEmojiName: 'megaphone', description: '채널 홍보, 구독 요청 등' },
	interaction: { label: '상호작용', appEmojiName: 'speech', description: '좋아요, 댓글 요청 등' },
	intro: { label: '인트로', appEmojiName: 'film', description: '반복되는 인트로 영상' },
	outro: { label: '아웃트로', appEmojiName: 'end_flag', description: '엔딩 카드, 크레딧 등' },
	preview: { label: '미리보기', appEmojiName: 'eye', description: '이전 영상 요약 또는 미리보기' },
	music_offtopic: { label: '음악 외 구간', appEmojiName: 'music_note', description: '음악 영상에서 음악이 아닌 부분' },
	filler: { label: '필러', appEmojiName: 'arrow_forward', description: '주제와 관련 없는 장면' }
};

// 앱 이모지 매핑은 봇 부팅(clientReady) 이후 로드되므로, 이모지 필드는 사용 시점에 emoji()로 평가한다.
export const SPONSORBLOCK_SEGMENTS: SegmentType[] = SPONSORBLOCK_SEGMENT_NAMES.map((name) => ({ name, ...SEGMENT_META[name] }));

export const sponsorBlockSegmentEmoji = (segment: SegmentType) => emoji(segment.appEmojiName);

/** 음성 안내 방식 문구 */
export const ANNOUNCE_MODE_LABELS: Record<TtsAnnounceMode, string> = {
	sequential: '순서대로 재생',
	parallel: '겹쳐서 재생',
	interrupt: '최신 안내만 재생'
};

export const ANNOUNCE_MODE_DESCRIPTIONS: Record<TtsAnnounceMode, string> = {
	sequential: '음성 안내를 순서대로 재생해요.',
	parallel: '음성 안내를 겹쳐서 재생해요.',
	interrupt: '새 안내가 오면 대기 중인 안내를 버리고 최신 안내만 재생해요.'
};

export const AI_MODE_LABELS: Record<AiMode, string> = {
	all: '모든 채널',
	channels: '특정 채널',
	off: '꺼짐'
};
