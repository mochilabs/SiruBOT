# 봇 강조색 · 채널 권한 필터링 가능성 조사

> **상태**: pending (조사 완료 — 구현 착수 전 결정 필요)
> **형태**: 2026-10-18 기준 날짜 스냅샷 일회성 조사 문서. 코드는 그 이후 변경될 수 있다.
> **Baseline**: `beta` @ `34f343db` · 조사: 저장소 코드 직접 검증 + Discord API 문서 확인

---

## TL;DR

| 항목 | 결론 | 비용 | 비고 |
|---|---|---|---|
| **봇 전체 accent color** | 구현 가능 | 작음 (전역 설정) / 큼 (길드별 설정) | 전역 env 설정이면 `createContainer` 한 곳만 건드리면 됨 |
| **채널 권한 기반 필터링** | 구현 가능 | 중간 | 계산은 봇(`permissionsFor`)에 맡기는 편이 안전 |

---

## 1. 봇 전체 accent color — 구현 가능

### 1.1 현재 상태 (검증 완료)

강조색의 단일 원천은 `packages/utils/src/constants.ts`의 `DEFAULT_COLOR = 0xffdaff`다.
이 값이 쓰이는 곳은 세 갈래다.

| 경로 | 위치 | 호출부 수 |
|---|---|---|
| `createContainer(accentColor?)` | `packages/utils/src/embed.ts` | 97곳 |
| `ExtendedEmbedBuilder` (임베드 색) | `packages/utils/src/embed.ts` | 임베드 전체 |
| 명시적 `setAccentColor(DEFAULT_COLOR)` | bot의 view·listener·handler | 20곳 |

이번 작업에서 `createContainer`가 강조색 인자를 받도록 바뀌었고(`#RRGGBB` → `hexColorToInt`),
멤버 인사 메시지에 한해 설정한 강조색이 들어간다. 나머지는 전부 `DEFAULT_COLOR`를 그대로 쓴다.

### 1.2 구현 범위 두 가지

**(a) 전역(운영자) 설정 — 추천**

봇이 보내는 모든 컨테이너·임베드의 기본색을 바꾼다.

- 구현: `DEFAULT_COLOR`를 읽기 전용 상수 → 런타임에 값을 주는 함수로 바꾸고, `createContainer()`와 `ExtendedEmbedBuilder` 내부에서 읽게 한다. **97개 호출부는 손댈 필요가 없다** — 둘 다 내부에서 색을 정하기 때문이다.
- 명시적 `setAccentColor(DEFAULT_COLOR)` 20곳은 `createContainer()`로 흡수하면 함께 정리된다.
- 색 저장 위치:
  - `BOT_ACCENT_COLOR` env — 가장 단순. 재시작해야 반영된다.
  - Redis/DB 키 + 메모리 캐시 — 런타임 변경이 필요할 때. 길드 설정 캐시 무효화(`guildSettingsInvalidator`)와 같은 패턴을 재사용할 수 있다.

**(b) 길드별 설정 — 수요 확인 후**

서버마다 다른 강조색을 쓴다.

- `Guild` 컬럼 추가 + 호출부에 `guildId` 전달. `createContainer(accentColor?)` 인자를 넘기는 수정이 bot의 커맨드·뷰 파일 30~40개에 걸친다.
- 음성 상태 변경·이벤트 알림처럼 guildId가 바로 없는 흐름은 폴백 경로가 필요하다.
- 길드 캐시 조회가 메시지 생성 경로마다 한 번씩 늘어난다.

### 1.3 결정할 것

- **어디까지 바꾸는가**: 전역만 / 길드별까지.
- **색은 어디에 저장하는가**: env(재시작 반영) vs DB·Redis(즉시 반영).
- **다크·라이트 대비**: 강조색이 바뀌면 그 위에 얹는 텍스트(`primary-text` 대응) 대비가 깨질 수 있다. 색을 고르는 UI에서 대비 검사를 함께 보여주는 편이 안전하다 (`scripts/wcag-contrast-audit.py` 참고).
- **시각적 균형**: 강조색을 모든 요소에 쓰면 강조가 강조가 아니게 된다. 기본색을 바꾸는 것은 브랜드 결정이므로 한 번에 여러 요소가 아니라 컨테이너 강조선처럼 "표시 위치가 정해진 곳"부터 바꾸는 것을 권장한다.

---

## 2. 채널 권한 기반 필터링 — 구현 가능

