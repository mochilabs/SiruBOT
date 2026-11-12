/**
 * `/음악` 서브커맨드 요약 카탈로그 — Sapphire나 서브커맨드 모듈을 가져오지 않는 순수 데이터예요.
 * `/도움말`(modules/general)이 이 값을 읽으니 피스 클래스(commands/music.ts)를 불러오지 않아도 돼요.
 * 항목은 각 서브커맨드 모듈의 name·ko·description·descriptionEn과 같아야 해요 (commandCatalog.test.ts가 확인해요).
 */

export interface MusicSubcommandSummary {
	name: string;
	ko: string;
	description: string;
	descriptionEn: string;
}

/** `/음악` 서브커맨드 전체 (SUBCOMMANDS 순서 그대로) */
const MUSIC_SUBCOMMAND_SUMMARIES: readonly MusicSubcommandSummary[] = [
	{ name: 'play', ko: '재생', description: '음성 채널에서 노래를 재생해요.', descriptionEn: 'Play a track in your voice channel.' },
	{
		name: 'pause',
		ko: '일시정지',
		description: '현재 곡을 일시정지해요. 다시 들으려면 /음악 재개를 사용해 주세요.',
		descriptionEn: 'Pause the current track. Use /music resume to continue.'
	},
	{ name: 'resume', ko: '재개', description: '일시정지한 곡을 이어서 재생해요.', descriptionEn: 'Resume the paused track.' },
	{ name: 'skip', ko: '건너뛰기', description: '현재 재생 중인 곡을 건너뛰어요.', descriptionEn: 'Skip the current track.' },
	{ name: 'stop', ko: '정지', description: '대기열을 정리하고 노래를 멈춰요.', descriptionEn: 'Clear the queue and stop playing.' },
	{ name: 'previous', ko: '이전곡', description: '이전에 재생한 곡을 다시 재생해요.', descriptionEn: 'Play the previous track again.' },
	{
		name: 'seek',
		ko: '시간이동',
		description: '현재 곡의 특정 시간으로 이동해요.',
		descriptionEn: 'Jump to a specific time in the current track.'
	},
	{
		name: 'volume',
		ko: '볼륨',
		description: '볼륨을 설정해요. 볼륨을 비우면 현재 설정만 보여줘요.',
		descriptionEn: 'Set the player volume.'
	},
	{ name: 'repeat', ko: '반복', description: '반복 모드를 설정해요. 모드를 비우면 현재 설정만 보여줘요.', descriptionEn: 'Set the repeat mode.' },
	{
		name: 'filter',
		ko: '필터',
		description: '필터를 적용하거나 해제해요. 프리셋을 비우면 선택 화면을 열어요.',
		descriptionEn: 'Apply or clear an audio filter preset.'
	},
	{
		name: 'search',
		ko: '검색',
		description: '곡을 검색해서 5개 결과 중 골라 재생해요.',
		descriptionEn: 'Search tracks and pick one of five results to play.'
	},
	{ name: 'lyrics', ko: '가사', description: '가사를 검색해요.', descriptionEn: 'Search the lyrics of a song.' },
	{
		name: 'recommend',
		ko: '추천',
		description: '현재 곡 기반의 추천 곡을 대기열에 추가해요.',
		descriptionEn: 'Queue tracks related to the current one.'
	},
	{
		name: 'autoplay',
		ko: '자동재생',
		description: '추천 곡 자동재생을 설정해요. 사용을 비우면 현재 설정만 보여줘요.',
		descriptionEn: 'Turn autoplay of related tracks on or off.'
	},
	{
		name: 'history',
		ko: '재생기록',
		description: '이 서버에서 재생된 최근 음악 기록을 보여줘요.',
		descriptionEn: 'Show recently played tracks in this server.'
	}
];

/** 승격해서 top-level로 빼는 서브커맨드 — `/재생`·`/건너뛰기`·`/정지`가 같은 동작을 해요 */
export const PROMOTED_SUBCOMMAND_NAMES: ReadonlySet<string> = new Set(['play', 'skip', 'stop']);

/** /도움말에서 서브커맨드 멘션을 그릴 때 써요 (승격된 항목 제외) */
export const MUSIC_SUBCOMMANDS: MusicSubcommandSummary[] = MUSIC_SUBCOMMAND_SUMMARIES.filter((sub) => !PROMOTED_SUBCOMMAND_NAMES.has(sub.name));

/** `/도움말`이 승격된 `/재생`·`/건너뛰기`를 별도 줄로 그릴 때 쓰는 문구 */
export const MUSIC_PROMOTED_COMMANDS: { name: string; ko: string; description: string }[] = MUSIC_SUBCOMMAND_SUMMARIES.filter((sub) =>
	PROMOTED_SUBCOMMAND_NAMES.has(sub.name)
).map((sub) => ({ name: sub.name, ko: sub.ko, description: sub.description }));

/** 카탈로그 원본 (테스트·검증용) */
export const MUSIC_SUBCOMMAND_CATALOG: readonly MusicSubcommandSummary[] = MUSIC_SUBCOMMAND_SUMMARIES;
