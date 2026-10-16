# 커스텀 명령어 v2 (실행 방식·역할·조건문·CV2·슬래시·AI 수정) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 커스텀 명령어를 접두사형/슬래시형 2택 실행 방식 + 역할 부여·조건문·인수 치환·CV2 디자이너·AI 반복 수정까지 갖춘 v2로 확장한다.

**Architecture:** 계약(`packages/utils/src/customCommand.ts`)이 v2 스키마를 먼저 정의하고, 봇 인터프리터가 순차 실행 루프를 확장하며, 대시보드 빌더와 data-api AI 프롬프트가 그 계약을 소비한다. v1 저장 스펙은 그대로 유효(union 재검증), 신규 저장만 v2. 슬래시형은 길드 애플리케이션 커맨드로 개별 등록(Redis 브로드캐스트 → `guild.commands.create/edit/delete`)하고, 접두사형은 기존 메시지 리스너를 유지한다.

**Tech Stack:** TypeScript (ESM, `.ts` 확장자 import), zod, discord.js v14 Components V2, Sapphire Framework, Prisma, Fastify (data-api), Next.js 16 (dashboard), Vitest.

**브랜치:** `fix/greeting-mentions` (Task 0, 독립) → 이후 `feat/custom-commands-v2` (beta 기준, 나머지 전부 — 사용자가 빅뱅 단일 PR 선택).

---

## 이해 요약 / 가정 / 결정 로그

**무엇을 만드는가** — 스펙 v2: 스텝 `send_message`(통합·CV2 디자이너)·`delay` 유지, 신규 `add_role`/`remove_role`/`add_reaction`/`pin_message`/`delete_trigger`/`if`(역할보유·채널일치·인수비교, then/else depth-1). 인수 치환 `{argv0}`~`{argv4}`. 명령어 단위 `access`(모두/역할/권한). 실행 방식 `method: 'prefix'|'slash'` 생성 시 2택·불변.

**가정 (사용자 확인된 것 외 제가 정한 것)**
1. 커스텀 슬래시 길드당 상한 20개 (봇 본 커맨드 슬롯 보호, Discord 길드 한도 100)
2. 슬래시형 이름은 디스코드 패턴 `^[-_\p{L}\p{N}]{1,32}$` + 라틴 소문자 강제 + 설명 필수(1~100자)
3. AI 수정 히스토리는 브라우저 세션 메모리 기준 최근 8턴 (DB 저장 안 함)
4. `if` 서브 스텝 ≤10개, 중첩 금지
5. 슬래시 실행 UX: 첫 `send_message`가 `interaction.reply`로 나가고 이후는 채널 전송. `send_message`가 하나도 없으면 ephemeral "완료" 응답. `delete_trigger`는 슬래시에서 `deleteReply`
6. 슬래시 등록은 ID 기반 증분 동기화 (`CustomCommand.applicationCommandId` 컬럼) — Sapphire 본 커맨드를 건드리지 않음

**명시적 비목표** — 버튼/상호작용(v3), DM 전송, 반응 대기, 반복 타이머, 중첩 조건문, 음성 액션, 접두사↔슬래시 변환.

**결정 로그**
| 결정 | 대안 | 선택 이유 |
|---|---|---|
| 범위: 전부(역할·if·인수·🟢4종) | 부분 범위 | 사용자 선택 |
| 실행 제한: 명령어별 `access` 필드 | 관리자 전용 고정 | 유연성 + 악용 방지 |
| if 조건 3종 (역할·채널·인수) | +음성 접속 | 사용자: 음성은 굳이 |
| CV2 디자이너가 `send_message`에 통합 | 별도 `send_design` 스텝 | 사용자 선택 — v1 호환(부분집합) 유지 |
| 실행 방식 2택 불변 | 토글/변환 허용 | 사용자: 변환 없이 깔끔 |
| 슬래시 인수: 사용 개수만큼 자동 옵션 | 단일 문자열 | 사용자 선택 |
| AI 수정: 최근 N턴 기억 | 스테이트리스 | 사용자 선택 |
| 구현: 빅뱅 단일 PR | 수직 슬라이스 | 사용자 선택 |
| 슬래시 등록 방식: ID 기반 증분 | `guild.commands.set` 전체 교체 | 본 커맨드 보호 |

