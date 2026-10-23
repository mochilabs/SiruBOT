TOTAL: 17 (HIGH:2 MEDIUM:4 LOW:11)

# 02. bot general 모듈 antislop 감사

- 날짜: 2026-10-22
- 브랜치: chore/antislop-audit
- 범위: `apps/bot/src/modules/general/**`
- 감사 파일 수: 68개 파일 (총 5,616줄), 커맨드 16 · 서브커맨드 3 · 리스너 30 · 인터랙션 핸들러 5 · 전제조건 2 · 유틸 6 · 테스트 6
- 검사 방법: 전체 파일 수동 검토 + 패턴 grep (em dash, R-16 버즈워드, 근거 없는 숫자/보장문, 장식 이모지 주석, 구분선/TODO/단계 내레이션 주석)

---

## Findings

### 1. [HIGH] 커스텀 명령어 목록 문자열에 em dash 사용

- 위치: `apps/bot/src/modules/general/listeners/message/customCommandPrefix.ts:154`
- 규칙: R-02 (하드 게이트, 유저에게 보이는 문자열의 em dash(U+2014) 금지)
- 사유: `!도움말` 출력 줄 사이를 em dash로 연결해 유저 화면에 하드코딩으로 노출합니다.
- 근거:

```ts
.map((command) => `\`${prefix}${command.name}\` — ${command.description || '설명 없음'}`);
```

- 제안: 콤마 또는 `·` 구분자로 교체 (예: `` `${prefix}${name}` · ${desc}` ``).

### 2. [HIGH] presence 없는 멤버의 상태를 online으로 단정 표시

- 위치: `apps/bot/src/modules/general/commands/profile.ts:285` (전달처 `profile.ts:311`)
- 규칙: R-38 (근거 없는 실제처럼 보이는 값 표시, 하드 게이트)
- 사유: 멤버 presence 데이터가 없거나 멤버 조회에 실패하면(위 `profile.ts:227-229`의 catch로 member가 null)도 프로필 카드 렌더러에 `online`을 확정값으로 넘겨, 관측하지 못한 상태를 사실처럼 보여줍니다.
- 근거:

```ts
const derivedStatus = (member?.presence?.status ?? 'online') as 'online' | 'idle' | 'dnd' | 'invisible';
// ...
status: derivedStatus,
```

- 제안: presence가 없으면 상태 표시를 생략하거나 "알 수 없음" 같은 정직한 대체값을 쓰세요.

### 3. [MEDIUM] 서버 나머지 텍스트 채널 수집 블록이 3개 파일에 동일 복제

- 위치: `apps/bot/src/modules/general/commands/tts.ts:92`, `apps/bot/src/modules/general/commands/chatTools.ts:122`, `apps/bot/src/modules/general/commands/chatSettings.ts:94`
- 규칙: AI 슬롭 분류 (파일 간 중복 로직)
- 사유: 동일한 필터 조건이 3곳에 복사돼 있어 채널 타입 정책이 바뀌면 한쪽만 갱신됩니다.
- 근거:

```ts
// tts.ts:95 = chatTools.ts:125 동일 문자열, chatSettings.ts:97-98도 같은 조건
channel.id !== interaction.channelId && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
```

- 제안: `guildService` 쪽에 공용 헬퍼로 모으고 3곳에서 호출하세요.

### 4. [MEDIUM] 커스텀 명령어 실행 컨텍스트와 오류 안내가 접두사/슬래시 두 리스너에 중복

- 위치: `apps/bot/src/modules/general/listeners/message/customCommandPrefix.ts:82`와 `apps/bot/src/modules/general/listeners/interaction/customCommandSlash.ts:54` (오류 문자열: prefix `:110`/`:120`/`:133` vs slash `:81`/`:84`/`:87`)
- 규칙: AI 슬롭 분류 (파일 간 중복 로직)
- 사유: `member`/`guild` 어댑터 블록(`hasRole`/`addRole`/`removeRole`/`botTopRolePosition`/`botCanManageRoles`/`getRole`)과 실패 안내 문구가 사실상 동일하게 두 번 작성돼 있습니다.
- 근거:

