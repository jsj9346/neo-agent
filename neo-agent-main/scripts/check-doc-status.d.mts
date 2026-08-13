/**
 * `check-doc-status.mjs`의 타입 선언.
 *
 * `.mjs`는 `tsconfig.json`의 include(`packages` 아래 `.ts`) 밖이라 타입체크를 받지 못한다.
 * 이 파일이 있어야 `packages/cli/test/doc-status.contract.test.ts`가 순수 판정 함수를
 * import할 수 있다. 형태의 정본은 `docs/DOC-STATUS.md` §3.1이다.
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

export type Verdict =
  | { readonly ok: true; readonly kind: DocStatus["kind"]; readonly anchor?: AnchorPath }
  | { readonly ok: false; readonly violation: Violation; readonly detail: string };

/** 문서 소스 텍스트 → 파싱 결과. 파일 I/O를 하지 않는다. */
export function parseDocStatus(source: string): ParseResult;

/** 파싱 결과 + 앵커 존재 여부 → 판정. 경로 판정을 주입받는다. */
export function judge(parsed: ParseResult, anchorExists: boolean): Verdict;