---

## 공용 컨벤션 (모든 태스크)

- 상대 import는 `.ts` 확장자 필수 (`./interpreter.ts`)
- Prettier: tabs, single quotes, `printWidth: 150`, `trailingComma: none`. 대시보드만 eslint.
- 커밋 메시지: conventional (`feat:`, `fix:`, `test:`)
- 각 태스크 마지막 스텝: `yarn lint && yarn typecheck && yarn test` 로컬 검증 후 커밋
- 봇 사용자 문구는 전부 한국어, 모든 전송에 `allowedMentions: { parse: [] }` 고정

---

## Task 0: 인사 메시지 멘션 버그 fix (독립 브랜치)

**Files:**
- Modify: `apps/bot/src/services/memberGreetingService.ts:337-343` (send()의 `channel.send`)
- Test: `apps/bot/src/services/memberGreetingService.test.ts` (없으면 생성)

**Step 1: 브랜치 생성**

```bash
git checkout beta && git checkout -b fix/greeting-mentions
```

**Step 2: 실패하는 테스트 작성** — `send()` 결과 전송 payload에 `allowedMentions`가 있고, `parse: []` + `users: [대상멤버ID]`를 포함하는지 검증 (channel.send를 mock으로 가로채 검증).

```ts
it('인사 메시지는 everything/here/역할 멘션을 막고 대상 멤버만 핑한다', async () => {
  // send() 호출 후 mock channel.send 첫 인자 검증
  expect(sent.allowedMentions).toEqual({ parse: [], users: [member.user.id] });
});
```

**Step 3: 테스트 실패 확인** — `yarn vitest run memberGreetingService` (FAIL: allowedMentions undefined)

**Step 4: 구현** — `memberGreetingService.ts` `send()`의 `channel.send({ ... })`에 추가:

```ts
allowedMentions: { parse: [], users: [member.user.id] }
```

**Step 5: 테스트 통과 확인 + 커밋**

```bash
yarn vitest run memberGreetingService && yarn lint && yarn typecheck
git add apps/bot/src/services/memberGreetingService.ts apps/bot/src/services/memberGreetingService.test.ts
git commit -m "fix: 인사 메시지에서 everything/here/역할 멘션 전파 차단"
```

**Step 6: 병행 처리** — PR 생성/머지는 사용자 확인 후. 이후 태스크는 `feat/custom-commands-v2`로 진행.

---

## Task 1: Prisma 스키마 — method/applicationCommandId 컬럼

**Files:**
- Modify: `packages/prisma/src/schema.prisma` (CustomCommand 모델)
- Create: `packages/prisma/src/migrations/.../migration.sql` (yarn generate가 만듦)

**Step 1: 모델에 컬럼 추가** — CustomCommand 모델에:

```prisma
/// 'prefix' | 'slash' — 생성 시점에 정해지고 바뀌지 않아요
method String @default("prefix")
/// 슬래시형 등록 후 Discord application command ID — 증분 동기화에 써요
applicationCommandId String?
```

**Step 2: 마이그레이션 생성 + 클라이언트 생성**

```bash
yarn workspace @sirubot/prisma migrate:dev --name custom_command_method
yarn generate
```

Expected: migration.sql에 `ALTER TABLE ... ADD COLUMN` 두 줄, 기존 행은 `method='prefix'` 기본값.

**Step 3: 타입체크** — `yarn typecheck` (기존 코드가 새 컬럼을 모르므로 깨지지 않아야 함)

**Step 4: 커밋**

```bash
git add packages/prisma
git commit -m "feat: CustomCommand에 실행 방식(method)·슬래시 등록 ID 컬럼 추가"
```

---

## Task 2: 스키마 v2 (`packages/utils/src/customCommand.ts`)

**Files:**
- Modify: `packages/utils/src/customCommand.ts`
- Test: `packages/utils/src/customCommand.test.ts` (없으면 생성, 기존 있으면 확장)