```ts
// customCommandPrefix.ts:120 / customCommandSlash.ts:84 동일 문자열
`-# ${emoji('error')} 이 명령어를 실행할 권한이 없어요.`
```

- 제안: 컨텍스트 어댑터 빌더와 3종 오류 메시지를 공용 함수로 추출해 두 진입점이 공유하게 하세요.

### 5. [MEDIUM] 채널 턴 확보, 유저 턴 소모, 해제 게이팅이 두 진입점에 중복

- 위치: `apps/bot/src/modules/general/commands/chat.ts:102`, `apps/bot/src/modules/general/listeners/message/mentionReply.ts:61`
- 규칙: AI 슬롭 분류 (파일 간 중복 로직)
- 사유: `acquireChannelTurn` → `tryConsumeUserTurn` → `finally releaseChannelTurn` 순서와 그 이유를 적은 주석까지 두 곳에 똑같이 복제돼, 한쪽 게이팅 규칙만 바뀌면 불변식이 깨집니다.
- 근거:

```ts
// chat.ts:102 · mentionReply.ts:61 동일 조건
if (!acquireChannelTurn(channelId)) {
```

- 제안: 게이팅과 안내 문구를 `aiChatService`의 공용 함수로 묶고, `runChatTurnToScreen`처럼 한곳에서 검증하세요.

### 6. [MEDIUM] 디버그 로그 1줄을 위한 단일 사용 허퍼 5개 체인

- 위치: `apps/bot/src/modules/general/listeners/commands/chatInputCommands/chatInputCommandSuccess.ts:34`
- 규칙: AI 슬롭 분류 (불필요한 래퍼, 단일 사용 허퍼 레이어)
- 사유: `getSuccessLoggerData`와 그 안의 `getShardInfo`/`getCommandInfo`/`getAuthorInfo`/`getGuildInfo`가 각각 정확히 한 번씩만 호출되는 1줄짜리 감싸기 함수로, 읽기 좋은 디버그 로그 한 줄을 5개 함수로 분해했습니다.
- 근거:

```ts
function getShardInfo(id: number) {
	return `[${cyan(id.toString())}]`;
}
```

- 제안: `logSuccessCommand` 안에 포맷팅을 직접 넣고 중간 허퍼 4개를 제거하세요.

### 7. [LOW] 이벤트가 등록되지 않아 도달할 수 없는 else 분기

- 위치: `apps/bot/src/modules/general/listeners/commands/chatInputCommands/chatInputCommandSuccess.ts:26`
- 규칙: AI 슬롭 분류 (도달 불가능 분기)
- 사유: 리스너는 `Events.ChatInputCommandSuccess`만 등록하는데, `payload.message` 경로를 위한 else 분기와 `ContextMenuCommandSuccessPayload`/`MessageCommandSuccessPayload` 타입이 살아남아 있습니다.
- 근거:

```ts
} else {
	successLoggerData = getSuccessLoggerData(payload.message.guild, payload.message.author, payload.command);
}
```

- 제안: 미사용 이벤트 경로와 타입을 제거하거나 해당 이벤트 리스너를 실제로 등록하세요.

### 8. [LOW] 테스트 파일 안의 미사용 목과 no-op 문

- 위치: `apps/bot/src/modules/general/listeners/interaction/customCommandSlash.test.ts:69` (목 정의는 `:6`)
- 규칙: AI 슬롭 분류 (죽은 코드)
- 사유: hoisted된 `findMany` 목은 파일 어디서도 쓰이지 않고, `void findMany;` 문은 결과를 버리는 무의미한 실행입니다.
- 근거:

```ts
beforeEach(() => {
	vi.clearAllMocks();
	void findMany;
```

- 제안: `findMany` 목과 `void findMany;`를 함께 삭제하세요.

### 9. [LOW] ephemeral 판정 식이 두 에러 리스너에 동일 복제

- 위치: `apps/bot/src/modules/general/listeners/commands/chatInputCommands/chatInputCommandError.ts:36`, `apps/bot/src/modules/general/listeners/interactionHandlerError.ts:34`
- 규칙: AI 슬롭 분류 (파일 간 중복 로직, 경미)
- 사유: 140자짜리 조건식이 한 글자도 다르지 않게 두 번 작성돼 있습니다.
- 근거:

```ts
const ephemeral = typeof context === 'object' && context !== null && 'ephemeral' in context ? Boolean(context.ephemeral) : !userError;
```

- 제안: UserError의 ephemeral 판정을 공용 헬퍼로 한곳에 두세요.

### 10. [LOW] 입장/퇴장 리스너 본문 거의 전부 중복

- 위치: `apps/bot/src/modules/general/listeners/member/guildMemberAdd.ts:16`, `apps/bot/src/modules/general/listeners/member/guildMemberRemove.ts:17`
- 규칙: AI 슬롭 분류 (파일 간 중복 로직, 경미)
- 사유: `dispatch` 호출 객체와 try/catch 구조가 같고 `'welcome'`/`'goodbye'`와 로그 문구만 다릅니다.
- 근거:

```ts
await container.memberGreetingService.dispatch(guild, 'welcome', {
	user: { id: member.id, username: member.user?.username ?? member.displayName },
```

- 제안: 공용 dispatch 헬퍼를 두고 이벤트 종류와 라벨만 넘기세요.

### 11. [LOW] 업타임을 시/일/시/분으로 분해하는 계산이 두 파일에 중복

- 위치: `apps/bot/src/modules/general/subcommands/bot.ts:27`, `apps/bot/src/modules/general/commands/development/nodes.ts:55`
- 규칙: AI 슬롭 분류 (파일 간 중복 로직, 경미)
- 사유: `uptimeSeconds`/`days`/`hours`/`minutes` 상수 4줄이 동일하게 복제돼 있습니다. 같은 모듈 `clientReady.ts:60`은 이미 `formatTime` 유틸을 씁니다.
- 근거:

```ts
const days = Math.floor(uptimeSeconds / 86400);
const hours = Math.floor((uptimeSeconds % 86400) / 3600);
const minutes = Math.floor((uptimeSeconds % 3600) / 60);
```

- 제안: 공용 시간 포맷 헬퍼로 합치세요.

### 12. [LOW] 코드를 그대로 다시 말하는 섹션 라벨 주석

- 위치: `apps/bot/src/modules/general/commands/development/shards.ts:55`
- 규칙: antislop-code 체크리스트 (빈 라벨/재서술)
- 사유: 아래 3줄(서버 수, 플레이어 수, 메모리)이 이미 말하는 내용을 영문 라벨로 한 번 더 반복합니다.
- 근거:

```ts
// Guild & memory stats
lines.push(`${emoji('house')} **서버**: ${client.guilds.cache.size}개`);
```

- 제안: 코드가 이미 말하는 라벨이므로 삭제하세요.

### 13. [LOW] 조건문을 그대로 번역한 주석

- 위치: `apps/bot/src/modules/general/listeners/guild/guildDeleted.ts:12`
- 규칙: antislop-code 체크리스트 (재서술)
- 사유: 바로 아래 `if (this.container.audio)`와 `player.destroy()`가 이미 말하는 동작을 영문으로 반복합니다.
- 근거:

```ts
// Stop and destroy audio player if it exists
if (this.container.audio) {
```

- 제안: 제거하세요. 남길 정보라면 "왜 여기서 정리하는지"만 남기면 됩니다.

### 14. [LOW] 조건문을 그대로 번역한 주석

- 위치: `apps/bot/src/modules/general/listeners/commands/message/messageDeleted.ts:17`
- 규칙: antislop-code 체크리스트 (재서술)
- 사유: `if (!this.container.audio) return;`가 이미 말하는 조건을 한 번 더 설명합니다.
- 근거:

```ts
// Ignore audio is not initialized
if (!this.container.audio) return;
```

- 제안: 제거하세요.

### 15. [LOW] 분기 조건을 그대로 반복한 주석

- 위치: `apps/bot/src/modules/general/listeners/commands/chatInputCommands/chatInputCommandError.ts:14`
- 규칙: antislop-code 체크리스트 (재서술)
- 사유: `if (!userError)`가 이미 말하는 분류를 영문으로 한 번 더 적었습니다.
- 근거:

```ts
// send actual error to sentry
if (!userError) {
```

- 제안: 제거하거나, UserError를 제외하는 이유(의도된 안내라 오류로 세지 않는다)만 남기세요.

### 16. [LOW] 블록 동작을 반복만 하는 라벨 주석

- 위치: `apps/bot/src/modules/general/listeners/interactionHandlerError.ts:30`
- 규칙: antislop-code 체크리스트 (빈 라벨)
- 사유: 아래 try/블록이 "에러 메시지를 보낸다"는 사실 외에 새로 주는 정보가 없습니다.
- 근거:

```ts
// 사용자에게 에러 메시지 전달
if (interaction.isRepliable()) {
```

- 제안: 삭제하세요. 대신 ephemeral 판정과 followUp 분기 같은 실제 규칙 위 주석으로 대체할 수 있습니다.

### 17. [LOW] 핵심 순수 함수에 테스트 없음 (참고용)

- 위치: `apps/bot/src/modules/general/utils/chatView.ts:17` (미테스트: `embedFix.ts`, `profile.ts`, `help.ts`의 분할/타이핑 로직 포함)
- 규칙: AI 슬롭 분류 (테스트 누락, 참고용 LOW)
- 사유: 68개 파일 중 테스트는 6개뿐이고, 코드블록/줄 경계를 보존하며 글을 자르는 `splitTextForDisplay` 같은 경계 조건 많은 순수 함수가 검증되지 않습니다.
- 근거:

```ts
function splitTextForDisplay(text: string): string[] {
	if (text.length <= FINAL_SEGMENT_LIMIT) return [text];
```

- 제안: 4000자 근처 경계, 코드펜스 중간, 4청크 초과 잘림 케이스를 먼저 추가하세요.

---

## 검사했지만 문제 없는 항목

- R-02 em dash: 범위 전체 grep 결과 유저 대상 문자열에서는 1건(1번)만 발견. 나머지 사용은 모두 한국어 코드 주석이라 해당 규칙 대상 아님.
- R-16 버즈워드(원활한/혁신적/차세대/Seamless/Ultimate/강력한/획기적 등): 유저 문자열 0건. `속도`는 TTS 기능 용어로 사용 적절.
- R-15 범용 CTA: `초대하기`, `/재생으로 첫 곡을 신청해 보세요`, `대시보드에서 만들 수 있어요` 등 모두 구체적 행동 지시.
- R-17/R-36 근거 없는 숫자: 날씨는 `Open-Meteo 기준`(weather.ts:70), 택배는 `tracker.delivery 기준`(delivery.ts:33), 청취 시간은 `(최근 500건 기준)`(profile.ts:393)으로 출처·샘플 한계를 명시. 가짜 통계·보장 문구(무제한, 100%, 절대 보장) 0건.
- R-18 후기 섹션: 해당 없음. 유령 인물, 가짜 출처 0건.
- 챗봇 클로저(도움이 되셨나요, 궁금한 점은 말씀하세요 등): 0건.
- antislop-code 구분선/ALL CAPS 박스 헤더, 단계 내레이션(Step 1), 빈 라벨(TODO/FIXME/HACK), 시그니처 반복 JSDoc, 주석용 장식 이모지(✅/🚀): 0건. (`clientReady.ts:124`의 🚀는 코드 주석이 아닌 콘솔 시작 배너 문자열.)
- 파일 헤더 주석(embedFix, countingChannel, customCommandPrefix, messageQuote, ttsView 등): 프로토콜 계약, 권한·보안 규칙(비공개 채널 인용 금지), 레이스 방지, 워크어라운드를 설명하는 보존 대상으로 판단해 플래그하지 않음.
- R-26 죽은 컨트롤: `chatcancel:`, `tts:panel:*`, `tts:modal:*`, `eval-modal` 커스텀 ID와 `원문 보기`/`초대하기` 링크 버튼 전부 해당 핸들러가 처리됨.
- 미사용 export/imports: 범위 내 export(`sendComponent`, `INFO_SUBCOMMANDS`, `runChatTurnToScreen`, `buildTtsPanel` 등) 전부 호출처 확인. 잘못된 레이어 import나 모듈 경계 위반은 확인되지 않음.
- R-03 모바일 레이아웃, R-25 대비비, R-32 키보드 접근: Discord 메시지 렌더링이라 해당 없음(웹 UI 규칙).
- 테스트 품질: 존재하는 6개 테스트는 레이스/직렬화, 커스텀 Id 계약, ephemeral 분기, 경계값을 실제처럼 검증해 상태였음.
