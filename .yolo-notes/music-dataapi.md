# Music Controller UX + data-api 활용 분석

분석 기준: `feat/yolo-improvements` 브랜치 (2026-10-05). 코드 수정 없음, 분석만.

---

## 1. Music Controller — 코드 위치

| 역할 | 파일 |
|---|---|
| 컨트롤러 UI 렌더 | `apps/bot/src/modules/audio/view/controller.ts` (`controllerView()`) |
| 버튼/셀렉트 핸들러 | `apps/bot/src/modules/audio/interaction-handlers/controllerButton.ts`, `controllerSelectMenu.ts` |
| 전송·갱신·삭제 생명주기 | `apps/bot/src/modules/audio/lavalink/player/playerNotifier.ts` |
| `/현재곡` 정적 뷰 | `apps/bot/src/modules/audio/view/nowplaying.ts` |
| 대기열 목록 (ephemeral) | `apps/bot/src/modules/audio/view/queue.ts` |

### 현재 UX 흐름

1. 트랙 시작 → `playerNotifier.onTrackStart()` → **기존 컨트롤러 메시지 삭제 후 새 메시지 전송**
   (단, 고정 채널이면 같은 메시지 edit 유지 / 이미 마지막 메시지여도 edit만)
2. 버튼 1행: `⏮️ ⏸️/▶️ ⏭️ 🔁/🔂/➡️ 📄대기열` (5개, Discord 한도 꽉 참)
3. 곡 정보: 썸네일 + 제목/아티스트/신청자 + `(mm:ss / mm:ss)` 텍스트 + 챕터(있으면)
4. 푸터: 재생 서버 · 볼륨 · 봇 버전
5. 위치 갱신: Lavalink `playerUpdate` 이벤트 → 300ms debounce 후 메시지 edit
6. 대기열 버튼 → ephemeral 메시지로 10곡/페이지 목록 + 페이지네이션

---

## 2. Music Controller UX 개선점

### U1. 프로그레스바가 없고 위치 표시가 실시간이 아님 (높음)
- `buildTrackDisplay()` 주석에 명시: "프로그레스바는 제거하고 (지금시간 / 길이) 짧은 줄만 남긴다"
- 위치 텍스트는 Lavalink `playerUpdate` 수신 때만 갱신 → 이벤트 사이엔 멈춰 보임
- 관련: OpenCode 세션 "Nowplaying 플레이어 position 표시 수정"이 이 문제를 다루던 중
- 개선안: (a) 텍스트 프로그레스바 부활 (`━━━●───`), (b) 5~10초 tick으로 edit (rate limit 주의, 고정 채널만)

### U2. 정지 버튼이 없음 — 핸들러는 있는데 버튼이 없음 (높음)
- `controllerButton.ts`에 `case 'stop'` 존재하지만, `controllerView()`에 정지 버튼이 없음 → 데드 경로
- 컨트롤러에서 재생 완전 종료 불가, `/정지` 명령어만 가능
- 개선안: 버튼 5개 한도가 찼으므로, `📄대기열`을 세컨더리 행으로 옮기거나 ⏹️ 추가 재배치

### U3. 볼륨을 컨트롤러에서 조절 못 함 (중간)
- 푸터에 `🔊 볼륨: N%` 텍스트 표시만, 조절은 `/볼륨` 명령어 필요
- 개선안: 볼륨 버튼 → 누르면 ±10% 단계 버튼이 ephemeral로 뜨거나, 셀렉트 메뉴

### U4. `case 'time'` 데드 코드 (낮음, 코드 정리)
- 099d70e에서 시간 버튼(`controller:time`)이 있었다가 이후 제거됨 — 핸들러의 `case 'time'`은 영원히 호출 안 됨
- 정리 대상

