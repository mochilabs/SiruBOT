# 명령어 구조 정리 (command reorg) — 2026-10-05

> **구현 상태: 완료** (데몬 재시작으로 중단된 작업을 이어받아 마무리함)
> - `/music`(서브커맨드 15종), `/info`(서브커맨드 3종) 신규
> - audio 18개 flat 명령어 → subcommands/ 로 이관 후 삭제, general 4개 → `/info`로 통합 후 삭제
> - `/settings` audio → general 모듈 이동, 개발 3개 영어 primary 통일, `/purge` 설명 한글화
> - games 모듈은 미이관 (제안만 유지 — 다른 에이전트 작업 중)
> - 커밋: `refactor(bot): slash command taxonomy reorganization` (feat/yolo-improvements)

## 0. 최종 명령어 목록 (변경 후: 28개)

## 1. 전수 조사 (변경 전: 47개)

| 모듈 | 개수 | 명령어 |
|---|---|---|
| audio | 24 | favorites, filter, history, lyrics, mixer, move, nowplaying, pause, play, playlist, previous, queue, recommend, related, remove, repeat, search, seek, settings, shuffle, skip, stop, tts, volume |
| games | 6 | checkin(출석·신규), dice, fortune, guess, ohaasa, rps |
| general | 13 | avatar, botinfo, chat, chat-settings, delivery, help, invite, ping, profile, purge, serverinfo, userinfo, weather |
| development | 4 | eval, 노드, 리로드, 샤드 |

이미 서브커맨드 구조였던 것: queue(목록/셔플/비우기/제거/이동), playlist, favorites, mixer(상태/갭리스/크로스페이드), profile, weather, chat-settings

## 2. 발견된 문제점

1. **중복 명령어**: `/shuffle`·`/remove`·`/move`가 `/대기열 셔플`·`/대기열 제거`·`/대기열 이동`과 완전히 같은 기능 — 둘 다 노출됨
2. **음악 24개가 전부 flat**: `/재생 /일시정지 /건너뛰기 ...` 1뎁스 나열이 중구난방의 주범
3. **네이밍 불일치**: 개발 명령어만 한국어 primary name (노드/리로드/샤드), 나머지는 영어 primary + ko 로컬라이즈
4. **유사명 혼동**: `/recommend`(추천, 추천곡 추가) vs `/related`(추천곡, 자동재생 토글)
5. **헷갈리는 ko명**: `/seek`→탐색(검색이랑 혼동), `/history`→기록(모호)
6. **사망 선고된 명령어**: `/userinfo` 설명문에 "(곧 /프로필 보기로 이동해요)" — 이미 deprecated
7. **카테고리 누락**: avatar/botinfo/invite/ping/serverinfo/userinfo + 개발 4개에 `fullCategory` 없음 → /도움말 분류가 암묵적 fallback에 의존
8. **모듈 오배치**: `/settings`(서버 설정, ManageGuild)가 audio 모듈에 있었음
9. **영어 설명 잔재**: tts, purge의 기본 description이 영어

## 3. 목표 택소노미 (변경 후: 27개)

```
/music (음악) — 재생 제어 15종
  ├ 재생 / 일시정지 / 건너뛰기 / 정지 / 이전곡 / 시간이동 / 볼륨 / 반복
  ├ 필터 / 검색 / 가사 / 추천 / 자동재생 / 음성 / 재생기록
/queue (대기열) — 목록/셔플/비우기/제거/이동 (기존 유지)
/playlist (플레이리스트) — 기존 유지
/favorites (즐겨찾기) — 기존 유지
/mixer (믹서) — 상태/갭리스/크로스페이드 (기존 유지, 플러그인 설정이라 독립)
/nowplaying (현재곡) — 유지 (별도 작업 중, 손대지 않음)
/settings (설정) — general 모듈로 이동, 이름 유지
/info (정보) — 봇/서버/아바타
/chat (채팅), /chat-settings (채팅설정) — AI, 유지
/help (도움말) — 서브커맨드 멘션 표시 추가
/ping (핑), /invite (초대), /delivery (택배), /weather (날씨), /purge (청소) — 유지
/profile (프로필) — 유지 (별도 작업 중, 손대지 않음)
/game (게임) — ★ 제안만 (games 모듈은 이번에 손대지 않음)
  └ 주사위/운세/숫자맞히기/오하아사/가위바위보/출석
개발: /eval, /nodes, /reload, /shards (영어 primary로 통일)
```

Discord 제약상 서브커맨드 그룹은 1단계까지라 `/music mixer` 같은 중첩은 피했음 (mixer는 독립 유지).

## 4. 구현 방식

- 각 서브커맨드는 `modules/<audio|general>/subcommands/*.ts` 모듈로 분리 (`build` + `run` + `preconditions` export)
  - `commands/` 디렉토리는 Sapphire 스토어가 통째로 로드하므로, Command 클래스가 아닌 파일은 `subcommands/`에 둠 (오로딩 방지)
- `/music`, `/info`는 기존 코드베이스 패턴(수동 `getSubcommand()` switch, queue.ts와 동일)으로 디스패치
- **precondition은 서브커맨드별로 게이트 실행** (`container.stores.get('preconditions')`에서 찾아 `chatInputRun` 직접 호출)
  - 합쳐서 union으로 걸면 `/음악 가사` 같은 가벼운 명령어까지 음성채널 접속을 요구하게 되므로, 기존 명령어별 precondition 목록을 그대로 유지
  - 거부 시 기존과 동일하게 `UserError` → ephemeral 응답
