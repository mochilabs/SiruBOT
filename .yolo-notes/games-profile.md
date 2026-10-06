# SiruBOT 게임 기능 & /프로필 분석 (2026-10-05)

브랜치: `feat/yolo-improvements` · 분석만, 코드 수정 없음

---

## 1. 게임 기능 현황

### 1.1 명령어 목록 (전부 `apps/bot/src/modules/games/`)

| 명령어 | 파일 | 설명 | 상태 저장 | 실제 동작 |
|---|---|---|---|---|
| /주사위 `dice` | `commands/dice.ts` | `NdM±K` 파싱 (1~20개, 2~1000면). Components V2 컨테이너 출력 | 없음 (stateless) | ✅ 동작 |
| /운세 `fortune` | `commands/fortune.ts` | `sha256(userId:날짜)` 결정적 랜덤. 운세 10종/등급 5종/럭키컬러/럭키넘버. "같은 날엔 항상 같은 결과"가 의도된 스펙 | 없음 | ✅ 동작 |
| /숫자맞히기 `guess` | `commands/guess.ts` | 1~100, 6번 기회, up/down 힌트. `시작`으로 세션 개설 | 인메모리 `Map<userId, {target, attempts}>` + 개인 최고기록 Map | ⚠️ 동작하나 영속성 없음 |
| /가위바위보 `rps` | `commands/rps.ts` + `interaction-handlers/games.ts` | 버튼 3종 (ephemeral) → 결과 + 다시하기 버튼. 연승/최고연승 표시 | 인메모리 `Map<userId, {streak, best}>` | ⚠️ 동작하나 영속성 없음 |
| /오하아사 `ohaasa` | `commands/ohaasa.ts` | 아사히 방송 별자리 운세. data-api `/v1/ohaasa` 경유 (`fetchOhaasaKo`). 별자리/생일 직접 지정 or `/프로필` 생일 자동 연동 | 없음 (data-api가 스케줄 캐시) | ✅ 동작 (data-api 필요) |

### 1.2 DB 스키마 (`packages/prisma/src/schema.prisma`)

**게임 관련 모델이 하나도 없음.** 레벨/XP/재화/전적 시스템 전무.

- `User`: `id` + `birthMonth`/`birthDay`(생일, 별자리 자동계산용)만. 게임 컬럼 없음.
- `GuildTrackHistory` / `Track` / `Playlist`: 음악 기록 전용. `/프로필` 음악 통계의 원천.
- `ChannelChatHistory`, `UserMemory`: AI 채팅용. 게임과 무관.

### 1.3 코드 품질 이슈

1. **인메모리 상태 유실**: `guess` 세션·최고기록, `rps` 연승 기록이 프로세스 내 `Map`. 재시작하면 날아가고, `apps/shardmanager` 기반 멀티샤드 환경에서는 샤드마다 기록이 따로 논다. `container.redisStore`가 이미 있으니 Redis로 옮기면 해결.
2. **게임 간 공통 인프라 없음**: 각 명령어가 독자적인 Map/컨테이너 빌더 사용. 전적·쿨다운·통계 같은 횡단 관심사가 흩어져 있음.
3. **작동 확인된 로직**:
   - rps 승패 판정 `(userPick - botPick + 3) % 3` (0=가위,1=바위,2=보) — 검증 결과 정확.
   - guess 시도 횟수 계산 `MAX - attempts + 1` — 정확.
   - fortune 결정적 해시 — 날짜 바뀌면 바뀌고, 같은 날 같은 유저는 동일. 스펙대로 동작.

---

## 2. /프로필 명령어 분석

### 2.1 구조 (`apps/bot/src/modules/general/commands/profile.ts`)

서브커맨드 3개: `보기`(유저 지정·나만보기 옵션), `생일설정`, `생일삭제`.

### 2.2 렌더링 파이프라인

1. **1순위: 이미지 카드** — `buildProfileCardData()` → data-api `POST /v1/image/profile` → skia-canvas PNG (920×약620). 실패 시 텍스트 폴백.
2. **폴백: 텍스트 카드** — Components V2 `SectionBuilder` + 썸네일(아바타).

### 2.3 이미지 카드 구성 (`apps/data-api/src/renderers/profileCard.ts`)

- **배너 영역** (200px, 없으면 120px): 유저 배너가 있으면 그대로 깔고 하단 페이드. 없으면 별자리 테마 그라디언트 + 별 55개 + **12별자리 실제 별자리 도형**을 점선으로 연결해 우측에 크게 렌더.
- **아바타**: 배너-콘텐츠 경계에 걸침, 별자리 테마 컬러 글로우 링.
- **신원**: displayName(42px 볼드) / @username / 별자리 뱃지(ko·jp) / 생일(본인 조회 때만).
- **통계 3종 카드**: 플레이리스트 수 · 신청한 곡 수 · 총 청취 시간.
- **자주 신청한 곡 TOP 3**: 썸네일 + 순위 배지 + 제목/아티스트.
- **푸터**: 계정 생성일 · 서버 참가일 · "SiruBOT" 워터마크.
- 12별자리별 `primary/secondary/glow` 컬러 테마 내장.

### 2.4 데이터 (`utils/profileCardData.ts`)