> "채널 선택기에 사용자가 권한을 가진 채널만 보여주기"

### 2.1 현재 상태 (검증 완료)

- 권한 검사는 **길드 레벨**뿐이다: `lib/guild-permissions.ts`의 `hasManageablePermissions` = `ManageGuild (0x20)` 또는 `Administrator (0x8)`.
- 이 결과는 `lib/api-guards.ts`의 `authorizeGuildManage`로 모든 `/api/servers/[id]/*` 라우트를 지킨다.
- **채널별 권한 계산은 어디에도 없다** — `permission_overwrites`, `PermissionsBitField`, `permissionsFor`를 대시보드에서 쓰는 코드가 없다.
- 채널 목록 데이터(`DiscordChannelSummary`)는 `id / name / type / parentId / position`만 담는다. overwrite 정보가 없다.

### 2.2 왜 대시보드에서 바로 계산할 수 없는가

Discord의 채널 권한은 다음을 합성한 결과다.

```
길드 기본 권한(멤버의 역할들)
  → @everyone 채널 overwrite
  → 역할 채널 overwrite (합집합/차집합)
  → 멤버 채널 overwrite
  → Administrator 우회
```

대시보드에는 사용자의 OAuth 액세스 토큰과 길드 `permissions` 비트필드만 있다.
채널 overwrite 원본과 사용자 역할 ID 목록이 없어 계산 재료가 없다.

### 2.3 구현 경로

**(a) 봇이 계산해서 내려보내기 — 추천**

- 이미 하는 일: `apps/bot/src/services/guildDataResponder.ts`가 discord.js 캐시에서 채널·역할을 응답한다.
- 추가할 일:
  1. `packages/utils/src/guildData.ts`의 `guildChannelItemSchema`에 `canView` / `canSend` / `canManage` 부울 추가.
  2. 요청 페이로드에 `userId`를 넣고, 봇이 `channel.permissionsFor(member)`로 계산한다. discord.js가 권한 수학을 이미 구현해 두었다.
  3. data-api의 `guildDataHub` request/reply에 `userId`를 함께 실어 보낸다.
- 비용: 중간. 스키마·봇·data-api·대시보드 4곳이지만 각각 변경량은 작다.
- 장점: 권한 수학을 재구현하지 않는다. Discord가 규칙을 바꾸면 discord.js 업데이트로 따라간다.

**(b) 클라이언트에서 직접 계산 — 비추천**

- 채널 overwrite 원본 + 사용자 역할 ID를 그대로 내려보내야 하고, 위 합성 규칙을 대시보드에서 다시 구현해야 한다.
- 토큰 유출 위험이 커지고(overwrite 목록은 길드 구조 전체를 노출), 틀리면 "권한이 없는데 보이는 채널" 같은 미묘한 버그가 남는다.

### 2.4 결정할 것

- **어디에 적용하는가**: 모든 채널 선택기 / 특정 설정 화면만. 필터를 켜면 관리자가 "봇은 볼 수 있는데 나는 못 보는 채널"을 설정하지 못하게 되므로, 적용 범위를 좁게 시작하는 편이 안전하다.
- **무엇을 기준으로 하는가**: `ViewChannel`만 / `ViewChannel + SendMessages` / `ManageChannels`. 인사 메시지 채널은 "봇이 보낼 수 있는 채널"이 더 정확한 기준일 수 있다.
- **봇 권한과의 관계**: 이 필터는 "대시보드에서 사용자가 고를 수 있는 채널"의 문제이고, "봇이 실제로 보낼 수 있는가"는 별개다. 봇 권한 확인(`MemberGreetingService.resolveSendableChannel`)은 그대로 유지해야 한다.

---

## 3. 참고 — 이번에 확인한 Discord API 사실

- **미디어 갤러리 아이템에는 `size` 필드가 없다.** 공식 문서 기준 필드는 `media` / `description` / `spoiler` 셋뿐이다. 표시 크기 제어(`display_size`)는 2026-04에 올라온 **미구현 기능 요청** 상태다 (discord/discord-api-docs#8284, 답변 0).
  - 표시 크기는 이미지의 네이티브 해상도로 정해진다. 그래서 크기를 바꾸려면 렌더링 출력 PNG 해상도를 바꿔야 한다.
- **강조색(accent color)은 Container 컴포넌트 전용 속성이다.** 컨테이너 없이 컴포넌트 목록을 그대로 보내는 레이아웃에서는 쓸 수 없다.
