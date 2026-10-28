FIXED: 15 / DEFERRED: 1 / N/A: 0

# 세그먼트 07 fix: 대시보드 UI 프리미티브

- 수정일: 2026-10-23
- 워크트리: /home/seonu/.local/share/opencode/worktree/e08104/fix-dashboard-ui (브랜치 fix/dashboard-ui)
- 커밋: f5fcf986 (미push)
- 근거 문서: docs/antislop-audit/segments/07-dashboard-ui-primitives.md Findings 1~16
- 수정 범위: apps/dashboard/src/components/{ui,primitives,overlay,layout,navbar,discord,data,motion,licenses} + 토큰 확보를 위한 app/globals.css

## Finding별 처리

| 세그먼트# | 우선순위 | 판정 | 변경 요약 | 파일:라인 |
|---|---|---|---|---|
| 07#1 | HIGH | fixed | warning·danger·discord 배지를 솔리드 채움 + 전경 토큰으로 전환하고 dot도 전경색으로 반전, status-dot의 동일 배지 조합도 같은 값으로 맞춤 | components/ui/badge.tsx:16-24, 44-50 / components/primitives/status-dot.tsx:7-11 |
| 07#2 | HIGH | fixed | 라이트 `--ring`을 #ee6f8b에서 #c4476a로 교체(다크는 var(--brand) 유지), 측정 수치를 주석으로 기록 | app/globals.css:60-62, 107 |
| 07#3 | HIGH | fixed | offline 점 불투명도 40%에서 100%로 상향하고, 상태 aria-label을 영문에서 한국어 4종으로 교체 | components/ui/avatar.tsx:33, 36-41, 92 |
| 07#4 | MEDIUM | fixed | 셀렉트·드롭다운·커맨드 항목에 포커스 링(focus/data-selected, ring-2 ring-ring) 추가해 선택 배경과 구분 | components/ui/select.tsx:120 / components/ui/dropdown-menu.tsx:92, 117, 164, 206 / components/ui/command.tsx:159 |
| 07#5 | MEDIUM | fixed | 목록 null이 로딩/실패 공용 상태이며 로딩·오류 표시는 호출부 계약임을 타입 JSDoc으로 명시 (지명된 두 번째 제안 채택) | components/discord/channel-select.tsx:13-19 / components/discord/role-select.tsx:10-16 |
| 07#6 | MEDIUM | fixed | 외부 링크 앵커에 after 히트 확장(44px) 추가. 배지 dismiss의 기존 관례와 같은 방식 | components/licenses/license-list.tsx:102-103 |
| 07#7 | MEDIUM | fixed | 모바일 탭 라벨 11px에서 12px, Field 설명·오류 12px에서 14px로 상향 (status-dot 라벨 12px 유지, 리스크 참조) | components/navbar/mobile-tab-bar.tsx:340 / components/primitives/field.tsx:50, 55 |
| 07#8 | MEDIUM | fixed | button·input-group·dropdown-menu의 dark: 분기를 globals.css 변수 재정의 6종으로 이동하고, 값이 같은 no-op dark: 2개는 삭제 | components/ui/button.tsx:30 / components/ui/input-group.tsx:17, 127, 143 / components/ui/dropdown-menu.tsx:92 / app/globals.css:71-79, 115-122, 154-159 |
| 07#9 | MEDIUM | fixed | FieldRenderProps에 required 추가 후 렌더 프롭으로 전달, 별표 옆에 sr-only "(필수)" 텍스트 대안 추가 | components/primitives/field.tsx:6-12, 40-46, 48 |
| 07#10 | LOW | fixed | CommandDialog 기본 제목·설명을 한국어로 교체 | components/ui/command.tsx:37-38 |
| 07#11 | LOW | fixed | 워터마크를 "이미지 없음"으로 바꾸고 클래스를 cn() 병합으로 교체, 한글에 무효인 uppercase 클래스 제거 | components/primitives/mock-thumbnail.tsx:5-12 |
| 07#12 | LOW | fixed | template literal className을 cn()으로 교체 | components/layout/page-header.tsx:3, 23 |
| 07#13 | LOW | fixed | 별칭(default/primary, danger/destructive)에 계약 주석 추가. 호출부 혼용이 있어 삭제하지 않음 | components/ui/button.tsx:15, 23 / components/ui/badge.tsx:19, 47 |
| 07#14 | LOW | fixed | Skeleton이 인라인 문자열 대신 pulseBase 상수를 사용 | components/ui/skeleton.tsx:56 |
| 07#15 | LOW | deferred | 공용 헬퍼 추출은 새 추상화 금지 원칙과 충돌하고, 단일/다중 렌더 분기의 옵션 빌더가 달라 diff가 커짐. Finding 5와 같은 파일 세트라 동시 변경 시 회귀 위험이 큼 | 변경 없음 |
| 07#16 | LOW | fixed | 지명 대상 2곳에 회귀 테스트 추가: color-picker 키보드/커밋과 HEX 정규화, Field aria 배선 (신규 3 테스트) | components/ui/color-picker.test.tsx / components/primitives/field.test.tsx |

