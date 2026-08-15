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

/* ---------------------------------------------------------------------------
 * 인용부호 구간 — Q-1·Q-2·Q-3 · D-7~D-9 (2026-08-15 이관)
 *
 * §6 U-e 2026-08-15 판정이 이 파일을 인용부호 구간 파서의 정본으로 못박았다.
 * ------------------------------------------------------------------------ */

/** 원문 좌표계의 반열린 구간 `[start, end)` */
export type TextSpan = {
  readonly start: number;
  readonly end: number;
};

/** 인용부호 구간. `form`은 §3.4가 든 세 형식 중 어느 것으로 잡혔는지다. */
export type QuoteSpan = TextSpan & {
  readonly form: string;
};

/**
 * 구간을 바깥에서 **정확히** 감싼 마커(D-7).
 *
 * `kind`가 갈래를 든다 — `강조`는 D-5 계수에 들고, `취소선`은 D-9에 따라 부류 밖이다.
 */
export type OuterWrap = {
  readonly char: string;
  readonly width: number;
  readonly marker: string;
  readonly kind: "강조" | "취소선";
};

/**
 * Q-1 — 코드 펜스 여는/닫는 줄. **마커가 가르고 자리는 안 가른다** — 들여쓰기 폭도
 * 인용 블록 접두도 이 판정에 안 든다(Q-1의 부류 술어에 컨테이너 조건이 없다).
 *
 * **2026-08-15 정정** — 이 자리는 *"이 상한이 계약보다 좁다"*를 **현재형으로** 들고 있었다.
 * 그 상한(3칸 들여쓰기)은 같은 날 `K-112` ②가 없앴는데 이 문장이 따라가지 않았고, 그 사이
 * «상한»이라는 낱말이 독자를 **들여쓰기 축**으로 보냈다 — 재 보면 그린인 축이다. 실제로 좁던
 * 축은 **접두 문자 부류**였고 그것이 `K-116`(인용 블록 안의 펜스)이다. 두 축 다 지금은 닫혔다.
 *
 * **남은 미규정은 여닫의 «컨테이너»가 어긋난 쌍이다**(`K-118`) — §3.4는 여닫의 관계를 인라인
 * 스팬에 대해서만(런 길이) 정하고 펜스에는 들여쓰기도 컨테이너도 말하지 않는다. 구현이 무엇을
 * 고르고 왜인지는 그 자리의 구현 주석이 든다.
 */
export declare const FENCE_LINE: RegExp;

/** Q-1 — 코드 펜스를 지운다. 인라인 스팬보다 **반드시 먼저**다. 길이와 줄 구조가 보존된다. */
export declare function maskCodeFences(doc: string): string;

/** Q-1 — 인라인 코드 스팬을 지운다. 여는 런과 닫는 런의 **길이가 같아야** 한 스팬이다. */
export declare function maskCodeSpans(text: string): string;

/**
 * §3.4 — 인용부호 셋의 구간을 원문 좌표계로 뽑는다.
 *
 * **0건은 정상 결과다** — 큰따옴표가 전부 코드 표기 안이면 옳은 답이 0건이다. 0건을 실패로
 * 볼 규율은 코퍼스를 먹이는 쪽(문서 단위 호출자)이 든다.
 */
export declare function quoteSpans(doc: string): QuoteSpan[];

/** D-7 — 구간을 바깥에서 **정확히** 감싼 마커. 진부분으로 담긴 것은 `null`이다. */
export declare function outerWrap(doc: string, start: number, end: number): OuterWrap | null;

/**
 * §3.4 D-5의 위반 이름.
 *
 * **`CitationViolation`과 다른 유니온이다**(§4 · 2026-08-15). §3.2가 든 갈래 둘은 «인용
 * 구문»의 것이고 D-5는 §3.4의 규칙이라 성질이 다르다 — 한 유니온에 담으면 §3.2의 «갈래는
 * 둘» 문면이 거짓이 된다.
 */
export type RuleViolation = "outer-emphasis-wrap";

/**
 * D-5 위반 한 자리.
 *
 * **`detail`은 문면 대신 처방을 든다**(§4 2026-08-15). D-5의 원문은 인용된 문면이므로 그것을
 * 실으면 게이트 출력이 실행 리포트·devnote를 거쳐 S-4의 코퍼스에 들어간다. 자리는 `line`·
 * `column`이 들고, `detail`은 무엇을 고치라는 것인지만 말한다.
 */
export type RuleFinding = {
  /** 1-기반 */
  readonly line: number;
  /** 1-기반 */
  readonly column: number;
  readonly violation: RuleViolation;
  readonly detail: string;
};

/** §3.4 D-5·D-7~D-9 — 인용부호 구간을 바깥에서 정확히 감싼 강조를 전부 찾는다. */
export declare function findD5Violations(source: string): RuleFinding[];
