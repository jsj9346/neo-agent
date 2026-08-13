/**
 * `doc-citation.mjs`(순수 판정)의 타입 선언.
 *
 * `.mjs`는 `tsconfig.json`의 include(`packages` 아래 `.ts`) 밖이라 타입체크를 받지 못한다.
 * 이 파일이 있어야 `packages/cli/test/doc-citation.contract.test.ts`가 판정 함수를 import할
 * 수 있다. 형태의 정본은 `docs/DOC-CITATION.md` §3.2다.
 */

/**
 * 인용 한 자리.
 *
 * **문서 이름이 없다.** 순수 판정은 소스 텍스트만 받으므로 파일명을 원리적으로 만들 수
 * 없다 — 게이트 루프가 파일명과 짝지어 출력한다. (2026-08-13 정정: 최초 문면은 `file`을
 * 뒀는데, `doc-status.d.mts`가 `doc: string`을 뺀 것과 같은 결함이었다.)
 */
export type Citation = {
  readonly text: string;
  /** 1-기반. 출력용이며 판정에 쓰지 않는다. */
  readonly line: number;
};

/** §3.2 — 갈래는 둘이고 «기타»가 없다. 이 이름이 그대로 게이트 출력의 라벨이다. */
export type CitationViolation =
  /** 트리 접두 없이 `<이름>.md` 뒤에 콜론과 숫자가 온 형태 */
  | "unpinned-doc-line"
  /** `§<절번호>` 뒤에 콜론과 숫자가 온 형태 — 자기 문서 절:줄 */
  | "self-section-line";

/**
 * 판정의 산출. 실패 갈래가 `violation`과 `detail`을 **함께** 든다 — 위반 이름이 곧 고칠 곳의
 * 주소라는 것이 이 게이트의 설계이고(`DOC-STATUS.md` §5.2), 이름만으로는 어느 자리인지
 * 알 수 없다.
 */
export type CitationVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly violation: CitationViolation; readonly detail: string };

/** §3.1 — 줄이 움직이지 않는 읽기 전용 스냅샷. 접두는 인용 문자열 안에 있어야 한다. */
export declare const FROZEN_TREES: readonly string[];

/** §4 — 탐색 범위는 파일 전체다. 머리 40줄이 아니다. */
export declare function findCitations(source: string): Citation[];

/** §3.1 — 판별 기준은 «대상 트리가 고정돼 있는가» 하나다. */
export declare function judgeCitation(text: string): CitationVerdict;