## 검증

실행한 명령과 결과입니다. 실행하지 않은 검증은 아래 미검증 항목에 따로 적었습니다.

| 명령 | 결과 |
|---|---|
| `yarn install` (워크트리) | 성공 (Done with warnings in 12s 422ms, peer dependency 경고만) |
| `yarn workspace @sirubot/dashboard lint` (eslint . --max-warnings=0) | exit 0, 출력 없음 (경고 0) |
| dashboard 테스트 `node_modules/.bin/vitest run --passWithNoTests` (apps/dashboard) | Test Files 39 passed / Tests 250 passed |
| 신규 테스트 단독 실행 (color-picker.test.tsx, field.test.tsx) | Test Files 2 passed / Tests 3 passed |
| `yarn typecheck` (루트 turbo) | Tasks 14 successful / 14 total. dashboard는 cache miss로 실제 실행 후 통과 |
| `yarn workspace @sirubot/dashboard build` | 2회 실행. 1차는 컴파일과 프리렌더까지 끝난 뒤 Next.js 보안 업그레이드 안내(SecurityFatalError)로 exit 1, 2차 재실행은 exit 0 |
| Tailwind 유틸리티 생성 확인 (임시 postcss + @tailwindcss/postcss 컴파일) | 신규 유틸리티 `bg-outline-fill`, `hover:bg-outline-fill-hover`, `bg-input-group-fill`, `has-disabled:bg-input-group-fill-disabled`, `ring-input-group-invalid-ring`, `bg-destructive-focus-fill`이 `var(--outline-fill)` 등으로 생성됨. 제거 대상 `dark:bg-input`은 생성되지 않음. `after:inset-[min(0px,calc((100%-44px)/2))]`는 `content: var(--tw-content)`와 함께 생성됨(`@property --tw-content` 초기값 ""). 임시 파일은 삭제함 |

환경 메모: 워크트리에서 `yarn workspace @sirubot/dashboard test`는 `command not found: vitest`가 나와(루트 devDependency 바이너리 PATH 미주입) 루트 `node_modules/.bin/vitest`로 직접 실행했습니다. 또한 deps 미빌드 상태에서 `yarn workspace @sirubot/dashboard typecheck`를 단독 실행하면 `@sirubot/utils/*`, `@sirubot/prisma` 모듈 해석 오류가 나므로, deps를 빌드하는 루트 `yarn typecheck`로 검증했습니다.

### 대비 측정 (contrast-check.py)

| 항목 | 조합 | before | after | 판정 |
|---|---|---|---|---|
| #1 warning 배지 라이트 | `#9a6100` on 틴트 배경 | 4.50 (흰 위) / 4.10 (면2 위) FAIL | 흰색 텍스트 on `#9a6100` 5.14 | PASS |
| #1 warning 배지 다크 | `#451a03` on `#fbbf24` | (감사 시 PASS 유지) | 8.97 | PASS |
| #1 destructive 배지 라이트 | `#d4183d` on 틴트 배경 | 4.31 (흰 위) / 3.98 (면2 위) FAIL | 흰색 텍스트 on `#d4183d` 5.25 | PASS |
| #1 destructive 배지 다크 | `#2b1018` on `#ff7b8a` | (감사 시 PASS 유지) | 7.10 | PASS |
| #1 discord 배지 양쪽 | `#5865F2` on 틴트 배경 (라이트) | 4.07 FAIL | 흰색 텍스트 on `#5865F2` 4.61 (라이트/다크 동일값) | PASS |
| #2 라이트 포커스 링 | `#ee6f8b` on `#ffffff` / `#fff9f9` / `#fff0f0` / `#f3d3d6` | 2.88 / 2.77 / 2.61 / 2.07 (3:1 미달) | `#c4476a` on 동일 4배경: 4.71 / 4.53 / 4.26 / 3.39 | PASS (비텍스트 3:1) |
| #2 다크 포커스 링 (변경 없음) | `#f98aa0` on `#1f1618` / `#2b2023` | 7.73 / 6.88 | 동일 | PASS |
| #3 avatar offline 점 라이트 | 40% 합성 `#cbbfc1` on `#fff9f9` | 1.71 FAIL | `#7d686d` on `#fff9f9` 4.95, on `#ffffff` 5.16 | PASS |
| #3 avatar offline 점 다크 | 40% 합성 `#44373a` on `#1f1618` | 1.56 FAIL | `#b9a4a9` on `#1f1618` 7.54, on `#2b2023` 6.71 | PASS |
| 부가: Field 오류 텍스트 (14px) | `#d4183d` on `#ffffff` / `#fff0f0` | 12px이던 값 | 5.25 / 4.75 | PASS |

