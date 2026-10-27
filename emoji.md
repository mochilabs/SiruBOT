# 봇 화면의 유니코드(일반) 이모지 사용 지도

봇 화면은 기본적으로 **앱 이모지(`<:name:id>`)**를 쓰고, 앱 이모지 매핑이 로드되지 않았을 때만 **유니코드 폴백**으로 렌더돼요(`@sirubot/utils` `emoji()` — `packages/utils/src/appEmoji.ts`).

- 기준: 2026-10-27 (재조사 후). 라인 번호는 이후 이동할 수 있어요.
- 뷰 = `apps/bot/src/modules/<audio|general|games>/view/` + 뷰 성격의 `utils/*View.ts` + 뷰가 의존하는 `packages/utils` 포매터.
- 테스트 파일(`*.test.ts`)의 이모지는 코드가 아니라 기대값이라 제외했어요.
- **2026-10-27 치환 완료**: 기존 자산으로 매핑 가능했던 리터럴을 `emoji()`로 전환. 아래 §5에 결과를 정리.

---

## 1. 뷰 파일에 남은 하드코딩 유니코드 (자산 없음 — 교체 불가)

### `modules/general/view/ticket.ts` — 티켓 뷰

| 위치 | 이모지 | 용도 | 사유 |
| --- | --- | --- | --- |
| L27, L48 | 🎫 | 티켓 패널/카드 제목 | 티켓 자산 없음 |
| L31 | 📩 | 티켓 생성 버튼 `.setEmoji('📩')` | 자산 없음 |
| L66 | 🙋 | 담당하기/취소 버튼 `.setEmoji('🙋')` | 자산 없음 |

> L57·L80의 🔒는 `emoji('lock')`으로 치환 완료.

### `modules/general/utils/ttsView.ts` / `chatView.ts`

| 위치 | 이모지 | 용도 | 사유 |
| --- | --- | --- | --- |
| `ttsView.ts` L104 | 🟢 ⚪ | 낭독 상태 토글 | 상태 배지 관례 |
| `chatView.ts` L7 | ▍ | 타이핑 커서 | 그림 문자 |

---

## 2. 뷰 폴백 필드 (앱 이모지 미등록 시만 유니코드)

| 파일 | 위치 | 유니코드 폴백 | 대상 앱 이모지 |
| --- | --- | --- | --- |
| `modules/audio/view/filter.ts` | L22–26 | 🔊 🌙 🌊 🎧 🎤 | `volume_up` `sleep` `wave` `headphone` `mic` |
| `modules/audio/view/settings.ts` | L33–42 | 💰 📢 💬 🎬 🔚 👀 🎵 ⏭️ | `money` `megaphone` `speech` `film` `end_flag` `eye` `music_note` `arrow_forward` |

### `packages/utils` 공유 폴백

| 함수/표 | 파일 | 유니코드 폴백 | 뷰 사용처 |
| --- | --- | --- | --- |
| `APP_EMOJI_FALLBACKS` | `utils/src/appEmoji.ts` L29–120 | 90키 (⏮️⏭️⏸️▶️⏹️🔁🔂🎵🎶📄🔇🔉🔊 …) | 모든 `emoji('name')` 호출부 |
| 미등록 이름 | 〃 L129 | ❓ | |
| `emojiProgressBar` | `utils/src/format.ts` L20–22 | □ ◐ ■ | `controller.ts` 진행바, `volume.ts` |
| `volumeToEmoji` | 〃 L89–97 | 🔇 🔉 🔊 | `controller.ts` 푸터, `volume.ts` |
| `getRequesterText` | 〃 L61 | ✨ | 신청자 표시 |

---

## 3. 뷰 밖에서 남은 하드코딩 유니코드 (교체 불가/의도)

