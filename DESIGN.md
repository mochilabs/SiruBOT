# SiruBOT 디자인 가이드 (DESIGN.md)

> 시루봇(SiruBOT)의 브랜드 정체성, 시각 언어, 인터랙션 및 antislop 디자인 지침서입니다.

---

## 1. 정체성 & 개성 (Identity & Personality)

- **서비스 정의**: 디스코드 고음질 음악 스트리밍 및 서버 유틸리티 봇 & 웹 대시보드
- **브랜드 페르소나**: '시루' — 따뜻하고 쫄깃한 시루떡처럼 친근하고 포근하며, 유쾌하고 믿음직한 음악 친구
- **보이스 앤 톤 (Voice & Tone)**:
  - 친근하고 부드러운 경어체 ("~해요", "~해드려요", "~기억해둘게!")
  - 딱딱한 기술 용어나 기계적 응답 대신 직관적이고 다정한 안내
  - 과장된 마케팅 수식어(AI 기반의 혁신적인 등) 지양, 실제 제공하는 편의와 즐거움에 집중

---

## 2. 디자인 다이얼 (Antislop Dials)

```text
Dial: ENERGY 2 / RHYTHM 2 / MOTION 2
```

- **ENERGY 2 (Balanced)**: 포근하고 활기찬 디스코드 커뮤니티 감성을 담되, 과도한 네온/글로우 남발 없이 정돈된 구조
- **RHYTHM 2 (Balanced)**: 대시보드 및 랜딩의 기능적 흐름(플레이어, 서버 관리, 믹서, 명령어)에 따른 자연스러운 레이아웃 변주
- **MOTION 2 (Balanced)**: Framer Motion 기반의 부드러운 스프링 반응(Spring transition), 타이핑 텍스트 및 통계 카운트업 적용 (`prefers-reduced-motion` 필수 존중)

---

## 3. 컬러 시스템 (Color Palette)

시루떡의 팥/인절미와 달콤한 딸기 모찌를 연상시키는 웜톤 로즈 & 플럼 컬러 팔레트입니다.

### 핵심 브랜드 컬러
- **Primary (시루 핑크)**: `#ff85c1` (주요 버튼, 활성 상태, 하이라이트)
- **Primary Text (로즈 텍스트 토큰)**: `#a3416f`
  - *라이트 모드 배경(`#fef5f9`, `#ffffff`) 대비 5.5:1 이상 WCAG AA 준수 전용 텍스트 컬러*
- **Secondary (인절미 골드)**: `#d4a574` (배경 도형 및 포인트 장식 전용, 텍스트 배경 사용 금지)
- **Bot Default Embed**: `0xffdaff` (`DEFAULT_COLOR` - 디스코드 임베드 대표 색상)

### 테마별 시맨틱 토큰

| 구분 | 라이트 모드 (Light) | 다크 모드 (Dark) | 용도 및 의미 |
| :--- | :--- | :--- | :--- |
| **Background** | `#fef5f9` (웜 로즈 화이트) | `#1a0e12` (딥 플럼 블랙) | 전체 뷰포트 배경 |
| **Foreground** | `#2d1b1e` (다크 코코아) | `#fce7f3` (소프트 로즈 핑크) | 기본 본문 텍스트 |
| **Card / Surface** | `#ffffff` | `#2d1b1e` | 패널, 카드, 모달 표면 |
| **Muted** | `#f9eff5` | `#3d2328` | 비활성 영역, 서브 배경 |
| **Muted Text** | `#7e5e6a` | `#c9a8b5` | 보조 설명, 라벨 텍스트 |
| **Border** | `#f0d4e3` | `#3d2328` | 구분선, 카드 테두리 |
| **Border Strong** | `#b4779b` | `#8f5c69` | 활성 컨트롤 테두리 (WCAG 비텍스트 대비 3.0:1+ 만족) |
| **Ring (Focus)** | `#a3416f` | `#ff85c1` | 키보드 포커스 링 (라이트 5.54:1+, 다크 8.41:1+ 만족) |
| **Accent** | `#ffe4f0` | `#4d2a35` | 칩, 태그, 선택된 아이템 배경 |

### 디스코드 컴포넌트 연동 토큰
- 라이트: Embed `#f2f3f5`, Text `#313338`, Text Muted `#5c5e66`, BG `#ebedef`
- 다크: Embed `#2b2d31`, Text `#dbdee1`, Text Muted `#a3a9b2`, BG `#35373c`

---

## 4. 타이포그래피 (Typography)

- **기본 폰트**: `Pretendard Variable`, `Pretendard`, sans-serif
  - 한글과 영문 가독성이 최적화된 모던 고딕
- **숫자 및 메트릭**: `tabular-nums` (음악 재생 시간, 셔플 트랙 수, 핑/샤드 통계)
- **코드 및 명령어 토큰**: `bg-muted px-1.5 py-0.5 text-2xs font-bold rounded-sm` (`/노래`, `/셔플` 등)

---

## 5. UI 컴포넌트 & 구조 규칙

- **형태 및 라운딩**:
  - 버튼/컨트롤: `rounded-control` (약 8~10px의 부드러운 곡률, 모든 요소 알약형 pill 금지)
  - 카드 및 패널: 일관된 반경과 은은한 보더 라인 (`border border-border`)
- **버튼 및 인터랙션**:
  - 메인 액션: Primary 배경에 흰색 텍스트, 호버 시 명도 전환
  - 보조 링크: 은은한 surface 배경과 명확한 포커스 링 (`focus-visible:ring-2 focus-visible:ring-ring`, WCAG 2.1 SC 1.4.11 비텍스트 대비 3.0:1 준수)
- **모바일 뷰포트 & 터치 타깃**:
  - 모바일 반응형 높이는 `100vh` 대신 동적 뷰포트 단위(`100svh`, `100dvh`, `min-h-svh`) 사용
  - 터치 디바이스 탭 타깃 `pointer-coarse:min-h-11` (44px) 준수
- **디스코드 V2 호환성**:
  - 봇 메시지는 Discord Components V2 (`ContainerBuilder`, `TextDisplayBuilder`) 규격 준수
