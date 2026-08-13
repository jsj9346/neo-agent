/**
 * `doc-status.mjs`(순수 판정)의 타입 선언.
 *
 * `.mjs`는 `tsconfig.json`의 include(`packages` 아래 `.ts`) 밖이라 타입체크를 받지 못한다.
 * 이 파일이 있어야 `packages/cli/test/doc-status.contract.test.ts`가 판정 함수를 import할
 * 수 있다. 형태의 정본은 `docs/DOC-STATUS.md` §3.1이다.
 */

/** `neo-agent-main/` 기준 상대 경로. 파일 또는 디렉터리 하나. */
export type AnchorPath = string;

/** §3.2의 닫힌 유니온. `근거:` 줄의 유무가 kind에 의해 완전히 결정된다 — 옵셔널이 아니다. */
export type DocStatus =
  | { readonly kind: "implemented"; readonly anchor: AnchorPath }
  | { readonly kind: "not-yet"; readonly anchor: AnchorPath }
  | { readonly kind: "no-claim" };

/** §3.1의 일곱 위반. */
export type Violation =
  | "missing"
  | "duplicate"
  | "unknown-value"
  | "anchor-required"
  | "anchor-forbidden"
  | "anchor-missing"
  | "anchor-present";

export type ParseFailure = { readonly violation: Violation; readonly detail: string };
export type ParseResult = DocStatus | ParseFailure;

/**
 * `judge`의 산출.
 *
 * 성공 갈래는 `status`를 **통째로** 든다 — `kind` + 옵셔널 `anchor`로 평탄화하면
 * `{kind:"no-claim", anchor:"x"}`가 타입상 합법이 되어 §3.1의 불변(그리고 그것이 인용하는
 * `ARCHITECTURE.md` 설계 원칙 4)이 판정 경계에서 풀린다.
 *
 * 문서 이름은 여기 없다: `judge(parsed, anchorExists)`가 파일명을 받지 않으므로 원리적으로
 * 만들 수 없고, 게이트 루프가 파일명과 짝지어 출력한다(§3.1).
 */
export type Verdict =
  | { readonly ok: true; readonly status: DocStatus }
  | { readonly ok: false; readonly violation: Violation; readonly detail: string };

/** §3.3 — 머리 탐색 범위. */
export const HEAD_LINE_LIMIT: number;

/** 문서 소스 텍스트 → 파싱 결과. 파일 I/O를 하지 않는다. */
export function parseDocStatus(source: string): ParseResult;

/** 파싱 결과 + 앵커 존재 여부 → 판정. 경로 판정을 주입받는다. */
export function judge(parsed: ParseResult, anchorExists: boolean): Verdict;

/**
 * §5.1 — 표 파싱의 실패 사유.
 *
 * **`Violation`과 다른 이름공간이다.** §5.1: *"§3.1의 일곱 위반을 늘리지 않는다 — 표 대조는
 * 집합 대 집합이라 판정 함수가 만들 수 없는 값이다."* 두 유니온이 합쳐지면 머리 판정의
 * 전수 단언이 표 실패까지 세게 되어, 그 단언이 지키던 성질이 흐려진다.
 */
export type TableFailureReason =
  | "section-missing" // `## 5.` 절 제목이 없다
  | "table-missing" // 절 범위에 표(또는 데이터 행)가 없다
  | "table-ambiguous" // 절 범위에 표가 둘 이상이다 (D-2 — 배정의 정본이 둘)
  | "row-malformed"; // §5.1의 세 셀 문법에 맞지 않는 행

/** 표 한 행의 배정. `status`는 머리 판정과 **같은** `DocStatus`다(§3.1 불변의 표 버전). */
export type TableAssignment = { readonly doc: string; readonly status: DocStatus };

export type TableParseResult =
  | { readonly ok: true; readonly rows: readonly TableAssignment[] }
  | { readonly ok: false; readonly reason: TableFailureReason; readonly detail: string };

/**
 * `DOC-STATUS.md` 전문 → §5 표의 배정 목록. 파일 I/O를 하지 않는다.
 *
 * 절 범위는 `## 5.`부터 **그 다음에 처음 나오는 `###` 앞까지**다(§5.1) — `## 6.`이 아니다.
 * 대조 자체(실패 갈래 넷)는 이 함수 밖, 실행부에 있다.
 */
export function parseStatusTable(source: string): TableParseResult;