| 파일 | 위치 | 이모지 | 용도 | 사유 |
| --- | --- | --- | --- | --- |
| `audio/lavalink/handlers/queueAdvancer.ts` | L128 | 🚫 | 연속 오류 중단 알림 | 자산 없음 (`error`와 의미 충돌) |
| `services/tempVoiceService.ts` | L18 | 🔊 | 마커 채널 이름 | **채널명은 커스텀 이모지 렌더 불가** |
| `games/commands/guess.ts` | L109 | 🤯 | 한 번에 정답 강조 | 자산 없음 |
| `games/commands/rps.ts` | L15–17 | ✌️ ✊ 🖐 | 선택 버튼 라벨 | 🖐 자산 없음(✊은 `fist` 가능) |
| `games/interaction-handlers/games.ts` | L8 | ✌️ ✊ 🖐 | 결과 아이콘 | 〃 |
| 〃 | L31–32 | 😭 🫠 | 패배 문구/아이콘 | 자산 없음 (코드 주석에 의도 명시) |
| `general/commands/ping.ts` | L13–16, 65·73·75·90·93·98 | ⚪ 🟢 🟡 🔴 | 지연·연결 상태 | 상태 배지 관례 |
| 〃 | L50 | 📡 | 핑 화면 제목 | 자산 없음 |
| 〃 | L52 | ⚡ | 명령어 처리 지표 | `flash`로 가능(미적용 — 배지 계열 통일성) |
| `general/commands/development/nodes.ts` | L45 | 🟢 🔴 | 노드 상태 | 상태 배지 |
| `general/commands/development/shards.ts` | L38 | 🟢 🔴 🟡 | 샤드 상태 | 상태 배지 |
| `general/subcommands/server.ts` | L50 | ▓ ░ | 부스트 진행바 | 그림 문자 |
| `general/commands/help.ts` | L14, L103, L119 | ▍ └ | 커서·하위 명령 트리 | 그림 문자 |
| `general/listeners/clientReady.ts` | L124 | 🛠️ 🚀 | **콘솔 배너** | 사용자 화면 아님 |
| `services/ticketService.ts` | L256 | 🙋 | 담당자 지정 안내 | 자산 없음 (`user`로 의미 왜곡) |
| 〃 | L257 | 🔄 | 담당 해제 안내 | 자산 없음 (`repeat`로 의미 왜곡) |
| 〃 | L306 | 🚪 | 티켓 제외 안내 | 자산 없음 (`arrow_forward`로 의미 왜곡) |

---

## 4. 유니코드 유지가 의도된 곳

- **가위바위보 패배 계열(😭 🫠)** — `games.ts` L30 주석: `emoji-ids.json`에 패배 계열 자산이 없어 유지. 승(`party`/`smile`)·무(`cd`/`fist_bump`)는 앱 이모지.
- **상태 점(🟢 🟡 🔴 ⚪)** — `ping`/`nodes`/`shards`/`ttsView`의 연결·토글 표기. 배지 관례.
- **가위바위보 손 모양(✌️✊🖐)** — 게임 상징.
- **텍스트 그림 문자(▓ ░ ▍ □ ◐ ■ └)** — 이모지가 아닌 진행바/커서/트리 문자.
- **마커 채널명(🔊 임시방 만들기)** — 디스코드 채널명은 커스텀 이모지를 렌더하지 않아요.

---

## 5. 2026-10-27 치환 결과 (기존 자산 사용, 폴백 동일)

| 파일 | 치환 내용 |
| --- | --- |
| `modules/general/view/ticket.ts` | 🔒 ×2 → `emoji('lock')` |
| `modules/audio/view/settings.ts` | `◀ 뒤로가기` 라벨 ×5 → `${emoji('arrow_back')} 뒤로가기` |
| `modules/general/commands/ticket.ts` | ❌ ×7 → `emoji('error')`, ✅ ×4 → `emoji('success')` |
| `modules/general/interaction-handlers/ticketButton.ts` | ❌ ×3 → `emoji('error')`, ✅ ×4 → `emoji('success')` |
| `services/ticketService.ts` | 🔒→`lock`, 📋→`clipboard`, 🙋→`user`, 🔄→`repeat`, 👋→`wave`, 🚪→`arrow_forward` |
| `modules/audio/managers/voteSkip.ts` | ❌ ×2 → `emoji('error')` |
| `modules/audio/lavalink/player/playerNotifier.ts` | 🎵 → `emoji('music_note')` |
| `modules/audio/lavalink/handlers/queueAdvancer.ts` | ❌ → `error`, 📭 → `inbox_tray` |
| `modules/audio/lavalink/handlers/sponsorBlockHandler.ts` | ⏩ → `emoji('arrow_forward')` |
| `services/audioService.ts` | 🎧→`headphone`, 🔒→`lock`, 🔇→`volume_muted`, 🛠️→`tools` ×3, 🔎→`magnet` |
| `services/skipPolicy.ts` | 🔍→`magnet`, ⚠️→`warning`, ❌→`error`, 🎵→`music_note` |
| `services/tempVoiceService.ts` | ❌ → `emoji('error')` |

폴백 차이: `◀`→⏮️, `⏩`→⏭️, `📭`→📥, `🔍`→🔎 (앱 이모지 미로드 시).

### 검증

- `yarn typecheck` — 14/14 성공
- Prettier(`apps/bot/src/**/*.ts`) — 전체 통과
- `yarn turbo run test --filter=@sirubot/bot` — 545 테스트 중 540 통과, **5 실패는 `chatTts`의 별건 미커밋 변경**(emoji 치환과 무관, 해당 diff에 emoji 변경 0건)
- `trackHandler.test.ts`의 📭 기대값 2곳은 폴백 📥 기준으로 갱신

### 남은 후보 (자산 업로드 시 가능)

🎫 📩 🙋 (티켓), ✌️ 🖐 🤯 😭 🫠 (게임), 🚫 🔄 🚪 (알림), ⚡ 📡 (핑) — `resources/emoji_replacement/*.png` 추가 + `emoji-ids.json` 재생성 필요.