**Step 1: 스키마 v2 실패 테스트 작성** — 다음 케이스를 table-driven로:
- v2 스펙 parse 성공: 모든 신규 스텝 타입(`add_role`, `remove_role`, `add_reaction`, `pin_message`, `delete_trigger`, `if`) 1개씩
- v1 스펙 `{"version":1,"steps":[{"type":"send_message","text":"hi"}]}` parse 성공 (호환)
- `access.mode='everyone'`인데 `add_role` 존재 → 실패 ("역할 변경 액션은 실행 제한이 필요해요")
- `if.then` 중첩 `if` → 실패 / `then` 11스텝 → 실패
- 인수 치환 문자열 길이·`{argv9}`는 문자열 그대로 통과(치환은 런타임 책임)
- `method='slash'` 이름 검증: `Greet`(라틴 대문자) 실패, `아침브리핑` 통과, `has space` 실패, 설명 0자 실패

**Step 2: 실행 → FAIL 확인**

```bash
yarn workspace @sirubot/utils vitest run customCommand
```

**Step 3: 구현** — `customCommand.ts` 재구성 (기존 상수·헬퍼 유지):

```ts
export const CUSTOM_COMMAND_SPEC_VERSION = 2;

// 신규 스텝 스키마 (한국어 에러 메시지 — 대시보드가 그대로 보여줌)
const addRoleStepSchema = z.object({
  type: z.literal('add_role'),
  roleId: z.string().regex(/^\d{17,20}$/, '역할을 선택해 주세요.')
});
const removeRoleStepSchema = z.object({ type: z.literal('remove_role'), roleId: z.string().regex(/^\d{17,20}$/, '역할을 선택해 주세요.') });
const addReactionStepSchema = z.object({ type: z.literal('add_reaction'), emoji: z.string().min(1).max(100) });
const pinMessageStepSchema = z.object({ type: z.literal('pin_message') });
const deleteTriggerStepSchema = z.object({
  type: z.literal('delete_trigger'),
  afterSeconds: z.number().int().min(1).max(60, '삭제 대기는 60초 이하여야 해요.')
});

// CV2 디자인 — items ≤10, https URL만
const cv2DesignSchema = z.object({
  accentColor: z.enum(['blue', 'green', 'red', 'purple', 'gray']).default('blue'),
  items: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text'), content: z.string().min(1).max(2000) }),
    z.object({ kind: z.literal('separator') }),
    z.object({ kind: z.literal('section'), content: z.string().min(1).max(2000), thumbnailUrl: z.string().url().regex(/^https:\/\//) }),
    z.object({ kind: z.literal('media'), urls: z.array(z.string().url().regex(/^https:\/\//)).min(1).max(10) })
  ])).min(1).max(10)
});

const sendMessageStepSchema = z.object({
  type: z.literal('send_message'),
  text: z.string().min(1).max(2000).optional(),
  design: cv2DesignSchema.optional()
}).refine((s) => s.text !== undefined || s.design !== undefined, { message: '보낼 내용을 입력해 주세요.' });

// if — depth 1 (then/else 안의 스텝은 if 불가)
const ifConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('has_role'), roleId: z.string().regex(/^\d{17,20}$/) }),
  z.object({ kind: z.literal('channel_match'), channelId: z.string().regex(/^\d{17,20}$/) }),
  z.object({ kind: z.literal('arg_matches'), index: z.number().int().min(0).max(4), value: z.string().min(1).max(100) })
]);
const ifStepSchema = z.object({
  type: z.literal('if'),
  condition: ifConditionSchema,
  then: z.array(nonIfStepSchema).min(1).max(10),
  else: z.array(nonIfStepSchema).max(10).optional()
});

// access
const accessSchema = z.object({
  mode: z.enum(['everyone', 'roles', 'permissions']),
  roleIds: z.array(z.string().regex(/^\d{17,20}$/)).max(10).optional(),
  permissions: z.array(z.enum(['ManageRoles', 'ManageChannels', 'ManageMessages', 'Administrator'])).max(4).optional()
}).superRefine((a, ctx) => {
  if (a.mode === 'roles' && (!a.roleIds || a.roleIds.length === 0)) ctx.addIssue({ code: 'custom', message: '허용 역할을 1개 이상 선택해 주세요.' });
  if (a.mode === 'permissions' && (!a.permissions || a.permissions.length === 0)) ctx.addIssue({ code: 'custom', message: '허용 권한을 1개 이상 선택해 주세요.' });
});

// v2 spec — add_role/remove_role 존재 시 access.mode !== 'everyone' 강제 (superRefine)
// v1 스키마는 customCommandSpecSchemaV1로 보존, export customCommandSpecSchema = z.union([v1, v2])
// method 검증: validateCustomCommandMethod(name, method, description) — slash면 이름 패턴 + 설명 필수
```

