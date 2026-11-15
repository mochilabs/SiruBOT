# Pull request message rules

> Applies to every pull request in this repository, written by a person or by an AI agent.
> Related: the branch rules in [AGENTS.md](../AGENTS.md) (branch from `beta`, open the PR against `beta`).
> [.github/pull_request_template.md](../.github/pull_request_template.md) fills in the body skeleton automatically.

A pull request is the unit of review. The title compresses what changed into one line. The body gives the reviewer the context, the reasoning and the verification status before they read any code.

## Language

Titles and bodies are written in **Korean**, in the polite 해요 style used across this repository. Code identifiers, paths, commands and error messages stay verbatim. The section headings below are the ones in the template, so keep them as written.

## Title

- Format: `<type>: <summary>`
  - `type` is one of `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, the same set as the commit convention.
  - The summary states the core of the change in one line, as a noun phrase or in the present tense.
  - If a wide change needs a subtitle, join it with a comma, a colon or parentheses. Do not use an em dash (U+2014) or an en dash (U+2013).
- Examples:
  - `feat: 웰컴 카드 축소(800×450)와 인사 카드 편집기 UX 개편`
  - `fix: 대시보드 빌드 실패 수정 (클라이언트 번들로 새어 들어간 pg 제거)`
  - `refactor: 길드 데이터 request/reply 경로 정리`

## Body

The structure depends on the type. The verification section is always required. Delete sections that do not apply.

### feat and refactor (feature or structural change)

- `## 요약` (summary): what changed and how. Split it into a table or bullets when several areas are touched.
  - Always state compatibility with existing behavior: whether a data migration is needed, whether a stored format changed, whether an API became incompatible.
- `## 결정 로그` (decision log): one line per reversible design choice and its reason. Record what was deliberately left out (non-goals) too. Write it only when a design judgment was made.
- `## 검증` (verification)

### fix (bug fix)

- `## 배경` (background): how the bug was found. Leave evidence: reproduction steps, error messages, logs, issue links.
- `## 원인과 수정` (cause and fix): why it happened and what changed. A simple fix can merge both into one paragraph.
- `## 검증` (verification)

## Verification rules (required)

- Write the commands you actually ran and their results, for example `yarn lint`, `yarn typecheck`, `yarn test`, `yarn turbo build --filter=@sirubot/dashboard`.
- Mark anything you could not confirm as "미검증" (unverified). Never write a guess as if it were confirmed.
- List items that need a manual check (visual UI check, runtime behavior, post-deploy check) as a checklist, and tick `[x]` only for what you actually checked.
- For a bug fix, show the reproduction before the fix next to the result after it.
- Say whether CI runs on this branch or will only be confirmed after merge.

## Common rules

- State facts only: no inflated adjectives and no unverified numbers.
- When the UI changes, include a screenshot or GIF in the body and point out what the reviewer should look at.
- When there are several commits, group the body by area so it lines up with how the commits are split.
- Link related issues, documents and pull requests.
