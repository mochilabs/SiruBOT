TOTAL: 7 (HIGH:0 MEDIUM:2 LOW:5)

# 18. packages/prisma (스키마·마이그레이션)

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 범위: `packages/prisma/src/schema.prisma`, `packages/prisma/src/migrations/**`, `packages/prisma/prisma.config.ts`, `packages/prisma/package.json`, `packages/prisma/tsconfig.json`
- 감사 파일 수: 32개 (스키마 1, 마이그레이션 SQL 27, migration_lock.toml 1, 설정 파일 3)
- 판정 기준 메모: copy 규칙(R-02, R-16, R-36, R-38)은 감사 기준 3에 따라 스키마의 유저 대상 문자열에만 적용했다. 개발자용 주석에 쓰인 연결용 em dash(U+2014)는 유저 대상 텍스트가 아니라 범위 밖으로 보고 finding으로 잡지 않았다. UI 계열 Purpose-Gate 규칙(R-01, R-04, R-10 등)은 이 범위에 해당 표현이 없다.

## Findings

### 1. [MEDIUM] CustomCommand의 guildId 단일 인덱스가 복합 유니크와 중복
- 위치: `packages/prisma/src/schema.prisma:92` (91행 유니크와 짝)
- 규칙: 감사 기준 2 (중복 인덱스)
- 사유: `@@unique([guildId, name])`의 선두 컬럼이 guildId라 같은 쿼리를 커버하므로 단일 인덱스는 쓰기 비용과 저장량만 추가한다.
- 근거:

```prisma
  @@unique([guildId, name])
  @@index([guildId])
```

- 제안: 스키마에서 `@@index([guildId])`를 빼고 새 마이그레이션으로 같은 이름 인덱스를 DROP한다 (20261015100000/migration.sql:24 생성분 포함).

### 2. [MEDIUM] PlaylistTrack의 playlistId 단일 인덱스가 복합 유니크와 중복
- 위치: `packages/prisma/src/schema.prisma:222` (221행 유니크와 짝)
- 규칙: 감사 기준 2 (중복 인덱스)
- 사유: `@@unique([playlistId, position])` 선두 컬럼이 playlistId라 단일 인덱스가 같은 범위를 이미 커버한다.
- 근거:

```prisma
  @@unique([playlistId, position])
  @@index([playlistId])
```

- 제안: 스키마에서 `@@index([playlistId])`를 빼고 새 마이그레이션으로 DROP한다 (20261002000000/migration.sql:51 생성분 포함).

### 3. [LOW] 스키마 상단의 prisma init 템플릿 주석이 정보를 주지 않는다
- 위치: `packages/prisma/src/schema.prisma:1` (1~5행)
- 규칙: antislop-code 체크리스트 (코드에 없는 정보를 주지 않는 주석, R-31)
- 사유: 이 스키마에 대한 정보가 없는 서식 문구와 Prisma Accelerate 홍보 링크 5줄이 파일을 연다.
- 근거:

```prisma
// Looking for ways to speed up your queries, or scale easily with your serverless or edge functions?
// Try Prisma Accelerate: https://pris.ly/cli/accelerate-init
```

- 제안: 1~5행을 삭제한다.

### 4. [LOW] 카테고리명만 적은 빈 라벨 주석
- 위치: `packages/prisma/src/schema.prisma:126` (동일 라벨 131행, 146행)
- 규칙: antislop-code (빈 라벨)
- 사유: `// Relations`는 아래 필드가 관계라는 사실을 반복만 하고, `// Statistics`는 createdAt/updatedAt까지 통계로 묶는다.
- 근거:

```prisma
  // Statistics
  totalPlays  Int      @default(0)
  createdAt   DateTime @default(now())
```

- 제안: 라벨을 지우거나, 라벨 대신 각 필드에 사실 정보를 남긴다.

### 5. [LOW] UserToken 필드 주석이 모델 주석과 식별자를 재서술
- 위치: `packages/prisma/src/schema.prisma:158` (같은 블록 156~157행)
- 규칙: antislop-code (재서술, Signature Echo)
- 사유: `accessTokenExpiresAt`이 이미 "access token 만료 시각"이고, 암호화 사실은 153행 모델 주석(AES-256-GCM)에 이미 있다.
- 근거:

```prisma
  refreshToken         String   // 암호화된 refresh token
  accessToken          String   // 암호화된 access token
  accessTokenExpiresAt DateTime // access token 만료 시각
```

- 제안: 158행 주석은 삭제하고, 156~157행은 모델 주석에 이미 있는 암호화 방식을 적거나 주석을 없앤다.