- `{argv0}`~`{argv4}` 치환용 상수 `CUSTOM_COMMAND_MAX_ARGS = 5` 추가
- `customCommandPayloadSchema`는 v2 spec만 승인 + `method` 필드 포함 (`z.enum(['prefix','slash'])`)
- slash 이름 검증: `CUSTOM_COMMAND_SLASH_NAME_PATTERN = /^[-_\p{L}\p{N}]{1,32}$/u` + 라틴 대문자 포함 시 실패 메시지

**Step 4: 테스트 통과 확인**

```bash
yarn workspace @sirubot/utils vitest run customCommand
```

**Step 5: 커밋**

```bash
git add packages/utils/src/customCommand.ts packages/utils/src/customCommand.test.ts
git commit -m "feat: 커스텀 명령어 스펙 v2 (실행 제한·신규 액션·CV2·if·인수)"
```

---

## Task 3: 인터프리터 v2 (`apps/bot/src/services/customCommands/interpreter.ts`)

**Files:**
- Modify: `apps/bot/src/services/customCommands/interpreter.ts` (재작성)
- Test: `apps/bot/src/services/customCommands/interpreter.test.ts` (없으면 생성)

**Step 1: 실패 테스트 작성** — mock ctx(가짜 channel/member/guild)로:
- `add_role` 성공: `member.roles.add` 호출됨 / 봇 역할 위계 위반 시 실패 후 남은 스텝 중단
- `if` 조건 3종 분기 (then/else 각각 실행)
- `{argv0}` 치환 + 멘션 문법 `<@123>` 제거
- `send_message` + `design` → `channel.send`에 `MessageFlags.IsComponentsV2` 포함, `allowedMentions.parse: []`
- `delete_trigger` → 지연 후 `message.delete()` 호출 (fake timers)
- `access` 거부 시 스텝 0개 실행 + `access_denied` 결과

**Step 2: 실행 → FAIL 확인** — `yarn vitest run interpreter` (workspace: @sirubot/bot)

**Step 3: 구현** — 인터페이스 확장:

```ts
export interface CustomCommandContext {
  channel: { send(payload: unknown): Promise<unknown> };
  member: { id: string; roles: { cache: { has(id: string): boolean }; add(id: string): Promise<unknown>; remove(id: string): Promise<unknown> } };
  guild: { me: { roles: { highest: { position: number } } } | null; roles: { cache: Map<string, { id: string; position: number; managed: boolean }> } };
  args: string[];            // 슬래시 옵션 또는 메시지 토큰
  triggerMessage?: { delete(): Promise<unknown> };
  interactionReply?: { ... }; // 슬래시 첫 응답용 (Task 7에서 주입)
}
export type CustomCommandRunResult =
  | { kind: 'ok'; sent: number }
  | { kind: 'invalid_spec' }
  | { kind: 'access_denied' }
  | { kind: 'action_failed'; sent: number; stepIndex: number; error: unknown };
```

핵심 규칙 (전부 구현):
- v1/v2 union 스키마 재검증 → v2만 실행(v1은 text-only send_message로 취급)
- `access` 판정: mode everyone 통과 / roles는 실행자 roleIds 교집합 / permissions는 `member.permissions`(채널 기준) 검사
- `add_role`/`remove_role` 런타임 검증: 대상 역할 존재 + `managed`(봇 전용 역할) 아님 + 봇 최상위 역할 position > 대상 role position + 봇 `ManageRoles` — 실패 시 `action_failed` 반환하고 중단
- 인수 치환: `text.replace(/\{argv(\d)\}/g, ...)` — 인덱스 ≥5는 빈 문자열, 값에서 `/<@!?&?\d+>|<#\d+>|<a?:\w+:\d+>/g` 제거
- CV2 조립: discord.js 빌더 (`ContainerBuilder`/`TextDisplayBuilder`/`SectionBuilder`/`SeparatorBuilder`/`MediaGalleryBuilder`), 색상은 `@sirubot/utils` 팔레트 맵 상수로
- 실패 시에도 남은 스텝 중단(기존 v1 계약 유지), `delay` 합계 상한은 스키마가 이미 보장

