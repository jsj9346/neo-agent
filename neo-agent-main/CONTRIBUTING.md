# 기여 안내

## 이 문서가 하는 일

**이 문서는 안내이지 계약의 정본이 아니다.** 규칙의 정본은 전부 `docs/` 아래에 있고, 이 문서가 드는
것은 그 규칙들로 가는 길이다. 계약이 이 문서에 살면 기계나 타입이 그것을 가리킬 때 주소가 어색해진다.

## 먼저 읽는 것

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 이 프로젝트의 설계 원칙 정본
- [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) — **모델 프로바이더·인증·플랫폼 접근에 손대기 전에 반드시 읽는다.**
  AI 제공사 ToS를 위반하는 절대 이식 금지 목록의 전문이 여기 있다

이 문서는 금지 목록의 내용을 옮겨 적지 않는다 — 정본은 위 파일 하나뿐이다.

## 무엇을 고쳐도 되는가

- `neo-agent-main/` 안은 자유롭게 고친다.
- 레퍼런스 트리 둘(OpenClaw·Hermes Agent 스냅샷)은 **읽기 전용**이다. 그 코드를 그대로 옮기지 않는다 —
  복사가 아니라 이해 후 재작성이 기본이다.

## 개발 절차

- 설치·실행 방법은 [`neo-agent-main/README.md`](README.md)로 넘긴다.
- 통합 게이트는 `pnpm check`다. 그 구성의 정본은 `package.json`의 `check` 스크립트다 — 여기서
  하나하나 열거하지 않는다. 열거하면 게이트가 늘 때마다 이 문서가 낡는다.
- CI는 없다. 게이트를 돌리는 것은 사람이다.

## 문서를 고칠 때

문서를 고치거나 새로 쓸 때는 아래 네 규약을 따른다. 각 규약의 규칙은 그 문서가 들고 여기서
되풀이하지 않는다.

- [`docs/DOC-STATUS.md`](docs/DOC-STATUS.md) — 문서 머리 필드가 무엇을 선언해야 하는가
- [`docs/DOC-CITATION.md`](docs/DOC-CITATION.md) — 다른 자리를 가리킬 때 쓰는 인용 형식
- [`docs/MARKERS.md`](docs/MARKERS.md) — 미규정을 표시하는 마커 규약
- [`docs/PUBLIC-TREE.md`](docs/PUBLIC-TREE.md) — 공개 트리 안에서 주소가 어떻게 해결되는가

## 이름을 만났을 때

코드나 문면에서 낯선 세계관 어휘를 만나면 [`docs/LORE.md`](docs/LORE.md)가 사전이다.

## 이 트리에서 안 열리는 주소

공개 레포만 clone했다면 이 트리 안에서 못 여는 주소를 만날 수 있다. 그것이 결함이 아니라
**의도된 성질**이라는 것을 여기서 밝힌다. 아래는 이 레포가 작업 폴더에서 쓰는 비공개 접두 목록이다:

- `.claude/`
- `CLAUDE.md`
- `devlog.md`
- `devnotes/`
- `idea.md`
- `kanban.md`
- `backlog.md`
- `milestones/`
- `plans/`
- 루트 `docs/` (레퍼런스 분석 — `neo-agent-main/docs/`의 우리 설계 문서와는 다른 자리다)

**이 목록은 요약이다.** 정본은 `docs/PUBLIC-TREE.md` §3.2다 — 부류 판별의 세부와 해결 규칙이
바뀌면 이 목록이 아니라 그 절이 먼저 갱신된다.
