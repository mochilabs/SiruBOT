# 🎵 시루봇 (SiruBOT)

Discord 서버를 위한 음악 봇입니다. Lavalink 기반으로 안정적인 음악 스트리밍과 다양한 편의 기능을 제공합니다.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)
[![Discord.js](https://img.shields.io/badge/discord.js-v14.22.1-blue.svg)](https://discord.js.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue.svg)](https://www.typescriptlang.org/)

---

## ✨ 주요 기능

### 🎵 음악 재생
- **다중 플랫폼 지원**: YouTube, Spotify, SoundCloud
- **플레이리스트 재생**: 대기열 관리 및 자동 재생
- **고음질 스트리밍**: Lavalink 기반 안정적인 음악 스트리밍
- **실시간 재생 컨트롤러**: Discord Components V2를 활용한 직관적인 UI

### 🎛️ 재생 제어
- **투표 스킵 시스템**: 공정한 곡 건너뛰기
- **반복 재생**: 한 곡 반복, 전체 반복, 끄기
- **볼륨 조절**: 0-150% 사이 자유로운 조절
- **자동 추천곡**: 관련 동영상 자동 재생

### 오토믹스

- `/믹서 전환 방식:AutoMix` (`/설정 audio 전환`도 동일)에서 DJ/관리자가 설정해요. 대시보드의 음악 설정에서도 변경할 수 있어요.
- `방식(mode)`은 필수이고, `최대템포변경(max-tempo-change)`은 0~12% (기본 6%), `최소신뢰도(min-confidence)`는 0~1 (기본 0.30)이에요. AutoMix 모드에서 선택 옵션을 생략하면 저장된 값을 유지해요.
- 기본값은 꺼짐이에요. AutoMix로 켜면 크로스페이드도 함께 켜져요. 크로스페이드로 바꾸면 오토믹스는 꺼지고, 끄면 둘 다 꺼져요.
- BPM 분석과 비트매치를 지원하는 Lavalink mixer 플러그인이 필요해요. 템포 차이가 크거나 분석 신뢰도가 낮은 곡, 스트림 등은 일반 크로스페이드로 전환해요.
- 설정은 서버별로 저장하고 재생 연결 시 복원해요. `/믹서 상태`에서 저장된 설정과 서버의 적용 상태를 확인하세요. 적용에 실패한 경우 명령어가 저장 여부와 실패를 알려줘요.
- 배포 전에 Prisma 마이그레이션을 적용하고 슬래시 명령어를 다시 등록하세요. 실제 Discord 음성 연결에서의 전환은 별도 확인이 필요해요.

### ⚙️ 고급 기능
- **SponsorBlock 통합**: 자동 광고 구간 건너뛰기 (실험적)
- **DJ 역할 시스템**: 특정 역할에 권한 부여
- **Redis 캐싱**: 빠른 응답 속도와 데이터 복구
- **플레이어 Resume**: 봇 재시작 시 재생 상태 복구
- **재생 통계 추적**: Prisma를 통한 트랙 재생 횟수 기록

---

## 🛠️ 기술 스택

### Core
- **Runtime**: Node.js (TypeScript)
- **Discord Library**: [Discord.js](https://discord.js.org/) v14
- **Bot Framework**: [Sapphire Framework](https://www.sapphirejs.dev/) v5
- **Music Engine**: [Lavalink](https://lavalink.dev/) v4 (lavalink-client)

### Database & Cache
- **Database**: PostgreSQL (Prisma ORM)
- **Cache**: Redis (Bull Cache 패턴)
- **In-Memory Cache**: Custom MemoryCache implementation

### Infrastructure
- **Monorepo**: Turborepo
- **Build Tool**: tsup (esbuild wrapper)
- **Package Manager**: Yarn 4
- **Logging**: tslog

---

## 📦 프로젝트 구조

```
apps/bot/
├── src/
│   ├── core/                  # 핵심 시스템
│   │   ├── botApplication.ts  # 메인 봇 클래스 (서비스 조립, Redis 구독 서비스 레지스트리)
│   │   ├── bootstrap.ts       # 부트스트랩 단계 목록 (shardIdentity, botClient, healthServer, lavalinkSetup, shutdown 등을 조립)
│   │   ├── config.ts          # 환경 변수 → 타입드 Config (getConfig)
│   │   ├── pieceRoots.ts      # Sapphire 피스 루트 목록 (PIECE_ROOTS)
│   │   └── logger.ts          # 로깅 시스템
│   │
│   ├── modules/               # 기능 모듈
│   │   ├── audio/            # 음악 재생 모듈
│   │   │   ├── commands/     # 음악 관련 명령어
│   │   │   ├── lavalink/     # Lavalink 통합
│   │   │   │   ├── handlers/ # 이벤트 핸들러
│   │   │   │   ├── player/   # 플레이어 관리
│   │   │   │   └── queue/    # 큐 관리
│   │   │   ├── preconditions/ # 권한 체크
│   │   │   ├── view/         # UI 컴포넌트
│   │   │   └── managers/     # 비즈니스 로직
│   │   │
│   │   └── general/          # 일반 기능 모듈
│   │       ├── commands/     # 일반 명령어
│   │       └── listeners/    # 이벤트 리스너
│   │
│   ├── features/              # 기능 폴더 (tickets, role-panels, temp-voice, games, custom-commands, greeting, music)
│   │   └── <name>/           # index.ts · application/ (유스케이스) · discord/{commands,listeners,interaction-handlers,views} · inbound/ (Redis 응답기)
│   │
│   ├── services/             # 서비스 레이어
│   │   ├── guildService.ts   # 길드 설정 관리
│   │   └── trackService.ts   # 트랙 통계 관리
│   │
│   └── types/                # 타입 정의
│       └── global.d.ts       # 글로벌 타입 확장
│
├── tests/                    # 테스트 (TODO)
└── package.json
```

---

## 🚀 시작하기

### 필수 요구사항

- **Node.js**: v20 이상
- **Yarn**: 4.x
- **PostgreSQL**: 14 이상
- **Redis**: 7 이상
- **Lavalink Server**: v4 이상

### 설치

1. **저장소 클론**
   ```bash
   git clone https://github.com/your-org/SiruBOT.git
   cd SiruBOT
   ```

2. **의존성 설치**
   ```bash
   yarn install
   ```

3. **환경 변수 설정**

   `.env` 파일을 프로젝트 루트에 생성:
   ```env
   # Discord
   DISCORD_TOKEN=your_discord_bot_token
   OWNERS=USER_ID_1 USER_ID_2

   # Database
   DATABASE_URL=postgresql://user:password@localhost:5432/sirubot

   # Redis
   REDIS_URL=redis://localhost:6379

   # Lavalink
   LAVALINK_HOSTS=[{"id":"main","host":"localhost","port":2333,"authorization":"youshallnotpass","secure":false}]

   # Logging
   LOGLEVEL=2

   # Optional
   BOT_ACTIVITY=음악 재생 중
   DEV_GUILD_IDS=GUILD_ID_1 GUILD_ID_2
   ```

4. **데이터베이스 마이그레이션**
   ```bash
   yarn migrate:dev
   ```

5. **빌드**
   ```bash
   yarn build
   ```

6. **실행**
   ```bash
   yarn start
   ```

### 개발 모드

```bash
# Watch 모드로 자동 재빌드
yarn watch

# 다른 터미널에서 실행
yarn start
```

---

## 🏗️ 개발 가이드

### 새로운 명령어 추가

1. `src/modules/audio/commands/` 또는 `src/modules/general/commands/`에 파일 생성 (기능 폴더의 명령어는 `src/features/<name>/discord/commands/`)
2. Sapphire의 `Command` 클래스 확장
3. `@ApplyOptions` 데코레이터로 설정 정의

```typescript
import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ChatInputCommandInteraction } from 'discord.js';

@ApplyOptions<Command.Options>({
  name: 'example',
  description: 'Example command',
  preconditions: ['VoiceConnected']
})
export class ExampleCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) => {
      builder
        .setName(this.name)
        .setDescription(this.description);
    });
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.reply('Hello!');
  }
}
```

### Precondition 추가

1. `src/modules/audio/preconditions/`에 파일 생성
2. `AllFlowsPrecondition` 확장
3. `global.d.ts`에 타입 추가

```typescript
import { AllFlowsPrecondition } from '@sapphire/framework';
import { CommandInteraction } from 'discord.js';

export class MyPrecondition extends AllFlowsPrecondition {
  public override chatInputRun(interaction: CommandInteraction) {
    // 조건 체크
    if (condition) return this.ok();
    return this.error({ message: 'Error message' });
  }
}
```

### 로깅

```typescript
// 컨테이너에서 로거 사용
this.container.logger.info('정보 메시지');
this.container.logger.error('에러 메시지', error);
this.container.logger.debug('디버그 메시지');
```

---

## 🔧 트러블슈팅

### Lavalink 연결 실패

1. Lavalink 서버가 실행 중인지 확인
2. `LAVALINK_HOSTS` 환경 변수 확인
3. 방화벽/포트 설정 확인

### Redis 연결 오류

- Redis 서버 상태 확인
- `REDIS_URL` 형식 확인
- 봇은 Redis 연결 실패 시 메모리 캐시로 폴백됨

### 데이터베이스 마이그레이션 실패

```bash
# 스키마 재동기화
yarn prisma generate
yarn migrate:dev --name init
```

### 봇이 응답하지 않음

1. 봇 토큰 확인
2. 필요한 Intent 권한 확인
3. 로그 확인: `LOGLEVEL=0` 설정 후 재시작

---

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### 코드 스타일

```bash
# Prettier로 포맷팅
yarn lint:fix

# 타입 체크
yarn typecheck
```

---

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](../../LICENSE) 파일을 참조하세요.

---

## 🙏 감사의 말

- [Sapphire Framework](https://www.sapphirejs.dev/) - 강력한 Discord.js 프레임워크
- [Lavalink](https://lavalink.dev/) - 고성능 음악 스트리밍
- [Discord.js](https://discord.js.org/) - Discord API 래퍼

---

## 📧 연락처

문의사항이나 제안사항이 있으시면 이슈를 열어주세요!

---

<div align="center">
Made with ❤️ by SiruBOT Team
</div>

### 전환 방식과 현재 BPM

`/믹서 전환 방식:끄기|크로스페이드|AutoMix` (`/설정 audio 전환`도 동일)으로 전환 방식을 선택해요. AutoMix를 고르면 `최대템포변경`·`최소신뢰도`도 함께 조절할 수 있어요. 전환 방식은 기존 두 설정 플래그를 한 번에 저장하므로 새 DB 마이그레이션이 필요 없고 갭리스 설정은 바꾸지 않아요.

컨트롤러 하단에는 믹서가 반환한 현재 곡 BPM을 소수 첫째 자리까지 표시해요. `GET /mixer/state`의 `currentTrackBpmIdentifier`가 표시 중인 확정 트랙과 일치해야 하며, 분석 없음·구형 서버·조회 실패 때는 숨겨요. UI는 조회를 기다리지 않고, 플레이어별 최대 5초마다 한 번 조회하며 요청 제한은 750ms예요. 조회 결과의 BPM이 바뀌면 컨트롤러를 한 번 갱신하므로 일시정지 중에도 분석 값이 나타나요.

AutoMix가 켜진 경우 다음 대기열 대상이 바뀔 때 `adaptiveTransitionsSupported: true` 서버에만 `POST /mixer/analyze {guildId,encodedTrack}`를 보내 캐시를 미리 준비해요. 이 요청은 큐 슬롯·epoch·arming을 변경하거나 기다리게 하지 않으며, 서버가 바쁘거나 요청이 실패하면 기존 JIT 분석이 처리해요.

현재 재생 경로는 임의 플레이리스트도 같은 방식으로 큐에 넣고 앨범 연속 재생 의도를 저장하지 않아요. 앨범명 추정으로 자동 보존하지 않으며 일반 재생에서는 `preserveTransition`도 보내지 않아요. 내부 `arm` 호출은 명시적인 `preserveTransition` 옵션을 전달할 수 있지만 앨범 여부를 자동 추정하지 않아요. 앨범을 원래 순서대로 겹침 없이 듣고 싶으면 전환 방식을 끄고 갭리스를 켜세요. 라이브 Discord 음성 재생 검증은 별도로 필요해요.