- `GuildTrackHistory` 집계. 길드 안이면 **해당 길드 기준**, DM이면 전체 기준.
- 청취 시간은 **최근 500건 샘플** 기준 (`listenSampled` 플래그로 표기).
- 생일은 **본인 조회 때만** 포함, 타인은 별자리 코드만.

### 2.5 디자인 이슈

1. **이미지 카드 < 텍스트 폴백 정보량**: 텍스트 카드에만 있는 것 — 역할 목록, 부스터 여부, 최근 신청 곡 5개(상대시간), 자주 신청한 곡 TOP 5(횟수 표기). 이미지 카드가 오히려 정보가 적음.
2. **경미한 버그**: 생일 텍스트 색이 `'rgba(255,255,255,0.7)'` 하드코딩 — 배너 없는 라이트모드(`#2a3140` 계열 텍스트)에서는 명도 대비가 떨어짐. `textMuted()`를 써야 함 (`profileCard.ts` 생일 렌더 부분).
3. **청취 시간 축약 손실**: `formatListenCompact`가 "12시간 34분" → "12시간"으로 버림.
4. **`guildJoinedAt` 캐시 의존**: `members.cache` 미스 시 null. 텍스트 카드는 `members.fetch` 폴백이 있는데 이미지 카드 경로는 없음.
5. **고정 레이아웃**: 920px 고정, TOP 3 고정. 섹션 추가 시 `CONTENT_H` 수동 조정 필요 → 동적 높이 계산으로 바꾸면 확장 용이.

---

## 3. 개선 제안

### 3.1 새 게임 기능 (기존 DB/인프라 재활용 우선, 구현 난이도순)

1. **전적 DB화 (기반 작업, 최우선)**
   - 새 Prisma 모델 `GameRecord(userId, game, wins, losses, draws, bestStreak, updatedAt)`.
   - `guess`/`rps`의 인메모리 Map을 여기로 이전. Redis 없이 해결, 샤드 문제도 해소.
   - 이후 모든 게임 기능의 토대가 됨.

2. **/출석 (일일 출석 체크)**
   - `User`에 `lastCheckinAt`, `checkinStreak` 컬럼 추가 or 별도 모델.
   - 연속 출석 스트릭 표시. `/프로필` 카드에 🔥 스트릭 뱃지로 연계하면 리텐션 상승.
   - 외부 API 불필요, 구현 1~2시간 규모.

3. **/퀴즈 (음악 인트로 퀴즈)**
   - 봇의 핵심 자산(음악) 활용: 길드 큐/Track DB에서 곡을 골라 인트로 N초 재생 → 4지선다 버튼으로 제목 맞히기.
   - `audio` 모듈 Lavalink 플레이어 + `Track` 모델 재활용. 길드별 진행 상태는 `container.redisStore`에.
   - 음악봇 정체성과 가장 잘 맞는 게임.

4. **/주사위 배틀 (대전 모드)**
   - 기존 `dice`에 대전 모드 추가: 두 유저가 굴려 높은 쪽 승리 → `GameRecord`에 전적 기록.
   - 신규 인프라 없이 기존 코드 + 1번 결과물로 구현 가능.

5. **/초성퀴즈**
   - Track DB의 곡 제목/아티스트에서 초성 문제 자동 생성. 외부 API 불필요.
   - 3번보다 가볍고, 한국어 서버 친화적.

### 3.2 /프로필 디자인 개선 방향

1. **이미지 카드 ↔ 텍스트 카드 정보 통일**: 이미지 카드에 최근 신청 곡(3개, 상대시간) 섹션 추가. 또는 텍스트 카드를 이미지 카드의 서브셋으로 정리. 현재 "폴백이 본편보다 자세하다"는 역전 상태.
2. **게임 전적 섹션**: 3.1-1 이후 카드에 `🎮 가위바위보 12승 3패 · 최고 5연승` 한 줄 + 미니 뱃지. 통계 카드를 3종 → 4종(2×2 그리드)으로.
3. **출석 스트릭 뱃지**: 3.1-2 이후 별자리 뱃지 옆에 `🔥 7일 연속` 뱃지.
4. **data-api 렌더 확장** (봇 코드는 얇게 유지, 현재 구조와 일관):
   - `POST /v1/image/leaderboard` — 게임별 길드 리더보드 카드.
   - `POST /v1/image/checkin-calendar` — 월간 출석 캘린더 카드.
5. **레이아웃 동적화**: `CONTENT_H`를 섹션 수에 따라 계산. TOP 3 → TOP 5 확장 여지.
6. **버그 수정**: 생일 텍스트 색상 `textMuted()` 적용, 청취 시간 "N시간 M분" 유지, `guildJoinedAt`에 `members.fetch` 폴백.

### 3.3 구현 순서 제안

```
1. GameRecord 모델 + 마이그레이션, guess/rps 이전   (기반)
2. /프로필 이미지 카드 버그 수정 3건 + 정보 통일      (저비용 개선)
3. /출석 + 프로필 스트릭 뱃지                        (리텐션)
4. /퀴즈 (음악 인트로)                               (킬러 기능)
5. /주사위 배틀, /초성퀴즈                           (확장)
6. data-api 리더보드/출석캘린더 렌더                  (시각화)
```
