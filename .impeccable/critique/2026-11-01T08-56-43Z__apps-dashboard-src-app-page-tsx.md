---
target: apps/dashboard/src/app/page.tsx
total_score: 38
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/seonu/projects/SiruBOT/apps/dashboard/src/app/page.tsx"
target_fingerprint: "sha256:d1c782b51b7628611a58266b72f1e051876d0a8df2ab9e6eb645ab18357c51bb"
target_path: /home/seonu/projects/SiruBOT/apps/dashboard/src/app/page.tsx
timestamp: 2026-11-01T08-56-43Z
slug: apps-dashboard-src-app-page-tsx
---
# Design Critique: apps/dashboard/src/app/page.tsx

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 4 | 슬라이더 탭 전환 인디케이터 및 회전 단어 전환 가드 우수 |
| 2 | Match System / Real World | 4 | 디스코드 실제 임베드 및 채팅 UI와 1:1 일치하는 목업 표현 |
| 3 | User Control and Freedom | 4 | 자동 롤링 정지/재생 컨트롤 및 prefers-reduced-motion 완비 |
| 4 | Consistency and Standards | 4 | Pink Beret 팔레트 및 토큰 기반 버튼(cta/secondary xl) 일관성 |
| 5 | Error Prevention | 4 | 깨지기 쉬운 외부 이미지 MockThumbnail 폴백 및 링크 방어 |
| 6 | Recognition Rather Than Recall | 4 | 디스코드 명령어 목록과 카테고리별 미리보기가 직관적으로 직결 |
| 7 | Flexibility and Efficiency | 3 | 모바일/데스크톱 뷰포트 대응 우수하나 명령어 복사/검색 인터랙션 단축키 부재 |
| 8 | Aesthetic and Minimalist Design | 4 | 불필요한 장식 테두리 배제 및 보더리스 뎁스 준수 |
| 9 | Error Recovery | 4 | 라우트 로딩/실패 시 안전한 폴백 및 404/에러 패널 연계 |
| 10 | Help and Documentation | 3 | 랜딩 특성상 안내가 충분하나 초보자용 명령어 가이드 툴팁 확충 여지 |
| **Total** | | **38/40** | **Excellent (95%)** |

## Design Specificity Verdict

**LLM assessment**: 
시루봇 특유의 따뜻한 핑크와 깊이 있는 마룬(`--primary`, `--primary-foreground`) 색상 위계가 명확하게 정착되어 있으며, 디스코드 실제 클라이언트 컴포넌트(Components V2 및 임베드)를 충실히 모사하여 일반적인 SaaS 랜딩페이지와 완전히 차별화된 정체성을 갖추고 있습니다.

**Deterministic scan**:
총 5건 검출 (warning 4, advisory 1).
- `discord-command-animation.tsx`의 `side-tab` 4건은 디스코드 공식 임베드의 좌측 4px 컬러 바(`border-l-4`)를 고정밀도로 재현한 것으로 전형적인 **도메인 특화 거짓 양성(False Positive)**입니다.
- `hero-section.tsx:167`의 `text-[1.75rem]`은 모바일 뷰포트용 임의 크기로 검출된 **참 양성(True Positive)**이며 토큰화 권장 대상입니다.

## Priority Issues
- **[P2] What**: `hero-section.tsx:167`의 임의 폰트 크기 `text-[1.75rem]`
  - **Why it matters**: DESIGN.md의 타이포그래피 램프(`headline: 1.5rem`, `display: 2.25rem`) 규약과 불일치하여 유지보수 시 임의 크기 확산 우려.
  - **Fix**: 표준 스케일로 정규화하거나 DESIGN.md에 `display-sm` 토큰으로 공식 등록.
  - **Suggested command**: `/impeccable typeset apps/dashboard/src/components/home/hero-section.tsx`
- **[P3] What**: 디스코드 임베드 목업의 `side-tab` 슬롭 감지 노이즈
  - **Why it matters**: 정적 검사 도구가 디스코드 고유 UI를 인공 슬롭으로 오인하여 이후 품질 점검 파이프라인에서 지속 경고 발생.
  - **Fix**: `.impeccable/config.json`에 `side-tab` 무시 예외 추가 또는 주석 예외 처리.
  - **Suggested command**: `/impeccable harden`
