# 디스코드 봇의 샤드를 관리하고 모니터링하는 서버입니다.

## 기능

- 🔄 샤드 상태 실시간 모니터링
- 📊 샤드별 통계 정보 수집
- 🌐 WebSocket을 통한 실시간 통신
- 📡 RESTful API 제공
- ❤️ 헬스체크 및 하트비트 관리

## 설치 및 실행

```bash
# 의존성 설치
yarn install

# 개발 모드로 실행
yarn watch

# 빌드
yarn build

# 프로덕션 실행
node dist/index.js
```

## 환경 변수

```bash
# .env 파일 생성
PORT=3001                    # 서버 포트
LOG_LEVEL=info              # 로그 레벨
GUILD_PER_SHARD=1000        # 샤드당 길드 수
```

## API 엔드포인트

### 헬스체크
```
GET /health
```

### WebSocket
```
WS /ws
```

## 아키텍처

```
┌─────────────────┐    WebSocket    ┌─────────────────┐
│   Bot Shard 0   │◄──────────────►│                 │
├─────────────────┤                 │  Shard Manager  │
│   Bot Shard 1   │◄──────────────►│     Server      │
├─────────────────┤                 │                 │
│   Bot Shard 2   │◄──────────────►│                 │
└─────────────────┘                 └─────────────────┘
                                            ▲
                                            │ HTTP API
                                            ▼
                                    ┌─────────────────┐
                                    │   Dashboard     │
                                    │   Monitoring    │
                                    └─────────────────┘
```
