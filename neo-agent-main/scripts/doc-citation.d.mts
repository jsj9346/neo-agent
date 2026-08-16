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
 * 인용부호 구간 — Q-1~Q-7 · D-7~D-9 (2026-08-15 이관 · 같은 날 Q-4~Q-7 확정분 반영)
 *
 * §6 U-e 2026-08-15 판정이 이 파일을 인용부호 구간 파서의 정본으로 못박았다.
 * ------------------------------------------------------------------------ */

/** 원문 좌표계의 반열린 구간 `[start, end)` */
export type TextSpan = {
  readonly start: number;
  readonly end: number;
};

/**
 * 인용부호 구간. `form`은 §3.4가 든 세 형식 중 어느 것으로 잡혔는지다.
 *
 * **이름은 셋으로 닫힌다** (§3.4 P-6 · 2026-08-16 확정). 열린 `string`으로 두면 넷째 형식이
 * 조용히 들어온다 — §6 U-j(직각 인용부호)가 열려 있고 그것이 승격되는 날 이 값은 넷이 되는데,
 * 타입이 아무 말도 안 하면 그 승격이 어디에도 안 드러난다. 닫아 두면 그 승격이 **선언을
 * 고쳐야만** 들어오고, 넷째 라벨을 쓰는 소비자가 타입에서 걸린다.
 *
 * **신호를 내는 것은 타입체크가 아니라 계약 테스트다** (§3.4 P-6의 2026-08-16 정정). 이 레포는
 * `skipLibCheck`가 켜져 있고 `.mjs`가 어느 `tsconfig`의 `include`에도 없어 **손으로 쓴 이 선언이
 * 런타임 값과 대조되지 않는다** — `quoteSpans`가 넷째 라벨을 실제로 내도 `pnpm typecheck`은
 * 조용하다. 그래서 **라벨 집합을 런타임에서 재는 단언**이 그 몫을 든다. §6 U-j·U-l에 대해 계약
 * 테스트가 이미 깔아 둔 장치와 같은 자리다.
 *
 * **라벨은 §3.4가 그 형식을 드는 표기를 그대로 쓴다** — 영문 식별자로 옮기면 §3.4와 타입 사이에
 * 번역이 끼고 그 번역표는 어디에도 정본이 없다. §3.2의 위반 이름이 식별자인 근거(그 이름이 그대로
 * 게이트 출력의 라벨이라는 것)는 여기 안 걸린다 — 이 값은 출력에 안 실린다.
 */
export type QuoteSpan = TextSpan & {
  readonly form: '*"…"*' | "«…»" | '"…"';
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
 * **여닫의 «컨테이너»·«들여쓰기» 축은 Q-6이 답했다**(2026-08-15 확정) — 닫는 마커는 여는
 * 마커와 **같은 문자**이고 **런 길이가 여는 런 이상**이어야 하며, 들여쓰기 폭과 인용 블록
 * 접두는 닫기 판정에 안 든다. 마커와 자리를 가르는 선은 이 절이 Q-2에서 이미 그었고, 닫기에서
 * 그 선을 뒤집으면 한 절 안에서 같은 낱말이 두 층위로 쓰인다.
 * (이 자리는 2026-08-15까지 그 축을 **남은 미규정**으로 들고 판정을 `K-118`에 넘기고 있었다.)
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
 * §3.4의 규칙 위반 이름.
 *
 * **`CitationViolation`과 다른 유니온이다**(§4 · 2026-08-15). §3.2가 든 갈래 둘은 «인용
 * 구문»의 것이고 이쪽은 §3.4의 규칙이라 성질이 다르다 — 한 유니온에 담으면 §3.2의 «갈래는
 * 둘» 문면이 거짓이 된다.
 *
 * **Q-7의 갈래가 D-5와 같은 유니온에 드는 근거는 그 성질이다**(§4 2026-08-15). 판정이 전부
 * 문서 문자열 안에서 끝나고 대상 원문을 열지 않으므로 §3.4가 «형식»으로 묶은 그 층이다.
 * 새 유니온을 만들면 같은 층이 이름 공간에서 갈려, 실행부가 두 형태를 다르게 실어야 할
 * 근거가 없는데도 갈래가 생긴다.
 */
export type RuleViolation =
  /** D-5 — 인용부호 구간을 바깥에서 강조 마커로 **정확히** 감쌌다 */
  | "outer-emphasis-wrap"
  /**
   * Q-7 — 한 문단 안 평문 인용부호 글자의 수가 홀수라 구간 추출의 입력 가정이 깨졌다.
   *
   * **자리는 그 문단의 첫 글자다.** 평문은 여닫 글자가 같은 문자라 어느 글자가 짝을
   * 잃었는지가 문자열 안에서 안 갈리고, **그것이 이 규칙이 존재하는 이유 자체다** —
   * 특정 글자를 지목하면 그 지목이 거짓일 수 있다(§3.4 Q-7 아래 문단).
   */
  | "unpaired-quote-glyph"
  /**
   * Q-7 — 펜스가 문서 끝까지 안 닫혀 뒤쪽이 통째로 마스킹된다.
   *
   * 이쪽 자리는 **여는 줄**이다 — 홀수 갈래와 달리 자리가 특정된다.
   */
  | "unclosed-code-fence";

/**
 * §3.4 규칙 위반 한 자리.
 *
 * **`detail`은 문면 대신 처방을 든다**(§4 2026-08-15). D-5의 원문은 인용된 문면이므로 그것을
 * 실으면 게이트 출력이 실행 리포트·devnote를 거쳐 S-4의 코퍼스에 들어간다. 자리는 `line`·
 * `column`이 들고, `detail`은 무엇을 고치라는 것인지만 말한다. **Q-7도 같은 규약을 받는다** —
 * 근거가 같고, 짝이 어긋난 문단의 문면을 실으면 회피가 우회된다.
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

/**
 * §3.4 Q-7 — 구간 추출의 입력 가정이 깨진 자리를 전부 찾는다. 무엇이 나오는지의 정본은 위
 * `RuleViolation`이다 — 여기에 이름을 다시 세면 목록이 둘이 되고 한쪽만 갱신된다.
 *
 * **0건이 정상 결과다.** `quoteSpans`의 0건과 성질이 다르다 — 그쪽 0은 «인용부호가 없다»일
 * 수도 «가정이 깨져 못 쟀다»일 수도 있고, 이 함수가 그 둘을 가른다. 그래서 실행부는 이것이
 * 걸린 문서의 D-5를 «위반 없음»으로 세지 않는다(§4).
 *
 * 패리티가 재는 단위는 **문단**이고 S-5의 «단위»가 아니다 — 인용부호 구간의 상한이 그것이므로
 * 그물이 다른 값을 쓰면 지키려는 대상과 어긋난다(§3.4). **겹화살괄호 부류는 이 검사 밖이다** —
 * 여는 글자와 닫는 글자가 달라 짝이 어긋나도 패리티가 안 밀린다.
 */
export declare function findQ7Violations(source: string): RuleFinding[];