- 자동완성(play/search/skip)은 `/music`의 `autocompleteRun`에서 서브커맨드로 라우팅
- `/도움말`은 그룹 명령어 아래 서브커맨드를 클릭 멘션(`</music play:ID>`)으로 나열

## 5. Breaking change 매핑표

| 변경 전 | 변경 후 | 비고 |
|---|---|---|
| /play (재생) | /music 재생 | |
| /pause (일시정지) | /music 일시정지 | |
| /skip (건너뛰기) | /music 건너뛰기 | |
| /stop (정지) | /music 정지 | |
| /previous (이전곡) | /music 이전곡 | |
| /seek (탐색) | /music 시간이동 | ko명 변경 (탐색→시간이동) |
| /volume (볼륨) | /music 볼륨 | |
| /repeat (반복) | /music 반복 | |
| /filter (필터) | /music 필터 | |
| /search (검색) | /music 검색 | |
| /lyrics (가사) | /music 가사 | |
| /recommend (추천) | /music 추천 | |
| /related (추천곡) | /music 자동재생 | en/ko 둘 다 개명 (recommend와 혼동) |
| /tts (음성) | /music 음성 | 기본 description 한글로 통일 |
| /history (기록) | /music 재생기록 | ko명 변경 (기록→재생기록) |
| /shuffle (셔플) | 삭제 → /대기열 셔플 사용 | 중복 제거 |
| /remove (삭제) | 삭제 → /대기열 제거 사용 | 중복 제거 |
| /move (이동) | 삭제 → /대기열 이동 사용 | 중복 제거 |
| /avatar (아바타) | /info 아바타 | |
| /botinfo (봇정보) | /info 봇 | en명 변경 (botinfo→bot) |
| /serverinfo (서버정보) | /info 서버 | en명 변경 (serverinfo→server) |
| /userinfo (유저정보) | 삭제 | deprecated (→ /프로필 보기) |
| /노드 | /nodes | en primary로 통일 (ko 로컬라이즈: 노드) |
| /리로드 | /reload | en primary로 통일 (ko 로컬라이즈: 리로드) |
| /샤드 | /shards | en primary로 통일 (ko 로컬라이즈: 샤드) |
| /settings (audio 모듈) | /settings (general 모듈) | 이름 유지, 카테고리 음악→일반 |

### games 모듈 이관 제안 (미구현 — 다른 에이전트 작업 중)

/dice → /game 주사위, /fortune → /game 운세, /guess → /game 숫자맞히기,
/ohaasa → /game 오하아사, /rps → /game 가위바위보, /checkin → /game 출석

## 6. 주의사항

- `apps/bot/src/services/audioService.ts`의 `SkipContext` import 경로 변경 (`commands/skip.ts` → `subcommands/skip.ts`) — 반영됨
- 추천곡 예열 버그 수정 중인 에이전트가 `recommend.ts` 구버전을 보고 있을 수 있음 → 새 위치 `subcommands/recommend.ts`로 안내 필요
- Discord 명령어 재등록 필요 (`REGISTER_COMMANDS=true` 또는 `scripts/register-commands.ts`)
- `/purge`의 기본 description/옵션 설명을 한글 primary + en-US 로컬라이즈로 통일 (기존 영어 잔재 수정)
- 기존 `/셔플`·`/삭제`·`/이동` 사용자는 `/대기열 셔플`·`/대기열 제거`·`/대기열 이동`으로 안내 필요 (기능 중복 제거)
- `/관련`→`/음악 자동재생` 개명 시 기존 자동재생 설정값(guild DB `related` 필드)은 그대로 유지 — 명령어 이름만 바뀜

## 7. 최종 명령어 목록 (변경 후: 28개)

| 명령어 | ko | 서브커맨드 |
|---|---|---|
| /music | /음악 | 재생·일시정지·건너뛰기·정지·이전곡·시간이동·볼륨·반복·필터·검색·가사·추천·자동재생·음성·재생기록 (15) |
| /queue | /대기열 | 기존 유지 (목록/셔플/비우기/제거/이동) |
| /playlist | /플레이리스트 | 기존 유지 |
| /favorites | /즐겨찾기 | 기존 유지 |
| /mixer | /믹서 | 기존 유지 (상태/갭리스/크로스페이드) |
| /nowplaying | — | 기존 유지 (별도 작업 중이라 손대지 않음) |
| /info | /정보 | 봇·서버·아바타 (3) |
| /settings | /설정 | general 모듈로 이동 (이름 유지) |
| /profile | /프로필 | 기존 유지 (별도 작업 중이라 손대지 않음) |
| /chat | /채팅 | 기존 유지 |
| /chat-settings | /채팅설정 | 기존 유지 |
| /help | /도움말 | 서브커맨드 클릭 멘션 표시 추가 |
| /ping | /핑 | 기존 유지 |
| /invite | /초대 | 기존 유지 |
| /delivery | /택배 | 기존 유지 |
| /weather | /날씨 | 기존 유지 |
| /purge | /청소 | 기존 유지 (설명 한글화) |
| /eval | — | 기존 유지 (fullCategory 추가) |
| /nodes | /노드 | 개명 (기존 /노드, OwnerOnly) |
| /reload | /리로드 | 개명 (기존 /리로드, OwnerOnly) |
| /shards | /샤드 | 개명 (기존 /샤드, OwnerOnly) |
| games 6종 | — | 미이관 (제안만 유지) |