**Step 4: 테스트 통과 + lint/typecheck**

```bash
yarn vitest run interpreter && yarn lint && yarn typecheck
```

**Step 5: 커밋** — `feat: 인터프리터 v2 — 역할·조건문·인수·CV2 실행`

---

## Task 4: 접두사 리스너 어댑터 (`customCommandPrefix.ts`)

**Files:**
- Modify: `apps/bot/src/modules/general/listeners/message/customCommandPrefix.ts`
- Test: `apps/bot/src/modules/general/listeners/message/customCommandPrefix.test.ts` (없으면 생성)

**Step 1: 테스트** — 메시지 토큰 → `ctx.args` 매핑, `access` 거부 시 아무것도 안 보내는지, 실행 실패 시 한국어 안내 메시지(`action_failed`일 때 "권한이 부족해요" 등).

**Step 2: 구현** — `runCustomCommandSpec(entry.spec, ctx)` 호출부를 새 인터페이스로 교체. args는 `rest.slice(firstTokenEnd).trim().split(/\s+/)`의 최대 5개, `method === 'slash'`인 항목은 무시(슬래시 전용). `!도움말` 목록은 `method === 'prefix'`만 표시 + 슬래시형은 `-# 슬래시 명령어로도 등록된 게 있어요` 한 줄 안내.

**Step 3: 검증** — `yarn vitest run customCommandPrefix && yarn lint && yarn typecheck`

**Step 4: 커밋** — `feat: 접두사 실행에 v2 컨텍스트·실행 제한 적용`

---

## Task 5: 슬래시 등록 동기화 (`apps/bot/src/services/customCommands/slashRegistry.ts` 신규)

**Files:**
- Create: `apps/bot/src/services/customCommands/slashRegistry.ts`
- Modify: `packages/utils/src/customCommand.ts` (또는 `redisChannels.ts` 위치 확인) — `CUSTOM_COMMAND_SLASH_SYNC_CHANNEL` 상수 추가
- Modify: `apps/bot/src/services/guildSettingsInvalidator` (수신 시 slash 동기화 트리거 — 파일 위치는 코드 검색으로 확인)
- Test: `apps/bot/src/services/customCommands/slashRegistry.test.ts`

**Step 1: 실패 테스트** — mock `guild.commands`:
- 신규 slash형(등록 ID 없음) → `create` 호출 + DB에 ID 저장
- ID 있음 + 스펙 변경 → `edit` 호출
- 삭제된 항목 → `delete` 호출 (삭제 전 ID 보존 필요 → 대시보드 삭제 시에도 브로드캐스트)
- 길드 slash형이 20개 초과 시 신규 등록 거부 + 로그

**Step 2: 구현** — `syncGuildSlashCommands(guildId)`:
1. DB에서 `method='slash'` 목록 조회 (store 캐시 재사용 불가 — ID 저장이므로 직접 Prisma)
2. `guild.commands.fetch()` — 우리 DB의 `applicationCommandId` 집합과 비교
3. 신규 create / 변경 edit(이름·설명·옵션 재계산) / 잔여(우리 ID인데 DB에 없음) delete
4. 옵션 자동 생성: 스펙에서 `{argvN}` 최대 인덱스 N → `argument1..N+1` STRING 옵션 (name: `argument1`, description: `명령어 인자 ${i}`, required: false)
5. 결과 ID를 DB에 기록. 실패는 로그 + 다음 브로드캐스트에 재시도 (멱등)

**Step 3: 검증 + 커밋** — `feat: 커스텀 슬래시 명령어 증분 등록/해제 동기화`

---

## Task 6: 슬래시 실행 리스너

**Files:**
- Create: `apps/bot/src/modules/general/listeners/interaction/customCommandSlash.ts`
- Test: 위 파일 대응 `.test.ts`

**Step 1: 실패 테스트** — `Events.InteractionCreate` + ChatInputCommandInteraction mock: 우리 슬래시 이름 매칭 → 인터프리터 실행, 첫 `send_message`가 `interaction.reply`로, 이후는 `channel.send`로 나가는지, `send_message` 0개면 ephemeral 완료 응답.