### U5. `controllerSelectMenu` 핸들러 전체가 데드 코드 (높음)
- `controller:queue:select` 셀렉트 메뉴를 **생성하는 코드가 repo 어디에도 없음** (view/핸들러 전수 grep 확인)
- 즉, 대기열에서 곡을 골라 삭제/점프하는 UI가 소실된 상태. 현재 개별 곡 삭제·점프는 `/제거` `/이동` 명령어로만 가능
- `controllerButton.ts`의 `handleQueueRemove`/`handleQueueJumpTo`도 `player.queueSelectedIndex`에 의존 → 셀렉트 메뉴 없이는 사실상 페이지 첫 곡만 대상
- 개선안: 대기열 목록(ephemeral)에 곡별 셀렉트 메뉴 부활, 또는 번호 버튼 행 추가

### U6. 트랙마다 컨트롤러 삭제→재전송 churn (중간)
- 일반 채널: 매 곡마다 이전 컨트롤러 삭제 + 새 메시지 전송 → 채팅이 계속 밀리고 깜빡임
- 고정 채널 핀 모드는 edit 유지로 해결됨 → 일반 채널도 "마지막 메시지가 아니면 삭제 후 전송" 대신, 최근 N분 이내 메시지 재사용 등 완화 여지
- `sendChains`로 레이스는 막혀 있음 (잘 된 점)

### U7. 대기열 목록이 ephemeral (나만 보기) (중간)
- `📄대기열` 클릭 시 본인에게만 보이는 목록 → 같이 듣는 사람과 공유 불가
- 개선안: 길드 설정으로 공개/비공개 토글, 또는 "채널에 공유" 버튼 추가

### U8. 아트워크 없으면 밋밋 (낮음)
- `artworkUrl` 없으면 썸네일 없이 텍스트만. YouTube 외 소스(TTS, 로컬 등)에서 발생
- 개선안: 기본 아트워크 폴백 이미지

### 잘 된 점
- 반복 버튼 상태 아이콘 변경 (`➡️`→`🔁`→`🔂`), customId에 다음 상태 인코딩
- 대기열 남은 시간 계산에서 선예열 추천곡 제외 (`getUserQueuedTracks`)
- DJ/혼자 체크, 채널 불일치 체크 등 권한 UX는 탄탄
- `safeUpdate()`의 만료 컨트롤러 폴백 안내

---

## 3. data-api — 현재 엔드포인트/기능 전부

`apps/data-api` (Fastify, skia-canvas 이미지 렌더, Redis 캐시 + 서킷브레이커 + in-flight dedup)

| 엔드포인트 | 기능 | 캐시 |
|---|---|---|
| `GET /api/health` | 헬스체크 | - |
| `GET /dashboard` | 자체 모니터링 대시보드(HTML) | - |
| `GET /v1/status` | 상태·메트릭·브레이커·캐시 통계 | - |
| `GET /v1/ohaasa` / `POST /v1/ohaasa/refresh` | 오늘의 운세 (번역본 캐시, 스케줄러) | 7일 |
| `GET /v1/lyrics?q=` | 가사 (lrclib) | 30일 |
| `GET /v1/weather?location=&scope=` | 날씨 (open-meteo) | 15분 |
| `POST /v1/playback/events` / `GET /v1/playback/recent` | 재생 이벤트 수집·조회 (인메모리) | - |
| `GET /v1/delivery/carriers` / `/v1/delivery/track` | 택배 조회 | 24시간/5분 |
| `POST /v1/image/profile` | **프로필 카드 PNG** (skia-canvas, 한글 폰트 내장) | dedup |
| `GET /v1/chapters?videoId=&durationMs=` | 유튜브 챕터 | 12시간 |

이미지 렌더 인프라: `src/renderers/profileCard.ts` (skia-canvas), Dockerfile에 한글 폰트 포함 + 로드 실패 로깅, `deduped()`로 동시 렌더 합치기.

### bot에서 data-api를 호출하는 곳 전부