### 6. [LOW] 존재하지 않는 단계를 알리는 마이그레이션 주석
- 위치: `packages/prisma/src/migrations/20261001000000_add_chat_history/migration.sql:1`
- 규칙: antislop-code (단계 내레이션 + 빈 라벨)
- 사유: 이 마이그레이션에는 enum 생성이 없는데 `-- CreateEnum (none)`이라는 단계 표시만 남아 있다.
- 근거:

```sql
-- CreateEnum (none)

-- CreateTable
```

- 제안: 해당 행을 삭제한다.

### 7. [LOW] 스키마 주석이 마이그레이션에 그대로 복붙됐다 (주석 이중 정의)
- 위치: `packages/prisma/src/schema.prisma:62` / `packages/prisma/src/migrations/20261010000000/migration.sql:1`
- 규칙: 감사 기준 2 (주석 이중 정의)
- 사유: 같은 문장이 두 파일에 동일하게 있고, "타입과 동기화" 계약은 스키마가 단일 원본이다. 커스텀 명령어도 schema.prisma:73과 20261015100000/migration.sql:1이 같은 두 사실을 재구성해 적었다.
- 근거:

```prisma
// 멤버 인사: 입장/퇴장 메시지 + 커스텀 카드 이미지 설정. 구조는 packages/utils/src/memberGreeting.ts 타입과 동기화.
```

- 제안: 마이그레이션 쪽에는 새 컬럼의 용도 한 줄만 남기고, 타입 동기화 계약 문장은 스키마에만 둔다.

## 검사했지만 문제 없는 항목

- 마이그레이션 위험성·데이터 보존 주석: `20261004105034/migration.sql:1-6`, `20261005034316/migration.sql:1-6`의 drop column 경고, `20261004104751/migration.sql:1-6`의 UserFavorite 정리와 drift 방지 근거, `20261021120000/migration.sql:1-3`의 인덱스 제거 근거와 컬럼 보유 이유는 모두 보존 대상이라 finding으로 잡지 않았다.
- 3줄 초과 과설명: `schema.prisma:165-168`(GameRecord 4줄)은 각 줄이 목적, game 값, result 값, meta 형태라는 별개 계약이라 보존; `schema.prisma:264-266`(SocialSubscription 3줄)은 한도 이내이며 도메인 소유권과 전송 경로 설명이라 보존.
- 구분선, 장식 이모지, end marker, 모호 TODO: `packages/prisma/src` 전체를 `TODO|FIXME|====|✅|🚀|end of`로 검색해 0건. `20261004104751/migration.sql:2`의 `Note:`는 데이터 보존 설명 블록이라 제외.
- 딱딱/외침 문체: 한국어 주석이 전부 "~해요" 평서체이고 ALL CAPS 배너가 없다. `-- CreateTable`, `-- CreateIndex`, `-- AlterTable` 등은 Prisma가 생성하는 구조 마커라 대상이 아니다.
- 죽은 모델/미사용 필드: 스키마상 명백한 근거를 찾지 못했다. `SocialEventLog.deliveredAt`은 `20261021120000/migration.sql:3`이 "컬럼 자체는 운영 조회용으로 유지"라는 보존 근거를 명시해 제외했다.
- 같은 필드 그룹과 주석의 모델 간 복붙: mode 계약 주석(`schema.prisma:40,43,48,51,54`)은 서로 다른 필드의 허용값을 각각 문서화한 것이라 이중 정의가 아니고, `schema.prisma:270,272`(SocialSubscription)와 `303,305`(SocialEventLog)는 채널 ID와 콘텐츠 ID로 값이 달라 각자 계약을 적은 것이다.
- 유저 대상 문자열의 copy 규칙: `@default("{user}의 방")`(`schema.prisma:35`), `@default("!")`, `@default("off"/"play"/"prefix")`, 마이그레이션 기본값 `'{user}의 방'`, `ARRAY['x','instagram','booth']`에 em dash(U+2014), 바즈워드, 무근거 수치가 없어 R-02/R-16/R-36/R-38에 해당하지 않는다. (주석의 연결용 em dash는 기준 3의 적용 범위 밖이라 여기서 제외, 상단 판정 기준 메모 참조)
- 설정 파일: `prisma.config.ts`(12행), `package.json`, `tsconfig.json`에는 주석이 없고 감사 기준에 해당할 표현이 없다.
- UI Purpose-Gate 규칙(R-01, R-04, R-07, R-09 등): 스키마와 SQL에 해당 표현이 없어 비대상.
