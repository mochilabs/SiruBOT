TOTAL: 27 (HIGH:9 MEDIUM:9 LOW:9)

# data-api services/providers/renderers/utils antislop 감사

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 범위: `apps/data-api/src/{services,providers,renderers,utils}/**` (renderers/canvas 포함). routes/plugins/config 제외.
- 감사 파일 수: 56 (비테스트 38 전문 검토 + 테스트 18 패턴 스캔)
- 방법: 주석·중복·죽은 코드는 전수 확인, 캔버스 텍스트 대비는 `/home/sunshine/.config/opencode/skills/antislop-human/contrast-check.py`로 산출한 수치로만 FAIL 판정. 알파 텍스트는 실제 합성 색으로 변환 후 측정. 코드·설정 변경 없음.

---

## findings

### 1. [HIGH] 인사 카드 에러 메시지 4곳에 em dash

- 위치: `apps/data-api/src/renderers/memberGreetingCard.ts:274` (동일 문자열이 281, 286, 304에도 있음)
- 규칙: R-02 (하드 게이트, 유저 대상 에러 문구)
- 사유: 라우트가 400 응답으로 그대로 노출하는 유저 대상 메시지에 U+2014이 들어 있다.
- 근거 (원본의 U+2014는 `\u2014`로 표기):

```ts
throw new GreetingBackgroundError('invalid_image', '이미지를 읽을 수 없어요 \u2014 PNG·JPEG·WEBP 파일로 다시 시도해 주세요.');
```

- 제안: 쉼표 또는 온점으로 교체(예: `이미지를 읽을 수 없어요. PNG·JPEG·WEBP 파일로 다시 시도해 주세요.`), 4개 문자열은 상수 하나로 추출.

### 2. [HIGH] LIVE 뱃지 흰 글씨 대비 3.48:1

- 위치: `apps/data-api/src/renderers/nowPlayingCard.ts:342`
- 규칙: R-25
- 사유: 14px 일반 텍스트(4.5:1 기준)가 3.48:1이라 미달, contrast-check.py 측정 결과 normal FAIL.
- 근거:

```ts
badgeX = drawPill(ctx, { x: badgeX, y: 32, icon: 'radio', label: 'LIVE', bg: '#ff3b5c', fg: '#ffffff' }) + 8;
```

- 제안: 뱃지 배경을 #d11f3f로 바꾸면 흰 글씨 5.28:1로 PASS(contrast-check.py 측정). 글씨 쪽을 바꿀 때도 4.5:1 확보 후 재측정.

### 3. [HIGH] 다크 프로필 헤더 `PROFILE` 라벨 대비 2.88~4.14:1