**Step 2: 구현** — Sapphire `Listener`로 `Events.InteractionCreate` 구독. `interaction.isChatInputCommand()` + 길드 서버에 `method='slash'` 이름 매칭(`normalizeCustomCommandName`) 시:
- `deferReply()` → 인터프리터 실행 → 첫 send는 `editReply`, 이후 `channel.send`. 3초 타임아웃 방지
- `delete_trigger` → `interaction.deleteReply()`
- `access` 거부 → ephemeral 한국어 안내 ("이 명령어를 실행할 권한이 없어요")

**Step 3: 검증 + 커밋** — `feat: 커스텀 슬래시 명령어 실행 핸들러`

---

## Task 7: data-api — AI 프롬프트 v2 + 반복 수정 엔드포인트

**Files:**
- Modify: `apps/data-api/src/routes/customCommandDraft.ts` (DRAFT_SYSTEM_PROMPT v2 규칙 + 스텝 설명 전부)
- Create: `apps/data-api/src/routes/customCommandRefine.ts`
- Modify: `apps/data-api/src/routes/index.ts` (`POST /v1/ai/custom-command-refine` 라우트 등록 — 기존 draft 라우트 옆)
- Test: `apps/data-api/src/routes/customCommandRefine.test.ts`

**Step 1: 실패 테스트** — refine 파서: 현재 스펙 + 지시문 2턴 → 전체 스펙 재출력 parse, 형식 오류 시 사유 반환(기존 `parseCustomCommandDraft` 재사용), 프롬프트에 최근 N턴(≤8)이 어떻게 들어가는지.

**Step 2: 구현** — `customCommandRefineRequestSchema = z.object({ prompt: z.string().min(1).max(500), currentSpec: customCommandSpecSchemaV2, history: z.array(z.object({ role: z.enum(['user','assistant']), content: z.string().max(1000) })).max(16).default([]) })`. 시스템 프롬프트는 draft 프롬프트의 v2 규칙을 공유 상수로 추출해 재사용(DRY) + "현재 스펙에서 지시된 부분만 바꾸고 나머지는 유지" 규칙 추가. 2회 재시도 검증 루프 동일.

**Step 3: 검증 + 커밋** — `feat: data-api 커스텀 명령어 AI 반복 수정 엔드포인트`

---

## Task 8: 대시보드 API 라우트

**Files:**
- Modify: `apps/dashboard/src/app/api/servers/[id]/custom-commands/route.ts` (생성/목록 — 파일 존재 확인 후 수정)
- Modify: `apps/dashboard/src/app/api/servers/[id]/custom-commands/[cmdId]/route.ts` (수정/삭제 — `method` 불변 강제 + 슬래시 동기화 브로드캐스트)
- Create: `apps/dashboard/src/app/api/servers/[id]/custom-commands/refine/route.ts` (data-api 프록시 — 기존 `draft/route.ts` 패턴 복사)
- Modify: `apps/dashboard/src/lib/custom-commands.ts` (state에 method/applicationCommandId 포함)

**Step 1:** 실패 테스트 — POST 시 `method` 없는 payload 거부, PATCH에서 `method` 변경 시도 거부, slash 저장 후 브로드캐스트 발행 확인 (기존 `GUILD_SETTINGS_INVALIDATE_CHANNEL` 발행부 옆에 slash 동기화 트리거 추가 — 대시보드는 봇 캐시 무효화 메시지를 이미 보내므로 그 수신부에서 Task 5의 동기화를 호출하는 방식으로 통일, 별도 채널 불필요하면 생략).

**Step 2:** 구현 — `customCommandPayloadSchema`가 이미 v2+method를 검증하므로 라우트는 zod 교체만. 저장 성공 시 기존 무효화 브로드캐스트 유지.

**Step 3:** 검증 + 커밋 — `feat: 대시보드 API의 v2 페이로드·슬래시 동기화 연결`

---

## Task 9: 대시보드 빌더 v2 (에디터 UI)

