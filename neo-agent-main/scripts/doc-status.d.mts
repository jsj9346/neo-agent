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