- 위치: `apps/data-api/src/renderers/profileCardDark.ts:216`
- 규칙: R-25
- 사유: 헤더 그라디언트 밝은 구간(#987bbd~#795f93) 위에 흰색 80% 17px 텍스트를 얹어 핸들 길이에 따라 2.88~4.14:1로 4.5:1 미달(27px 핸들 텍스트는 큰 글씨 기준으로 통과).
- 근거:

```ts
ctx.fillStyle = 'rgba(255,255,255,0.8)';
ctx.font = '600 17px "Pretendard JP", "Twemoji Mozilla", sans-serif';
ctx.fillText('PROFILE', PAD + 58 + headW, 40);
```

- 제안: 라벨 불투명도를 1.0으로 올리고 그라디언트 시작색을 어둡게 조정하거나 라벨을 헤더 밖(다크 배경)으로 뺀 뒤 재측정.

### 4. [HIGH] 티켓 카드 본문 흐린 잉크(INK_MUTED) 3.47~3.60:1

- 위치: `apps/data-api/src/renderers/profileCardTicket.ts:253` (동일 색이 349, 398, 386 LIGHT_MUSIC_PAL.textMuted에도 사용)
- 규칙: R-25
- 사유: `rgba(63,58,53,0.62)`를 크림(#f3efe6) 위에서 합성하면 #837f78로 3.47:1, 카드(#fbf8f2) 위에서는 3.60:1로 15~22px 본문이 4.5:1 미달.
- 근거:

```ts
ctx.fillStyle = INK_MUTED;
ctx.font = '500 22px "Pretendard JP", "Twemoji Mozilla", sans-serif';
ctx.fillText(tkHandle, nameX, handleBase + 8);
```

- 제안: 알파를 0.62에서 0.78로 올리면 크림 5.26:1, 카드 5.54:1로 PASS(측정 완료). 라이트 음악 팔레트도 같은 값으로 통일.

### 5. [HIGH] 티켓 카드 역할 캡슐 텍스트 2.31/3.25:1

- 위치: `apps/data-api/src/renderers/profileCardTicket.ts:57` (drawChip 호출은 298)
- 규칙: R-25
- 사유: 핑크 캡슐 2.31:1, 그린 캡슐 3.25:1로 16px 텍스트 4.5:1 기준에 크게 미달(3.0:1조차 핑크는 실패).
- 근거:

```ts
const CHIP_PINK_BG = '#e8d4d2';
const CHIP_PINK_TEXT = '#b97f7e';
const CHIP_GREEN_BG = '#d6e4da';
```

- 제안: 핑크 캡슐 글씨를 #7d4a49(5.01:1), 그린 캡슐 글씨를 #46614f(5.18:1)로 교체하면 PASS(측정 완료).

### 6. [HIGH] 티켓 카드 온라인 캡슐 라벨 3.60:1

- 위치: `apps/data-api/src/renderers/profileCardTicket.ts:280`
- 규칙: R-25
- 사유: `#5d7a66` 텍스트를 `#d6e4da` 배경에 16px로 그려 4.5:1 미달.
- 근거:

```ts
ctx.fillStyle = SAGE_MID;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
```

- 제안: SAGE_MID 대신 SAGE_DEEP(#4f6a58)을 쓰면 같은 배경에서 4.52:1로 PASS(측정 완료).

### 7. [HIGH] 티켓 카드 헤더·푸터 로즈 텍스트 1.93/2.73:1

- 위치: `apps/data-api/src/renderers/profileCardTicket.ts:223` (푸터 0.8 버전은 369)
- 규칙: R-25
- 사유: 알파 0.55 로즈가 크림에서 1.93:1, 알파 0.8도 2.73:1로 큰 글씨 기준(3.0:1)마저 실패하는 최저 수치.
- 근거:

```ts
ctx.fillStyle = 'rgba(169, 106, 100, 0.55)';
ctx.font = '600 17px "Pretendard JP", "Twemoji Mozilla", sans-serif';
ctx.fillText(`${input.profileId.toUpperCase()} / MEMBER PASS`, PAD, 36);
```

- 제안: `#a96a64`는 같은 크림에서 3.71:1로 여전히 미달이므로 `#8f544e`(5.16:1, 측정 완료) 이하의 어두운 로즈로 교체하고 17px 기준 4.5:1을 재확인.

### 8. [HIGH] 티켓 스텁 `PERSONAL PROFILE` 라벨 2.33~2.58:1

- 위치: `apps/data-api/src/renderers/profileCardTicket.ts:211`
- 규칙: R-25
- 사유: `rgba(79,106,88,0.75)` 15px 텍스트를 세이지(#bfd3c5) 위에서 합성하면 2.58:1, 우측 그라디언트가 밝아진 구간에서는 2.33:1로 4.5:1 미달.
- 근거:

```ts
ctx.fillStyle = 'rgba(79, 106, 88, 0.75)';
ctx.font = '600 15px "Pretendard JP", "Twemoji Mozilla", ui-sans-serif, sans-serif';
ctx.fillText('PERSONAL PROFILE', stubCx, H2 - 40);
```

- 제안: `#4f6a58`로 바꿔도 3.77:1로 미달이므로 `#3d5245`(세이지 위 5.35:1, 그라디언트 밝은 구간 5.60:1, 측정 완료) 같은 값으로 교체하고 라벨 크기도 14px 이상으로.

### 9. [HIGH] 티켓 프리셋 로즈 액센트 라벨·랭크 배지 4.02:1

- 위치: `apps/data-api/src/renderers/profileWidgets.ts:95` (색은 profileCardTicket.ts:60 ACCENT_ROSE)
- 규칙: R-25
- 사유: 공용 위젯의 `지금 재생 중`(17px), `자주 신청한 곡`(18px), 랭크 숫자(12px)가 티켓 카드에서 4.02:1로 4.5:1 미달. 같은 위젯을 다크 프로필이 쓸 때는 8.76:1이라 티켓 프리셋 한정 문제.
- 근거:

```ts
ctx.fillStyle = pal.accent;
ctx.font = '700 17px "Pretendard JP", "Twemoji Mozilla", sans-serif';
ctx.fillText('지금 재생 중', labelX + 26, cy + 41);
```

- 제안: `LIGHT_MUSIC_PAL.accent`를 카드 위 5.59:1인 `#8f544e`(측정 완료) 같은 값으로 교체하고 랭크 배지 배경색도 함께 재조정.

### 10. [MEDIUM] 렌더러 주석의 `── 라벨 ──` 박스 수미선 섹션 헤더 47건

- 위치: `apps/data-api/src/renderers/profileCardDark.ts:151`
- 규칙: antislop-code, 장식 구분선 (체크리스트: box-drawn headers)
- 사유: `── 배경 ──`처럼 반복 문자로 감싼 섹션 이름이 renderers 비테스트 파일에 47건(profileCardDark 15, profileCardTicket 14, nowPlayingCard 9, ohaasaCard 6, profileWidgets 2, memberGreetingCard 1) 있으며 장식이 메시지다.
- 근거:

```ts
// ── 배경 ──
ctx.fillStyle = PAL.page;
ctx.fillRect(0, 0, W, H);
```

- 제안: 장식 기호만 제거해 한 줄 평문으로 바꾸고, 제약·근거가 함께 적힌 주석은 문구를 유지.

### 11. [MEDIUM] 가사 정규식이 주석과 다른 파일에 다시 적혀 있음

- 위치: `apps/data-api/src/providers/lyrics.ts:15`
- 규칙: ai-slop-cleaner, 중복(정규화 로직 복붙)
- 사유: 7행의 `STRIP_PARENS`를 쓰겠다는 주석이 있는 파일 안에서 fetchLyrics가 같은 정규식 리터럴을 다시 쓰고, 소문자 변환까지 달라 `같은 규칙`이라는 설명과 어긋난다.
- 근거:

```ts
const STRIP_PARENS = /\(.*?\)|\[.*?\]/g;
// ...
const q = query.replace(/\(.*?\)|\[.*?\]/g, '').trim();
```

- 제안: `query.replace(STRIP_PARENS, '').trim()`으로 통일하고 소문자 적용 여부를 주석에 한 줄로 명시.

### 12. [MEDIUM] 주소 접미사 정규식이 weather와 weatherLocality에 이중 정의

- 위치: `apps/data-api/src/providers/weatherLocality.ts:340`
- 규칙: ai-slop-cleaner, 중복(정규화 로직 복붙)
- 사유: `/(특별시|광역시|특별자치시|특별자치도|시|군|구|도)$/` 리터럴이 weather.ts:81과 동일하게 중복되어 접미사 규칙이 바뀌면 두 곳을 같이 고쳐야 한다.
- 근거:

```ts
const noMetroSuffix = originalQuery.replace(/(특별시|광역시|특별자치시|특별자치도|시|군|구|도)$/, '');
const hit2 = KR_TO_EN_QUERY[stripNoise(noMetroSuffix)];
```

- 제안: 접미사 정규식을 weatherLocality 쪽에 상수로 두고 weather.ts가 import해 단일 소스화.

### 13. [MEDIUM] request/reply 허브 상관 로직 축이 3파일에서 반복

- 위치: `apps/data-api/src/services/guildDataHub.ts:53`
- 규칙: ai-slop-cleaner, 중복
- 사유: JSON 파싱 → 스키마 safeParse → 메타 비교 → 메타 정리 → 결과 resolve 흐름이 playerWebHub.ts:64, jtcSetupHub.ts:42에도 같은 뼈대로 복붙돼 있다(공용 풀·구독 라이프사이클은 이미 분리된 상태에서 상관 본체만 남아 반복).
- 근거:

```ts
export function correlateGuildDataResponse(
	raw: string,
	pending: PendingRequestPool<GuildDataResult>,
```

- 제안: 스키마·메타 비교기·결과 매핑만 인자로 받는 공용 correlate 헬퍼로 합치고 파일별 차이(에러를 timeout으로 매핑하는 규칙 등)는 콜백으로 남길 것.

### 14. [MEDIUM] providers fetch 타임아웃 관례가 제각각이고 chapters만 없음

- 위치: `apps/data-api/src/providers/chapters.ts:77`
- 규칙: ai-slop-cleaner, 중복(HTTP 클라이언트)
- 사유: weather/delivery는 AbortController 조합, embedFix/lyrics/lavalink/ohaasa/translate/images는 `AbortSignal.timeout`을 쓰는데 chapters의 두 fetch(search 77행, watch 109행)에는 타임아웃 신호가 없다.
- 근거:

```ts
const response = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
	method: 'POST',
```

- 제안: 공용 `fetchText/fetchJson`(타임아웃 인자 포함) 헬퍼를 utils에 두고 providers가 쓰게 한 뒤 chapters에도 적용.

### 15. [MEDIUM] 미사용 상수가 packages/utils의 동일 상수와 이중 정의

- 위치: `apps/data-api/src/providers/chapters.ts:13`
- 규칙: ai-slop-cleaner, 죽은 코드 + 중복
- 사유: `CHAPTER_FETCH_MIN_DURATION_MS`는 저장소 전체에서 정의만 존재하고 data-api 내부 소비처가 없으며, 값이 같은 상수가 `packages/utils/src/lavalinkTrack.ts:7`에도 있다.
- 근거:

```ts
/** 장문 영상에서만 챕터가 의미 있으므로 이 미만은 조회하지 않는다. */
export const CHAPTER_FETCH_MIN_DURATION_MS = 15 * 60 * 1000;
```

- 제안: data-api 정의를 지우고 `@sirubot/utils`의 상수를 import하거나, 쓰는 곳이 생길 때까지 export도 함께 제거.

### 16. [MEDIUM] 별밭 주석이 실제 동작과 반대

- 위치: `apps/data-api/src/renderers/ohaasaCard.ts:51`
- 규칙: antislop-code, 재서술(코드와 다른 설명)
- 사유: 주석은 시드 없이 매번 다르다고 적지만 실제로는 108행에서 별자리 코드로 시드를 고정해 같은 별자리 카드끼리는 별밭이 동일하다.
- 근거:

```ts
drawStarfield(ctx, W, H, Number(input.zodiacCode) * 7919);
```

- 제안: 주석을 `별자리별 시드 고정이라 같은 별자리 카드는 같은 별밭`(또는 시드를 requestId 기반으로 바꿔 카드별 개성을 살림)으로 정정.

### 17. [MEDIUM] 라벨과 무관한 제네릭 아이콘에 근거 없음

- 위치: `apps/data-api/src/renderers/ohaasaCard.ts:85`
- 규칙: R-04 (퍼포즈 게이트)
- 사유: `행운의 열쇠` 라벨에 별 아이콘을 쓰는 근거가 코드에 없고, sparkle/star는 R-04의 제네릭 목록에 든다(추천 뱃지 sparkle도 nowPlayingCard.ts:352에서 같은 문제).
- 근거:

```ts
if (key) boxes.push({ label: '행운의 열쇠', value: key, icon: 'star' });
```

- 제안: lucide `key` 경로를 아이콘 DB에 추가해 라벨과 일치시키거나, 아이콘을 쓰는 이유를 한 줄로 남길 것.

### 18. [MEDIUM] 프로필 카드 미사용 export와 팔레트 필드

- 위치: `apps/data-api/src/renderers/profileWidgets.ts:21`
- 규칙: ai-slop-cleaner, 죽은 코드/미사용 export
- 사유: `CardPalette` 14필드 중 page, chip, chipText, textFaint, online, separator 6필드를 드로잉 코드가 읽지 않고, `ZODIAC_THEMES`(ohaasaCard.ts:17)와 `CARRIER_ALIASES`(delivery.ts:26)도 외부 소비처가 없다.
- 근거:

```ts
export interface CardPalette {
	page: string;
	card: string;
```

- 제안: 미사용 필드와 export 키워드를 제거해 계약을 실제 사용 범위와 맞출 것.

### 19. [LOW] 운영자 로그 문자열에도 em dash

- 위치: `apps/data-api/src/renderers/canvas/fonts.ts:40`
- 규칙: R-02 (유저 대상이 아닌 로그라 우선순위 하향)
- 사유: `logger.warn` 문자열 4곳(fonts.ts:40·48, jtcSetupHub.ts:64, guildDataHub.ts:75, playerWebHub.ts:86)에 U+2014이 들어 있다.
- 근거 (원본의 U+2014는 `\u2014`로 표기):

```ts
logger.warn('PretendardJPVariable.ttf를 찾지 못했어요 \u2014 카드 텍스트가 시스템 폰트로 폴백해요.');
```

- 제안: 로그도 같은 규칙으로 쉼표/온점 교체(콘솔 가독성에도 이득).

### 20. [LOW] 카드 랭크 배지 숫자 12px로 최소 크기 기준 미달

- 위치: `apps/data-api/src/renderers/profileWidgets.ts:165`
- 규칙: 캔버스 글자 크기 기준(본문 14px 미만 금지)
- 사유: 카드에서 가장 작은 텍스트인데 12px이며 숫자라 한글 본문은 아니지만 동일 기준의 하한에 걸린다(같은 배지가 다크 프로필에서는 대비 9.59:1로 색은 통과).
- 근거:

```ts
ctx.font = '800 12px "Pretendard JP", "Twemoji Mozilla", sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
```

- 제안: 배지를 14px에 맞춰 키우거나 배지 크기(22px)를 함께 조정.

### 21. [LOW] 테스트 없는 모듈이 20개 이상

- 위치: `apps/data-api/src/providers/weather.ts`
- 규칙: ai-slop-cleaner, 테스트 누락(LOW)
- 사유: providers(weather·delivery·lyrics·chapters·lavalinkSearch·ohaasa·weatherLocality), services(memoryTidy·ohaasaScheduler·db), utils(hubSubscriber·metrics·parseClock), renderers(profileCardDark·profileCardTicket·profileWidgets·canvas/fonts)에 대응 테스트가 없다.
- 근거:

```ts
export async function fetchWeather(location: string, scope: WeatherScope = 'now'): Promise<WeatherResult> {
```

- 제안: 사용자 메시지와 캔버스 출력에 직접 영향을 주는 weather/delivery 프로바이더와 두 프로필 카드 스모크 테스트부터 우선 추가.

### 22. [LOW] 코드와 다른 주석이 두 곳

- 위치: `apps/data-api/src/renderers/nowPlayingCard.ts:410`
- 규칙: antislop-code, 재서술/미갱신
- 사유: 제목 주석(406행)은 줄 바꿈 없이 그린다고 적지만 실제로는 최대 2줄로 줄바꿈하며, canvasUtils.ts:9 표에는 shapes.ts에 없는 `색 보간`이 적혀 있다.
- 근거:

```ts
const titleLines = wrapText(ctx, input.title, textW, 2);
```

- 제안: 두 주석을 실제 동작(2줄 줄바꿈, 색 변환은 hexToRgba 재수출)에 맞게 수정.

### 23. [LOW] JSDoc이 위 상수를 문자열로 다시 씀

- 위치: `apps/data-api/src/renderers/memberGreetingCard.ts:311`
- 규칙: antislop-code, 시그니처/상수 재서술
- 사유: 바로 위 247~251행에 이름 붙은 상수(900_000, 1600, 0.82, 200)를 산문으로 반복해 값이 바뀌면 문서가 어긋난다(318~321행도 같은 패턴).
- 근거:

```ts
const IMAGE_MAX_BYTES = 900_000;
const IMAGE_STEP_PX = 200;
const BG_MAX_SIDE = 1600;
```

- 제안: JSDoc에서 숫자를 빼고 상수명을 가리키거나(예: `IMAGE_MAX_BYTES 상한, IMAGE_STEP_PX만큼 축소`), 한 곳만 유지.

### 24. [LOW] 같은 카드 안에서 브랜드명 fallback이 두 가지

- 위치: `apps/data-api/src/renderers/nowPlayingCard.ts:511`
- 규칙: R-16 (카피 일관성)
- 사유: brandLine이 없을 때 중간 라인은 `SiruBOT`, 하단 푸터는 `시루봇`으로 그려 같은 이미지에 두 이름이 함께 나온다(518행).
- 근거:

```ts
ctx.fillText('SiruBOT', tx, metaY);
// ...
ctx.fillText(input.brandLine ?? '시루봇', right, H - 22);
```

- 제안: fallback 값을 한 상수로 통일(운세 카드는 `SiruBOT`을 쓰므로 어느 쪽으로 맞출지 결정 필요).

### 25. [LOW] 별자리 맵이 봇과 이중 정의(기존 유지 판정 있음)

- 위치: `apps/data-api/src/providers/types.ts:4`
- 규칙: ai-slop-cleaner, 중복
- 사유: `apps/bot/src/modules/games/utils/ohaasaService.ts:2`와 같은 12항목 맵이 복제돼 있고 주석도 봇과 동일하다고 적어 두었다(docs/refactor-plan.md는 유지로 판정한 상태).
- 근거:

```ts
export const ZODIAC_MAP: Record<string, { jp: string; ko: string; en: string }> = {
	'01': { jp: 'おひつじ座', ko: '양자리', en: 'Aries' },
```

- 제안: 판정 유지라면 이중 정의 위치를 문서에 남기고, 판정을 바꿀 때는 `@sirubot/utils`로 옮겨 봇·data-api 모두 import하게 할 것.

### 26. [LOW] 메모리 정리가 번역 인터페이스가 아닌 구현체 타입에 결합

- 위치: `apps/data-api/src/services/memoryTidy.ts:14`
- 규칙: ai-slop-cleaner, 잘못된 레이어/불필요 결합
- 사유: 같은 패키지에 `TranslationProvider` 인터페이스가 있는데도 `chatCompletion`이 인터페이스에 없어 구현체 클래스 타입을 직접 받아 의존이 굳는다.
- 근거:

```ts
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
```

- 제안: `chatCompletion`을 공용 인터페이스(또는 별도 LLM 클라이언트 인터페이스)로 올리고 서비스는 인터페이스만 받게.

### 27. [LOW] ohaasa 갱신 완료 처리 4줄 블록 3회 반복

- 위치: `apps/data-api/src/services/ohaasaScheduler.ts:41`
- 규칙: ai-slop-cleaner, 중복(경미)
- 사유: `lastGood/lastRefreshAt/lastSource` 대입과 `sharedCache.set` 4줄 조합이 41, 54, 62행에 거의 같은 형태로 반복된다.
- 근거:

```ts
lastGood = raw;
lastRefreshAt = Date.now();
lastSource = 'raw';
```

- 제안: `commit(daily, source)` 헬퍼를 함수 상단에 두고 세 경로가 공유하게.

---

## 검사했지만 문제 없는 항목

- R-02 (카드에 그리는 문자열): `NOW PLAYING`, `LIVE`, `일시정지`, `봇 추천`, `다음 곡`, `오늘의 운세`, `SiruBOT` 등 렌더러 출력 문자열에 em dash 없음. 유저 대상 에러 문구(weather 6종, delivery 8종)도 em dash·비속어·과장 표현 없음.
- 챗봇 클로저: 범위 내 유저 메시지에 `도움이 되셨나요`, `말씀해 주세요` 같은 클로저 없음. 지시형(`잠시 후 다시 시도해 주세요`, `다른 이름으로 다시 시도해 주세요`)만 사용.
- R-16/R-36: 버즈워드(혁신적·심리스·최고급 등), 근거 없는 성능·보안 주장 없음.
- R-17/R-38: 카드에 찍히는 수치(대기열 곡 수, 볼륨, 소요 시간, 순위, 가입·합류 날짜, 트랙 목록)는 전부 입력 데이터 출처이며 하드코딩된 통계·집계·가상 이름 없음. 브랜드명도 실제 제품명.
- R-18: 후기·평점·사용자 명단 섹션 없음.
- R-25 통과 조합 (contrast-check.py): 다크 프로필 본문 #b6aec4 on #221a30 = 7.82:1, 칩 #cabdf2 on #2a2136 = 8.82:1, 푸터 흐린 텍스트 5.64:1, nowPlaying 하단 메타 합성색 6.02~6.22:1, 운세 카드 라벨 #c9a8b5 on #1a0e12 = 8.74:1, 다크 프로필 랭크 배지 9.59:1, 온라인 캡슐 10.63:1, 다크 프로필 헤더 핸들(27px 큰 글씨) 3.56~7.50:1.
- R-03/R-24/R-26/R-32/R-34: 캔버스 정적 이미지라 반응형 레이아웃·내비게이션·키보드 조작·포커스 아웃라인·테마 토글 비대상. 클릭 가능한 요소 없음.
- R-27: 정적 이미지지만 상태 대체는 존재(아트워크 없을 때 바이닐 폴백, 아바타 실패 시 음표 플레이스홀더, 럭키 정보 부재 시 `오늘의 럭키 정보가 없어요`).
- R-04 통과분: 캘린더·유저·리스트·볼륨·반복·트로피·디스크 등 라벨과 의미가 일치하는 lucide 아이콘은 근거 충분. 다크 프로필의 sparkle은 파일 머리글에 RINE 로고 모티프로 목적이 적혀 있다.
- R-01/R-29 팔레트: 프리셋별 팔레트는 `RINE 샘플 기준`, `크림/세이지 팔레트` 등 출처가 주석에 있고 카드당 강조색은 1개(도미넌트 컬러 또는 프리셋)라 다색 남용 없음. 하드코딩 값 자체는 있으나 디자인 토큰 공유 여부는 별도 결정 사항.
- 그 밖의 주석 슬롭: 모호 TODO/FIXME 0건, 장식 이모지 0건, end marker 0건, 단계 번호 내레이션(Step 1/2) 0건, 빈 라벨(`// Main logic`) 0건. 서명 검증(SEC-006), 타임아웃 매핑, 회로 브레이커 오염 방지, 폰트·UA 제약처럼 보안·프로토콜·엣지케이스 주석은 보존 대상으로 분류했다.
- 죽은 코드: `decodeDataUri`, `drawPresetBackground`, `inflightCount`, `recentPlaybackEvents`, `isAllowedImageUrl` 등 export는 라우트·테스트에서 소비처를 확인했다. `positionMs`, `trackUrl` 미사용은 스키마 호환용 주석이 있는 의도적 유지다.