**Files:**
- Modify: `apps/dashboard/src/components/servers/custom-command-editor.tsx` (대폭 수정)
- Create: `apps/dashboard/src/components/servers/custom-command-steps-editor.tsx` (스텝 편집)
- Create: `apps/dashboard/src/components/servers/custom-command-designer.tsx` (CV2 디자이너 + 프리뷰)
- Modify: `apps/dashboard/src/components/servers/custom-commands-settings.tsx` (생성 시 실행 방식 2택 UI, method 뱃지, 슬래시 슬롯 카운터)
- Test: 각 컴포넌트 `.test.tsx` (기존 대시보드 테스트 1개 패턴 참고)

**Step 1: UI 테스트** — 방법 선택(접두사/슬래시) 라디오, 슬래시 선택 시 이름 검증·설명 필수 표시, 스텝 추가/삭제/순서 변경, `if` 블록 then/else 편집, CV2 디자이너에서 items 추가 시 프리뷰 갱신, 저장 시 v2 스펙 조립 검증.

**Step 2: 구현**
- 생성 폼 상단: `method` 2택 (라디오) — 기존 항목 수정 시 비활성 + 안내 문구
- 스텝 편집기: 타입 셀렉트(`send_message`/`delay`/`add_role`/…/`if`) + 타입별 필드. 역할 선택기는 기존 역할 선택 컴포넌트(`discord-patterns`의 역할 선택) 재사용
- CV2 디자이너: items 리스트(추가/삭제/위아래) + 우측 실시간 프리뷰(Containers V2 렌더 — 기존 임베드 프리뷰 컴포넌트 패턴 참고)
- AI 패널: 기존 draft 입력 옆에 "수정 지시" 입력 + 히스토리(최근 8턴 세션 상태) → refine 호출 → 반환 스펙을 편집기에 즉시 적용(저장은 별도 버튼)
- 에러 문구는 zod 메시지를 그대로 표기 (한국어 계약 유지)

**Step 3: 검증** — `yarn workspace @sirubot/dashboard test && yarn lint && yarn typecheck` (대시보드 lint는 eslint)

**Step 4: 커밋** — `feat: 커스텀 명령어 빌더 v2 — 스텝·실행 제한·CV2 디자이너·AI 수정`

---

## Task 10: 문서·최종 검증

**Files:**
- Modify: `docs/api-data-api.md` (refine 엔드포인트), `docs/api-dashboard.md`, `docs/architecture.md` (커스텀 명령어 섹션 갱신)

**Step 1:** 문서 갱신 — 위 문서의 커스텀 명령어 설명을 v2로 (스텝 종류 표·method·access·슬래시 등록 흐름 요약).

**Step 2:** 전체 검증

```bash
yarn lint && yarn typecheck && yarn test
```

Expected: 전부 PASS. 대시보드는 `eslint . --max-warnings=0`.

**Step 3:** 수동 확인 체크리스트 (dev 서버 — `yarn dev`)
- [ ] 접두사형 v1 스펙 기존 명령어가 그대로 실행됨 (호환)
- [ ] 대시보드에서 역할 부여 명령어 생성 → `!이름`으로 실행 시 역할 추가됨
- [ ] access를 역할로 지정 시 미보유자에게 무반응/안내
- [ ] if 분기 3종 동작
- [ ] CV2 디자이너 미리보기와 실제 전송 일치
- [ ] 슬래시형 생성 → Discord에서 슬래시로 실행 (한글 이름 포함)
- [ ] 슬래시형 삭제 → 커맨드 목록에서 사라짐
- [ ] AI 수정: "두 번째 메시지를 짧게 바꿔줘" → 스펙에 반영, 저장 전임을 확인
- [ ] 인사 메시지에 @everyone 써도 핑 안 됨 + 새 멤버는 핑됨 (Task 0)

**Step 4: PR 생성** — `feat/custom-commands-v2` → `beta`, PR 본문에 결정 로그 요약 + 체크리스트 결과 첨부.

---

## 완료 정의 (DoD)

- `yarn lint && yarn typecheck && yarn test` 전부 통과
- v1 저장 스펙 무수정 실행 (회귀 테스트로 고정)
- 모든 신규 액션에 유닛테스트 존재 (인터프리터 mock ctx 기준)
- 멘션 전파 차단이 모든 전송 경로에서 유지 (prefix/slash/greeting)
- 상기 수동 체크리스트 전 항목 확인