참고: 틴트(before) 수치는 제가 배경 위에 10% 틴트를 직접 합성해 계산한 값이라 감사 리포트 수치(warning 4.49, destructive 4.46, discord 3.87)와 ±0.2 정도 차이가 있습니다. 두 수치 모두 4.5:1 미달이라는 결론은 같습니다.

## 리스크 / 병합 주의

각 줄은 실제 일어난 동작·시각 변화 한 건입니다.

- 배지 3종(warning/danger/discord)이 틴트에서 단색 채움으로 바뀌어 상태 행에서 success/info(틴트 유지)와 채움 방식이 섞입니다. design-tokens에 기록된 "파스텔 solid 배지 전환" 후속 작업과 값이 겹칠 수 있습니다.
- 라이트 테마의 모든 포커스 링 색이 어두운 핑크(#c4476a)로 바뀌었습니다. input-group의 `border-ring` 포커스 테두리도 같은 토큰을 써서 같이 어두워집니다.
- avatar 상태 점의 aria-label이 "online"/"idle"/"dnd"/"offline"에서 "온라인"/"자리 비움"/"방해 금지"/"오프라인"으로 바뀌었습니다. aria-label 값에 의존하는 선택자나 테스트가 있으면 갱신이 필요합니다.
- 메뉴·셀렉트·커맨드 항목이 키보드 포커스일 때 2px 링을 추가로 그립니다(시각적 변화만, 선택 로직은 그대로).
- globals.css에 변수 6종(--outline-fill, --outline-fill-hover, --input-group-fill, --input-group-fill-disabled, --input-group-invalid-ring, --destructive-focus-fill)과 @theme inline 매핑 6줄이 새로 들어갔습니다. 같은 블록을 다른 세션이 수정하면 병합 충돌이 납니다.
- button outline 채움/hover, input-group 채움·비활성·무효 링, 드롭다운 destructive 포커스 틴트가 이제 `.dark` 변수 값에 의존합니다. 값을 바꾸려면 globals.css에서 바꿔야 하며 한쪽 블록만 고치면 한쪽 테마만 변형됩니다.
- input-group의 `dark:bg-transparent dark:disabled:bg-transparent` 2개는 라이트 값과 같아 결과가 동일한 분기라 삭제했습니다(시각 변화 없음).
- Field 설명·오류가 12px에서 14px이 되어 폼 높이가 조금 늘어납니다.
- 모바일 탭 라벨이 11px에서 12px이 되어 좁은 폭에서 "플레이리스트" 잘림 폭이 조금 늘어납니다. 제안의 14px은 5탭 균등 분할에서 잘림이 커져 실시하지 않았습니다.
- status-dot 라벨(12px)은 Finding 7의 위치에는 들어 있지만 제안 대상이 아니라 그대로 뒀습니다. 점 옆 인라인 마이크로 라벨이고 대비는 통과합니다.
- ChannelSelect/RoleSelect는 로딩 스켈레톤이나 오류 문구를 직접 렌더하지 않고 계약 문서화만 했습니다. 실제 상태 표시는 호출부(components/servers, 다른 에이전트 소유)에서 처리합니다.
- 라이선스 외부 링크의 히트 영역이 44px로 넓어져, 인접 행이나 그룹 summary와 최대 수 px 겹칠 수 있습니다.
- CommandDialog 기본값은 현재 유일 소비자(global-command-palette)가 한국어를 넘겨 화면에 노출되지 않으므로 화면 변화가 없고, 미사용 경로에서만 한국어가 나옵니다.
- MockThumbnail이 "No Image" 대신 "이미지 없음"을 표시합니다. uppercase 클래스 제거는 한글에 무효라 시각 변화가 없습니다.
- Button/Badge 별칭은 삭제하지 않고 주석만 남겼으므로 호출부(components/servers, app/design 등)에 영향이 없습니다.
- finding 15는 미수행이라 ChannelSelect와 RoleSelect의 선택값 유지 로직·단일/다중 분기 중복이 그대로 남아 있습니다.

## 미검증 항목

- 브라우저에서의 실제 클릭·키보드 라이트/다크 전환 육안 확인, 모바일 브레이크포인트 확인, 200% 확대 확인은 수행하지 않았습니다. 워크트리에 .env가 없어 dev 서버 실행도 하지 않았습니다.
- `yarn test` 전체(루트 turbo)와 다른 워크스페이스 테스트는 실행하지 않았습니다. 대상 범위인 dashboard 테스트만 실행했습니다.
- 배지 솔리드 전환의 시각적 만족도(디자인 관점)는 확인하지 않았습니다. 대비 수치만 검증했습니다.