| 호출처 | 함수 | 엔드포인트 |
|---|---|---|
| `audio/commands/lyrics.ts` | `searchLyrics()` | `GET /v1/lyrics` |
| `audio/lavalink/youtubeChapters.ts` | `fetchYouTubeChapters()` | `GET /v1/chapters` |
| `audio/lavalink/handlers/trackHandler.ts` | `playbackReporter` (fire-and-forget) | `POST /v1/playback/events` |
| `games/commands/ohaasa.ts` | `fetchOhaasaKo()` | `GET /v1/ohaasa` |
| `general/commands/delivery.ts` | `trackDelivery()` | `GET /v1/delivery/track` |
| `general/commands/profile.ts` | `renderProfileCard()` | `POST /v1/image/profile` |
| `general/commands/weather.ts` | `fetchWeather()` | `GET /v1/weather` |
| `services/aiTools/{music,ohaasa,weather,delivery}.ts` | AI 챗 도구에서 위 함수들 재사용 | 상동 |
| `general/listeners/clientReady.ts` | `DATA_API_URL` 설정 여부 체크 (경고만) | - |

공통 클라이언트: `apps/bot/src/services/dataApiClient.ts` (`gatewayGet`, 10초 타임아웃, `GatewayDomainError` 변환). 프로필 카드는 실패 시 텍스트 카드로 폴백.

---

## 4. data-api 활용 확대 제안

전제: 이미지 렌더 파이프라인(skia-canvas + 폰트 + dedup)이 이미 검증됨. 새 카드는 `renderers/`에 추가 + `POST /v1/image/*` 라우트 + bot 클라이언트 함수 3점 세트면 됨.

### P1. NowPlaying 카드 이미지 ★★★★★ (강력 추천)
- 내용: 아트워크 + 제목/아티스트 + 프로그레스바 + `대기열 N곡` + 신청자
- 근거: U1(프로그레스바 부재)의 정면 해결책. 이미지는 렌더 시점 고정이라 tick 불필요
- 실현: profileCard 패턴 그대로 재사용. 트랙 시작 시 1회 렌더 → Redis/메모리 캐시(`img:nowplaying:{trackId}`)
- 주의: 매 트랙마다 렌더 latency — dedup + 캐시로 커버

### P2. 오늘의 운세 카드 이미지 ★★★★☆
- 내용: 별자리 테마(프로필 카드에 이미 12별자리 팔레트 있음) + 운세 텍스트 + 럭키 아이템
- 근거: 운세 데이터가 이미 data-api에 있고(`ohaasaScheduler`), 이미지화 시 공유 가치 큼
- 실현: 높음. 텍스트 카드와 병행 제공(폴백 유지)

### P3. 주사위/가위바위보 결과 카드 ★★★☆☆
- 내용: 주사위 눈금 크게, 승패 결과
- 근거: 게임은 ephemeral·저스테이크 — 이미지 오버헤드 대비 delight는 있음
- 실현: 중간. dice부터 선택 적용 권장. rps는 버튼 게임이라 굳이...

### P4. 서버 정보 카드 ★★★☆☆
- 내용: `/serverinfo`의 멤버 수·부스트·생성일 등을 카드로
- 실현: 중간. 데이터 수집은 bot에서, 렌더만 data-api

### 제외 (비추천)
- **도움말 이미지**: 텍스트 내비게이션이 압도적으로 유리. 이미지화하면 오히려 UX 하락
- **가사 카드 이미지**: 가사 전문 이미지화는 저작권 리스크. 현행 텍스트 유지
- **랭킹/리더보드 카드**: 현재 랭킹 기능 자체가 없음(전수 grep 확인). 기능 신설이 선행되어야 함
- **대기열 목록 이미지**: 텍스트가 선택·복사에 유리하고 페이지네이션과 궁합이 나쁨

---

## 5. 다음 액션 제안 (우선순위 순)

1. U5 셀렉트 메뉴 부활 또는 데드 핸들러 정리 (둘 중 하나는 필수 — 현재 반쯤 깨진 상태)
2. P1 NowPlaying 카드 이미지 (`POST /v1/image/nowplaying`)
3. U2 정지 버튼 재배치 (버튼 5개 한도 고려)
4. U1 프로그레스바 (이미지 카드와 함께 해결 or 텍스트 바)
5. P2 운세 카드 이미지
