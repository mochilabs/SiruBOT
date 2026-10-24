---
version: 1.0
name: SiruBOT
description: >-
  디스코드 음악 재생과 서버 운영을 위한 봇 및 웹 대시보드.
  시루떡처럼 따뜻하고 친근한 핑크 표면과 마룬 텍스트 아이덴티티.
colors:
  # 현행 CSS(apps/dashboard/src/app/globals.css) 핵심 색상 요약. 기본값은 다크, -light는 라이트.
  primary: "#ffdada"
  primary-foreground: "#3a1a22"
  primary-foreground-light: "#4f1c2a"
  brand: "#f98aa0"
  brand-light: "#ee6f8b"
  primary-control: "#f98aa0"
  primary-control-light: "#ee6f8b"
  ring: "#f98aa0"
  ring-light: "#c4476a"
  background: "#1f1618"
  background-light: "#fff9f9"
  surface-1: "#2b2023"
  surface-1-light: "#ffffff"
  surface-2: "#3a2c30"
  surface-2-light: "#fff0f0"
  foreground: "#fbeeee"
  foreground-light: "#3a2c30"
  bot-embed-default: "#ffdaff"
  bot-ok: "#4299e1"
  bot-warn: "#f56565"
typography:
  sans:
    fontFamily: Pretendard Variable
    fontSize: 1rem
  body:
    fontFamily: Pretendard Variable
    fontSize: 0.875rem
    fontWeight: 500
rounded:
  control-inner: 0.375rem
  control: 0.625rem
  menu: 0.75rem
  card: 1rem
  dialog: 1rem
conventions:
  spacingScalePx: [4, 8, 16, 24, 32]
  minTouchTargetPx: 44
---

# SiruBOT 디자인 시스템 방향

기준일: 2026-10-24

이 문서는 SiruBOT의 브랜드 정체성, 레이아웃 원칙, 사용자 경험 계약을 정의한다.
웹 토큰의 단일 원본은 [`apps/dashboard/src/app/globals.css`](apps/dashboard/src/app/globals.css)이며,
세부 토큰 사양과 컴포넌트 사용 규칙은 [`apps/dashboard/DESIGN.md`](apps/dashboard/DESIGN.md)를 따른다.

## 1. 정체성과 다이얼

- **대상 사용자**: 한국어 Discord 이용자와 서버 관리자. 음악 재생·플레이리스트 관리부터 AI 채팅·소셜 알림·환영 카드·커스텀 명령어까지 한곳에서 설정한다.
- **브랜드 캐릭터**: 시루는 따뜻하고 믿음직한 음악·서버 파트너다. 차가운 네온/보라 기본값 대신 연핑크(`#ffdada`) 표면과 짙은 마룬(`#3a1a22` / `#4f1c2a`) 타이포그래피로 친근함과 가독성을 동시에 확보한다.
- **보이스 & 톤**: 구체적인 한국어 해요체(`~해요`, `~했어요`)를 사용한다. 무엇이 바뀌는지, 실패했을 때 어떤 행동을 해야 하는지 명확히 안내한다. 사용자 노출 문구에는 em dash(`—`)나 막연한 마케팅 수식어를 쓰지 않는다.
- **디자인 다이얼**: `ENERGY 2 / RHYTHM 2 / MOTION 2`
  - **ENERGY 2**: 절제된 불투명 표면 위에 핵심 CTA와 상태 변화에만 포인트 컬러(`primary-control`)를 집중한다.
  - **RHYTHM 2**: 랜딩은 교차 데모와 명령어 보드로 리듬을 주고, 대시보드 작업 화면은 일관된 그리드와 카드 간격으로 예측 가능성을 높인다.
  - **MOTION 2**: 스크롤 리빌과 상태 전환에만 목적 있는 모션을 부여하고, `prefers-reduced-motion: reduce` 환경에서는 즉시 정지한다.
- **테마**: 다크 기본(`#1f1618`)과 라이트(`#fff9f9`) 전환을 모두 지원하며, 두 테마 모두 WCAG 2.1 AA 대비(일반 텍스트 4.5:1, 큰 텍스트·비텍스트 경계 3:1)를 만족해야 한다.

## 2. 핵심 시각 결정과 이유 (R-31)

| 영역 | 결정 | 이유 |
| --- | --- | --- |
| **컬러 계층** | 연핑크 표면(`primary`), 중립 배경 위 강조 텍스트(`primary-text`), 솔리드 액션(`primary-control` + `primary-control-text`) 분리 | 밝은 브랜드 색을 텍스트에 그대로 쓰면 라이트 모드 대비가 깨지므로, 표면·텍스트·액션 역할을 토큰으로 분리해 AA 대비를 보장한다. |
| **표면 구조** | 유리 효과(backdrop-blur) 남용 대신 불투명 3단계 표면(`surface-1` 패널, `surface-2` 내부 그룹, `surface-3` 플로팅/호버) 사용 | 카드 안의 서브 섹션과 입력 영역을 그림자나 테두리 남발 없이 명도 차이만으로 정돈한다. |
| **컨트롤 경계** | 입력·보조 버튼에 외곽 border 대신 `shadow-control-boundary`(`inset 0 0 0 1px var(--border-strong)`) 적용 | 레이아웃 박스 크기에 영향을 주지 않으면서 라이트/다크 모두에서 3:1 비텍스트 경계 대비(SC 1.4.11)를 유지한다. |
| **반경 체계** | 역할별 반경 토큰(`rounded-control` 10px, `rounded-menu` 12px, `rounded-card` 16px, `rounded-dialog` 16px) 고정 | 버튼·입력과 카드·모달의 위계를 반경으로 구분하고, 모든 요소를 알약(`rounded-full`)으로 만드는 슬롭을 방지한다. |
| **타이포그래피** | `Pretendard Variable` + `Pretendard JP Variable` 폴백, 본문 14px(`text-sm`) 이상, 숫자는 `tabular-nums` | 한글·일본어 곡 제목과 실시간 재생 시간/통계 숫자가 흔들림 없이 읽히게 한다. |

## 3. 대시보드 레이아웃 및 UX 원칙

### 3.1 페이지 셸과 탐색 (`Navbar` · `Container` · `PageHeader`)
- 상단 `Navbar`는 루트 flex 컬럼의 `sticky top-0` 요소로 자리 잡으며, `Container`는 상단 여백(`pt-6 sm:pt-8`)과 하단 여백(`pb-16`)으로 헤더와 본문의 호흡을 유지한다.
- 모바일(`< md`)에서는 상단 내비게이션 링크를 숨기고 하단 플로팅 탭바(`MobileTabBar`)로 주요 5개 경로(상태·차트·프로필·플레이리스트·대시보드)를 한 손가락 거리에서 제공한다. 375px 폭에서도 모든 라벨이 말줄임(`...`) 없이 온전히 표시되어야 한다.
- `PageHeader`는 제목과 설명이 화면 폭에 맞춰 자연스럽게 줄바꿈되도록 하며, 설명을 강제로 잘라내지 않는다.

### 3.2 서버 설정 대시보드 (`ServerDashboard`)
- **데스크톱(`lg+`)**: 좌측 고정 기능 사이드바(`ServerFeatureSidebar`, `lg:sticky lg:top-20`, 내부 스크롤 지원) + 우측 설정 패널 2열 구조.
- **모바일(`< lg`)**: 상단 가로 스크롤 탭 스트립 + 단일 열 설정 패널. 활성 탭이 바뀌면 자동으로 탭 스트립 가시 영역 안으로 스크롤한다.
- **초안 보존과 플로팅 저장 바(`SaveBar`)**:
  - 탭 전환 시 패널을 언마운트하지 않고(`keepMounted`) 숨겨 편집 중인 초안을 보존한다.
  - 저장 바는 **활성 패널에 미저장 변경 사항이 있거나 저장 중일 때만** 화면 하단 플로팅 아일랜드(`Portal`)로 나타난다. 변경 사항이 없을 때는 숨겨 화면 공간을 확보한다.

### 3.3 도메인별 핵심 인터랙션
- **곡 제목 링크 일원화**: 웹 플레이어(현재 재생·대기열·검색 결과), 플레이리스트, 차트, 프로필, 서버 통계의 모든 곡 제목은 클릭 시 원본 음원 주소(YouTube 등)로 바로 이동하는 링크로 동작한다.
- **플레이리스트 관리 (`PlaylistDetail`)**:
  - 불필요한 위/아래 화살표 버튼과 별도 외부 링크 버튼 열을 제거해 모바일 행 밀도를 낮춘다.
  - 곡 순서 변경은 데스크톱 드래그 앤 드롭, 모바일 길게 누르기(Long-press) 후 드래그, 키보드 `Alt + ↑/↓` 단축키로 처리한다.
- **소셜 알림 (`SocialAlertsSettings`)**:
  - 구독 목록은 웹훅 프로필 아바타(40px), 플랫폼·상태 배지, 대상 채널, 한 줄 요약만 담은 컴팩트 행으로 표시해 다수의 알림이 등록되어도 목록이 지저분해지지 않게 한다.
  - 개별 알림의 웹훅 프로필(표시명·아바타·섬네일 스위치)과 메시지 템플릿 수정은 인라인 확장이 아닌 전용 모달(`Dialog`)에서 처리하며, 추가 폼에서는 접기/펼치기 섹션으로 묶는다.

## 4. 봇 메시지 디자인 연계

- Discord 메시지는 Components V2(`MessageFlags.IsComponentsV2`, `ContainerBuilder`, `SectionBuilder`, `TextDisplayBuilder`)를 기본으로 사용한다.
- 봇 임베드 기본 강조색(`#ffdaff`)은 디스코드 다크/라이트 배경에서의 시인성을 기준으로 유지하며, 웹 액션 컬러(`--primary-control`)와 역할을 분리한다.

## 5. 품질 및 검증 기준

- 토큰 변경 시 `python3 apps/dashboard/scripts/wcag-contrast-audit.py` 결과가 `Unexpected failures: 0`이어야 한다.
- 반응형 레이아웃은 `375px`(모바일), `768px`(태블릿), `1024px`(작은 노트북), `1440px`(데스크톱) 전 구간에서 페이지 가로 스크롤 누수(`scrollWidth > clientWidth`)가 없어야 한다.
