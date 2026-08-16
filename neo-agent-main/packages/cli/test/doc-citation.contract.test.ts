/**
 * 문서 인용 형식 — `DOC-CITATION.md`의 기계화.
 *
 * 기대값의 출처는 전부 정본 문서다:
 *   - §3.1 — 판별 기준(*"대상 트리가 고정돼 있는가"*)과 **판별이 인용 문자열 안에서 완결된다**는 것. 축 1·축 2
 *   - §3.2 — `CitationViolation`의 **갈래 둘**, «기타»를 두지 않는다, 허용 형식을 열거하지 않는다. 축 3
 *   - §3.3 — `NN` 탈출 / **억제 목록도 인용 블록 예외도 없다**. 축 4
 *   - §4   — 탐색 범위는 **파일 전체**(머리 40줄이 아니다) · 판정과 실행부가 파일이 다르다. 축 5
 *   - §3.4 — D-5·D-7~D-9(감쌈의 폭·마커 부류·취소선) · **Q-1~Q-7** — 무엇이 코드이고 무엇이
 *     인용부호인가(Q-1~Q-3) · 부류가 미치는 범위(Q-4·Q-5) · 펜스의 닫기(Q-6) · 짝이 어긋난
 *     입력(Q-7). 축 6·축 7·축 8
 *   - §4   — Q-7의 두 갈래가 D-5와 **같은 유니온**에 들고 출력이 문면을 안 싣는다. 축 8
 *
 * **2026-08-15 — 인용부호 구간 파서와 D-5 판정이 이 모듈로 이관됐다**(§6 U-e · §4). 축 6·축 7이
 * 그 표면의 계약이고, **2026-08-16에 Q-4~Q-7이 축 6·축 8로 들어왔다**(§3.4 «부류가 미치는 범위와
 * 짝이 어긋날 때»). 기대값은 `scripts/doc-citation.d.mts`(시그니처)와 §3.4·§4 문면에서만 도출했고
 * 구현 본문은 열지 않았다 — 이 파일은 QA가 소유하며, 수행자가 자기 변경에 맞춰 단언을 고치면
 * 그 순간 이 검사는 아무것도 잡지 않는다.
 *
 * **이 파일은 구현보다 먼저 쓰였다.** `scripts/doc-citation.mjs`는 이 파일을 쓰는 시점에
 * 존재하지 않았고, 시그니처는 플랜(`plans/20260813-doc-citation-plan.md` T-001)이 정한 것을
 * 받았다. 별도 QA 에이전트를 띄우는 대신 **순서로 독립을 확보했다** — 없는 구현은 읽을 수
 * 없으므로 배치보다 강한 보장이다. 이 게이트의 실패 양태는 §3.3이 명시적으로 배제한
 * *"파서가 관대해져 조용히 통과"*이므로, 케이스가 구현의 그림자가 되면 정확히 그 관대함을
 * 재현한다. 구현이 문서와 어긋나면 **문서가 이긴다.**
 *
 * **양성 대조군(축 1)이 먼저 오는 이유.** 위반 케이스만 있으면 *"판정이 전부 거부한다"*와
 * 구별되지 않는다 — 2026-08-13에 이 레포가 실제로 밟은 함정이라 여기서 반복하지 않는다.
 *
 * **파일 I/O가 없다.** `findCitations`·`judgeCitation`은 문자열만 받는다. 실물 `docs/`의 내용은
 * 이 파일의 판정에 들어오지 않는다 — 들어오면 문서를 고칠 때마다 계약 테스트가 흔들리고,
 * 그러면 이 파일은 계약이 아니라 실물의 사진이 된다.
 *
 * **금지 형식은 `NN` 탈출로 쓰지 않는다 — 여기서는 진짜 숫자를 쓴다.** §3.3의 탈출 규칙은
 * `docs/*.md`(게이트 대상)에 걸리는 것이고, 이 파일은 `packages/cli/test/` 아래라 대상이
 * 아니다(§1). 계약 테스트가 위반을 재현하지 못하면 아무것도 재지 못한다.
 */

import { describe, expect, it } from "vitest";
import {
  type Citation,
  FENCE_LINE,
  FROZEN_TREES,
  findCitations,
  findD5Violations,
  findQ7Violations,
  judgeCitation,
  maskCodeFences,
  maskCodeSpans,
  outerWrap,
  quoteSpans,
} from "../../../scripts/doc-citation.mjs";

/** §3.2 — 갈래는 둘이고 «기타»가 없다. 이름은 그대로 게이트 출력의 라벨이다. */
const UNPINNED = "unpinned-doc-line";
const SELF_SECTION = "self-section-line";

/**
 * §3.4 Q-7의 두 갈래. **정본이 문자열 리터럴을 정하지 않았다** — §4는 이 둘이 D-5와 «같은
 * 유니온»에 든다는 것만 못박는다. 이 값은 2026-08-16 실행 사이클이 구현 레인과 합의한 이름이고,
 * 어휘가 바뀌면 여기 한 줄만 바뀐다. **이름이 아니라 갈래가 계약이다.**
 */
const UNPAIRED_QUOTE = "unpaired-quote-glyph";
const UNCLOSED_FENCE = "unclosed-code-fence";

/**
 * 첫 인용을 꺼낸다. `noUncheckedIndexedAccess` 아래에서 `citations[0]`은 `undefined`를
 * 포함하므로, **"인용이 하나 이상 잡혔다"를 단언으로 만들어** 그 사실이 조용히 넘어가지
 * 않게 한다 — 비단언 인덱싱은 미탐(인용이 0건인데 통과)을 침묵으로 바꾼다.
 */
function first(citations: Citation[]): Citation {
  const [citation] = citations;
  expect(citation, "인용이 하나도 잡히지 않았다").toBeDefined();
  return citation as Citation;
}

/**
 * `first`와 같은 이유의 일반형 — 축 6·축 7이 구간·판정을 꺼낼 때 쓴다. 비단언 인덱싱은
 * *"0건인데 통과"*를 침묵으로 바꾸므로, **하나 이상 잡혔다는 것을 단언으로 만든다.**
 */
function head<T>(items: readonly T[], label: string): T {
  const [item] = items;
  expect(item, label).toBeDefined();
  return item as T;
}

describe("축 1 — 양성 대조군: 정당한 형식은 통과한다 (§3.1·§3.2)", () => {
  // §3.4 — "절 번호 / 필드·앵커 이름 / 문면 인용 / 경로 + 커밋"
  it.each([
    ["절 번호", "`DOC-STATUS.md` §6.1이 이 경우다"],
    ["필드 이름", "`CLI-INTERFACE.md`의 `최종 개정:` 필드"],
    ["문면 인용", '`ARCHITECTURE.md` 머리의 *"여기서 세지 않는다"* 금지'],
    ["절 번호만", "§3.3과 같은 이유로 관대하지 않다"],
    ["숫자 없는 파일 참조", "`packages/store/src/search.ts`를 본다"],
    ["범위 없는 절", "`DOC-STATUS.md` §5 표가 정본이다"],
  ])("%s은 위반이 아니다", (_label, source) => {
    for (const citation of findCitations(source)) {
      expect(judgeCitation(citation.text)).toEqual({ ok: true });
    }
  });

  // §1 경계표 — 코드(`packages/`·`scripts/`) 대상은 이 규약 밖이다(§6 U-b).
  it("코드 대상 줄번호 인용은 규약 밖이라 위반이 아니다", () => {
    const source = "`packages/store/src/search.ts:197`과 `scripts/doc-status.mjs:15`";
    const violations = findCitations(source)
      .map((c) => judgeCitation(c.text))
      .filter((v) => !v.ok);
    expect(violations).toEqual([]);
  });
});

describe("축 2 — 동결 트리는 줄번호를 쓴다 (§3.1·§2.2)", () => {
  it("FROZEN_TREES는 두 레퍼런스 스냅샷이다", () => {
    // §3.1 표 — `openclaw-main/…` · `hermes-agent-main/…`
    expect([...FROZEN_TREES].sort()).toEqual(["hermes-agent-main/", "openclaw-main/"]);
  });

  it.each([
    "`openclaw-main/docs/providers/google.md:80`",
    "`hermes-agent-main/SECURITY.md:58-65`",
    "`openclaw-main/docs/concepts/agent-loop.md:1340-1374`",
  ])("트리 접두가 붙으면 통과한다 — %s", (source) => {
    for (const citation of findCitations(source)) {
      expect(judgeCitation(citation.text)).toEqual({ ok: true });
    }
  });

  /**
   * §3.1 — *"산문에 트리 이름을 적고 백틱 안에는 파일명만 두는 형태는 금지다. 판별이 문자열
   * 밖으로 새는 순간 기계가 못 재고, 억제 목록이 필요해진다."* 이 케이스가 §2의 «오탐 0»
   * 근거가 서는 자리다 — 문맥을 읽어야 알 수 있는 기준을 두면 그 순간 무너진다.
   */
  it("트리 이름이 산문에만 있으면 위반이다 — 판별은 문자열 안에서 완결된다", () => {
    const source = "hermes `SECURITY.md:58-65`가 정직하게 선언했듯";
    const citations = findCitations(source);
    expect(citations).toHaveLength(1);
    expect(judgeCitation(first(citations).text)).toMatchObject({ ok: false, violation: UNPINNED });
  });
});

describe("축 3 — 위반 갈래 둘 (§3.2)", () => {
  it.each([
    ["트리 접두 없는 문서 인용", "`ARCHITECTURE.md:7`의 금지", UNPINNED],
    ["백틱 안 콜론", "`SANDBOX.md`:5의 손으로 유지된 목록", UNPINNED],
    ["범위 형태", "`CLI-INTERFACE.md:3-8`의 이력", UNPINNED],
    ["자기 문서 절:줄", "§5:184이 이 경우다", SELF_SECTION],
    ["소절 절:줄", "§6.1:278의 인용", SELF_SECTION],
    ["한 자리 절", "§4:12를 본다", SELF_SECTION],
  ])("%s → %s", (_label, source, violation) => {
    const citations = findCitations(source);
    expect(judgeCitation(first(citations).text)).toMatchObject({ ok: false, violation });
  });

  it("두 갈래가 한 줄에 있으면 둘 다 잡힌다", () => {
    const verdicts = findCitations("`ARCHITECTURE.md:7`과 §5:184").map((c) =>
      judgeCitation(c.text),
    );
    expect(
      verdicts
        .filter((v) => !v.ok)
        .map((v) => (v.ok ? null : v.violation))
        .sort(),
    ).toEqual([SELF_SECTION, UNPINNED].sort());
  });

  /** §3.2 — *"«기타»를 두지 않는다. 위반 이름이 곧 고칠 곳의 주소다."* */
  it("위반 이름은 둘뿐이다 — «기타» 갈래가 없다", () => {
    const sources = [
      "`ARCHITECTURE.md:7`",
      "§5:184",
      "`SANDBOX.md`:5",
      "hermes `SECURITY.md:58`",
      "§6.1:278",
    ];
    const names = new Set<string>();
    for (const source of sources) {
      for (const citation of findCitations(source)) {
        const verdict = judgeCitation(citation.text);
        if (!verdict.ok) names.add(verdict.violation);
      }
    }
    expect([...names].sort()).toEqual([SELF_SECTION, UNPINNED].sort());
  });

  it("위반 판정은 detail을 든다 — 위반 이름만으로는 고칠 곳을 못 찾는다", () => {
    const verdict = judgeCitation(first(findCitations("`ARCHITECTURE.md:7`의 금지")).text);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.detail.length).toBeGreaterThan(0);
  });
});

describe("축 4 — 관대하지 않다 (§3.3)", () => {
  /** §3.3 — *"금지 형식을 예시로 들 때는 숫자 자리에 `NN`을 쓴다. 검사가 보는 것은 숫자다."* */
  it.each(["`X.md:NN`", "§n:NN", "`ARCHITECTURE.md:NN`"])(
    "NN 탈출은 걸리지 않는다 — %s",
    (source) => {
      const violations = findCitations(source)
        .map((c) => judgeCitation(c.text))
        .filter((v) => !v.ok);
      expect(violations).toEqual([]);
    },
  );

  /**
   * §3.3 — *"억제 목록도 인용 블록 예외도 두지 않는다."* 이것이 풀리면 정정 주석 안의 죽은
   * 주소가 영구히 면제되고, 그 자리가 이 규약의 처분 대상 여덟이었다(플랜 §8.3 D-1).
   */
  it("`>` 인용 블록 안의 위반도 잡힌다 — 인용 블록 예외가 없다", () => {
    const source = ["> **2026-08-13 정정** — `SANDBOX.md:5`의 6개 문서 목록이 그것이다.", ""].join(
      "\n",
    );
    const violations = findCitations(source)
      .map((c) => judgeCitation(c.text))
      .filter((v) => !v.ok);
    expect(violations).toHaveLength(1);
  });

  it("들여쓴 인용 블록 안의 위반도 잡힌다", () => {
    const violations = findCitations("  > 이 자리에 `CLI-INTERFACE.md:3`이 있었다")
      .map((c) => judgeCitation(c.text))
      .filter((v) => !v.ok);
    expect(violations).toHaveLength(1);
  });

  it("`최종 개정:` 필드 안의 위반도 잡힌다", () => {
    const violations = findCitations("- 최종 개정: 2026-08-11(§1:23 소비자 서술에서 수 제거)")
      .map((c) => judgeCitation(c.text))
      .filter((v) => !v.ok);
    expect(violations).toHaveLength(1);
  });
});

describe("축 5 — 탐색 범위와 순수성 (§4)", () => {
  /** §4 — *"탐색 범위는 파일 전체다. 인용은 본문에 살고, 머리 규약과 달리 자리를 좁힐 수 없다."* */
  it("머리 40줄을 넘는 자리도 수집된다", () => {
    const source = [...Array(60).fill("본문 한 줄."), "`ARCHITECTURE.md:7`의 금지"].join("\n");
    const citations = findCitations(source);
    expect(citations).toHaveLength(1);
    expect(first(citations).line).toBe(61);
  });

  it("line은 1-기반이다", () => {
    expect(first(findCitations("`X.md:1`")).line).toBe(1);
  });

  /**
   * §3.2 — *"문서 이름은 이 타입에 없다. 순수 판정은 소스 텍스트만 받으므로 파일명을
   * 원리적으로 만들 수 없다."* (2026-08-13 D-2 — 최초 문면의 `file: string`을 뺐다.
   * `DOC-STATUS.md` §3.1이 `doc: string`을 뺀 것과 같은 결함이었다.)
   */
  it("Citation은 파일명을 들지 않는다", () => {
    expect(Object.keys(first(findCitations("`X.md:7`"))).sort()).toEqual(["line", "text"]);
  });

  it("인용이 없으면 빈 배열이다 — 던지지 않는다", () => {
    expect(findCitations("줄번호가 하나도 없는 산문.")).toEqual([]);
    expect(findCitations("")).toEqual([]);
  });

  /**
   * §4 — 판정과 실행부는 파일이 다르다. 순수 모듈은 부작용이 없다.
   *
   * **정확 일치를 유지한다.** 느슨하게(`toContain`) 바꾸면 이 검사가 잡던 것 — 순수 판정에
   * 실행부의 표면이 새어 들어오는 것 — 을 그대로 잃는다. 기대값의 출처는
   * `scripts/doc-citation.d.mts`의 **값 선언 전부**다(`export declare const`·`function`).
   * `type` 선언(`Citation`·`CitationViolation`·`CitationVerdict`·`TextSpan`·`QuoteSpan`·
   * `OuterWrap`·`RuleViolation`·`RuleFinding`)은 런타임에 없으므로 이 목록에 들지 않는다.
   * 2026-08-15에 인용부호 구간 파서와 D-5가 들어왔고(§4 · §6 U-e), 2026-08-16에 Q-7 판정이
   * 들어온다 — **§4가 Q-7을 «순수 판정 `scripts/doc-citation.mjs`»의 몫으로 뒀으므로**
   * 그 함수는 이 표면에 서야 한다. 이름은 위 `UNPAIRED_QUOTE` 주석과 같은 근거로 합의값이다.
   */
  it("순수 모듈은 임포트 시 아무것도 하지 않는다", async () => {
    const module = await import("../../../scripts/doc-citation.mjs");
    expect(Object.keys(module).sort()).toEqual([
      "FENCE_LINE",
      "FROZEN_TREES",
      "findCitations",
      "findD5Violations",
      "findQ7Violations",
      "judgeCitation",
      "maskCodeFences",
      "maskCodeSpans",
      "outerWrap",
      "quoteSpans",
    ]);
  });
});

/**
 * §3.4 Q-1~Q-6. **마스킹이 먼저다** — Q-1이 코드 표기를 부류로 두고 그 안의 큰따옴표를 인용부호
 * 밖에 두므로, 구간을 재기 전에 코드가 지워져 있어야 한다. Q-4~Q-6은 그 부류가 **어디까지
 * 미치는지**를 정한다 — 형식 축(Q-4) · 배치 축(Q-5) · 펜스의 닫기(Q-6).
 */
describe("축 6 — 무엇이 코드이고 무엇이 인용부호인가 (§3.4 Q-1~Q-6)", () => {
  /** Q-1 — 코드 펜스는 백틱·물결 **둘 다**다. 부류로 읽지 않으면 물결 펜스가 규칙을 끈다. */
  it("FENCE_LINE은 백틱 펜스와 물결 펜스를 함께 잡는다", () => {
    // `g` 플래그가 있으면 `test`가 `lastIndex`를 들고 다녀 순서에 따라 답이 갈린다.
    const line = new RegExp(FENCE_LINE.source);
    expect(line.test("```ts")).toBe(true);
    expect(line.test("~~~")).toBe(true);
    expect(line.test("보통 산문 한 줄.")).toBe(false);
  });

  /** `.d.mts` — *"길이와 줄 구조가 보존된다"*. 보존되지 않으면 원문 좌표계가 어긋난다. */
  it("펜스 마스킹은 길이와 줄 구조를 보존하고 안의 큰따옴표를 지운다", () => {
    const doc = ["산문 한 줄.", "```ts", 'const a = "X";', "```", "끝."].join("\n");
    const masked = maskCodeFences(doc);
    expect(masked).toHaveLength(doc.length);
    expect(masked.split("\n")).toHaveLength(doc.split("\n").length);
    expect(masked).not.toContain('"X"');
  });

  /**
   * Q-1 — *"여는 백틱 런과 닫는 백틱 런의 **길이가 같은** 쌍"*. 런 길이를 안 맞추면 이중 백틱
   * 스팬이 홑 백틱을 담을 때 마스킹이 중간에서 끊겨 **유령 구간**이 생긴다(2026-08-14 V-1).
   * 그 결함의 관측 가능한 자국이 바로 이 케이스다 — 끊기면 `"X"`가 살아남는다.
   */
  it("인라인 코드 스팬은 런 길이가 같은 쌍이다 — 안쪽 홑 백틱에서 끊기지 않는다", () => {
    const text = 'a ``inner `tick` "X"`` b';
    const masked = maskCodeSpans(text);
    expect(masked).toHaveLength(text.length);
    expect(masked).not.toContain('"X"');
  });

  /** Q-3 — 곧은 것과 곡선 것을 가리지 않고, **여는 글자와 닫는 글자에 각각** 걸린다. */
  it.each([
    ["곧은 쌍", '그는 "X"라고 적었다'],
    ["곡선 쌍", "그는 “X”라고 적었다"],
    ["혼합 쌍 — 여는 쪽만 곡선", '그는 “X"라고 적었다'],
    ["혼합 쌍 — 닫는 쪽만 곡선", '그는 "X”라고 적었다'],
  ])("%s은 인용부호 구간이다", (_label, source) => {
    const span = head(quoteSpans(source), "인용부호 구간이 잡히지 않았다");
    // [미규정] 구간이 인용부호 **문자를 포함하는지**는 §3.4도 `.d.mts`도 정하지 않는다.
    // 어느 쪽이든 참인 형태로만 단언한다 — 임의로 굳히면 그것이 계약이 아닌 사진이 된다.
    expect(source.slice(span.start, span.end)).toContain("X");
  });

  /** Q-3 — *"홑따옴표는 밖이다"*. 아포스트로피와 표기가 같아 판정이 문자열 안에서 안 끝난다. */
  it("홑따옴표는 인용부호가 아니다", () => {
    expect(quoteSpans("그는 'X'라고 적었다")).toEqual([]);
  });

  /** `.d.mts` — *"0건은 정상 결과다"*. 던지지 않는다. */
  it("인용부호가 없으면 0건이다 — 던지지 않는다", () => {
    expect(quoteSpans("따옴표가 하나도 없는 산문.")).toEqual([]);
    expect(quoteSpans("")).toEqual([]);
  });

  /** Q-1 — 코드 표기 안의 큰따옴표는 인용부호가 아니다. */
  it("코드 스팬 안의 큰따옴표는 구간이 아니다", () => {
    expect(quoteSpans('`const a = "X";`')).toEqual([]);
  });

  /* ---------------------------------------------------------------------------
   * Q-4 — 마스킹이 **인용부호 셋 전부**에 걸린다 (2026-08-15 확정)
   *
   * 기대값의 출처는 §3.4 Q-4 규칙 칸 하나다: *"코드 표기의 마스킹은 인용부호 셋 전부에
   * 걸린다. 코드 표기 안의 «…»와 `*"…"*`도 인용부호 구간이 아니다 — Q-1의 결론절이 든
   * 큰따옴표는 부류의 예시이지 한정이 아니다"*. 위의 «코드 스팬 안의 큰따옴표» 검사는 셋 중
   * 하나만 재므로, **좁은 읽기**(마스킹이 큰따옴표에만 걸린다)에서도 그대로 그린이다 —
   * 아래 표가 그 좁은 읽기를 red로 만든다.
   *
   * 형태 축(스팬·펜스)은 Q-1이 이미 부류로 열었으므로 **양쪽에 각각** 표본을 둔다.
   * ------------------------------------------------------------------------ */

  it.each([
    ["코드 스팬 + «…»", "표기는 `«X»`이다"],
    ['코드 스팬 + *"…"*', '표기는 `*"X"*`이다'],
    ["이중 백틱 스팬 + «…»", "표기는 `` «X» ``이다"],
  ])("%s은 인용부호 구간이 아니다 (Q-4)", (_label, source) => {
    expect(quoteSpans(source)).toEqual([]);
  });

  it.each<[string, string[]]>([
    ["백틱 펜스 + «…»", ["```md", "«X»", "```"]],
    ['백틱 펜스 + *"…"*', ["```md", '*"X"*', "```"]],
    ["물결 펜스 + «…»", ["~~~md", "«X»", "~~~"]],
    ['물결 펜스 + *"…"*', ["~~~md", '*"X"*', "~~~"]],
  ])("%s 안은 인용부호 구간이 아니다 (Q-4)", (_label, block) => {
    expect(quoteSpans(["산문 한 줄.", ...block, "끝."].join("\n"))).toEqual([]);
  });

  /**
   * **위 두 표가 공허하지 않다는 증거.** 같은 문자열이 코드 표기 **밖**에 있으면 셋 다 구간이다
   * — 안 그러면 위 green은 *"«…»와 `*"…"*`를 애초에 안 세는 파서"*에서 온 것일 수 있고, 그
   * 파서는 Q-4가 아니라 §3.4 머리의 «인용부호가 셋»을 깬다.
   */
  it.each([
    ["«…»", "본문이 «X»를 든다"],
    ['*"…"*', '본문이 *"X"*를 든다'],
  ])("대조 — 코드 표기 밖의 %s은 인용부호 구간이다", (_label, source) => {
    const span = head(quoteSpans(source), "인용부호 구간이 잡히지 않았다");
    expect(source.slice(span.start, span.end)).toContain("X");
  });

  /**
   * Q-5 — *"부류는 여는 자리와 닫는 자리에 각각 걸리고 **배치를 묻지 않는다.** 두 자리의
   * 글자가 부류 안이면 곡선 닫는 글자가 여는 자리에 서도 인용부호 구간이다"*.
   *
   * 위 Q-3 표의 혼합 쌍 둘은 **정상 배치**(여는 글자가 앞)라 배치 축을 재지 않는다. 여기서는
   * 뒤집힌 배치만 든다 — 배치를 술어에 넣는 읽기에서 이 표가 red가 된다. 그 읽기가 여는
   * 도피처(*"뒤집어 쓰면 규칙 밖"*)가 Q-5가 닫은 것이다.
   */
  it.each([
    ["뒤집힌 곡선 쌍", "그는 ”X“라고 적었다"],
    ["닫는 곡선이 여는 자리 + 곧은", '그는 ”X"라고 적었다'],
    ["곧은 + 여는 곡선이 닫는 자리", '그는 "X“라고 적었다'],
  ])("%s도 인용부호 구간이다 (Q-5 — 배치는 술어에 안 든다)", (_label, source) => {
    const span = head(quoteSpans(source), "인용부호 구간이 잡히지 않았다");
    // [미규정] 구간이 인용부호 **문자를 포함하는지**는 §3.4도 `.d.mts`도 정하지 않는다(아래
    // 미규정 describe의 «`QuoteSpan`은 인용부호 문자를 포함하는가» 항). 어느 쪽이든 참인
    // 형태로만 단언한다.
    expect(source.slice(span.start, span.end)).toContain("X");
  });

  /* ---------------------------------------------------------------------------
   * C-8 — 접두 없이 **순수하게 들여쓴 펜스** (`K-117` 잔여)
   *
   * 아래 컨테이너 축 표가 든 «들여쓴 인용 블록»은 접두와 들여쓰기가 겹친 하나뿐이라, 들여쓰기
   * **혼자서** 판정을 안 가른다는 것을 이 파일이 스스로 재지 않는다. 기대값의 출처는 §3.4 Q-2의
   * *"들여쓴 **펜스**는 마커가 있으므로 이 항이 아니라 Q-1의 부류이고, **몇 칸을 들여썼든** 코드
   * 표기다"* 하나다.
   * ------------------------------------------------------------------------ */

  it.each([
    ["3칸 들여쓴 백틱", "   ```"],
    ["4칸 들여쓴 백틱", "    ```ts"],
    ["8칸 들여쓴 물결", "        ~~~"],
  ])("FENCE_LINE은 접두 없이 %s을 펜스 줄로 잡는다 (Q-2 — 몇 칸을 들여썼든)", (_label, line) => {
    // `g` 플래그가 있으면 `test`가 `lastIndex`를 들고 다녀 순서에 따라 답이 갈린다.
    expect(new RegExp(FENCE_LINE.source).test(line)).toBe(true);
  });

  it.each([
    ["4칸", "    "],
    ["8칸", "        "],
  ])("%s 들여쓴 펜스 안의 큰따옴표는 인용부호 구간이 아니다", (_label, indent) => {
    const doc = [
      "산문 한 줄.",
      "",
      `${indent}\`\`\`ts`,
      `${indent}const a = "X";`,
      `${indent}\`\`\``,
      "",
      "끝.",
    ].join("\n");
    expect(quoteSpans(doc)).toEqual([]);
  });

  /**
   * 위 표의 반대편 — **가르는 것은 마커이지 들여쓰기가 아니다**(Q-2). 마커가 없으면 몇 칸을
   * 들여써도 코드 표기가 아니므로 그 안의 큰따옴표는 인용부호다. 이 케이스가 없으면 위 green은
   * *"들여쓴 줄을 통째로 넘긴다"*는 관대함일 수 있다.
   */
  it("대조 — 마커 없는 4칸 들여쓰기 안의 큰따옴표는 인용부호 구간이다", () => {
    const doc = ["산문 한 줄.", "", '    const a = "X";', "", "끝."].join("\n");
    const span = head(quoteSpans(doc), "인용부호 구간이 잡히지 않았다");
    expect(doc.slice(span.start, span.end)).toContain("X");
  });

  /* ---------------------------------------------------------------------------
   * C-12 — `QuoteSpan.form` (`K-117` 잔여)
   *
   * **값 자체를 단언하지 않는다.** `.d.mts`가 `form: string`으로 두어 라벨 어휘를 계약이
   * 고정하지 않았으므로, 문자열을 굳히면 계약에 없는 것을 계약으로 만든다. 계약이 실제로 든
   * 것은 둘뿐이다 — *"`form`은 §3.4가 든 **세 형식** 중 어느 것으로 잡혔는지다"*(`.d.mts`)와
   * §3.4 머리의 «인용부호가 셋».
   * ------------------------------------------------------------------------ */

  it("세 형식은 서로 다른 form으로 갈린다 — 라벨 어휘는 단언하지 않는다", () => {
    const formOf = (source: string): string =>
      head(quoteSpans(source), `${source}: 인용부호 구간이 잡히지 않았다`).form;
    const forms = [
      formOf('본문이 *"X"*를 든다'),
      formOf("본문이 «X»를 든다"),
      formOf('본문이 "X"를 든다'),
    ];
    expect(forms.every((form) => typeof form === "string" && form.length > 0)).toBe(true);
    expect(new Set(forms).size, `form이 갈리지 않았다: ${forms.join(" · ")}`).toBe(3);
  });

  /**
   * §6 U-j — 직각 인용부호(`「」`)는 **아직 인용부호가 아니다.** 실물이 있는데도 승격시키지
   * 않은 것이 판정이고(S-1이 벗긴 자리의 대체 표기로 쓰이고 있다), 그 판정은 `K-058`이 든다.
   * **이 검사가 red로 뒤집히는 날이 U-j가 닫힌 날이다.**
   */
  it("직각 인용부호는 인용부호 구간이 아니다 — 인용부호는 셋 그대로다 (§6 U-j 미승격)", () => {
    expect(quoteSpans("본문이 「직각 인용」을 든다.")).toEqual([]);
  });

  /* ---------------------------------------------------------------------------
   * Q-1의 부류 술어에 **컨테이너**가 드는가 — 인용 블록(`>`) 접두 (2026-08-15 · T-003)
   *
   * 기대값의 출처는 셋뿐이고 셋 다 «마커가 가른다»를 말한다:
   *   - §3.4 Q-1 — 부류를 **마커**로 정의한다(*"코드 펜스(백틱·물결) 전부"*). 술어에 자리
   *     조건이 없다. 부류로 쓰는 근거가 *"열거하면 다음 형태에서 목록이 낡는다"*이므로,
   *     접두 문자마다 항을 세우는 읽기는 그 근거와 정면으로 어긋난다.
   *   - §3.4 Q-2 — *"들여쓴 **펜스**는 마커가 있으므로 이 항이 아니라 Q-1의 부류이고, 몇 칸을
   *     들여썼든 코드 표기다"*. 가르는 축이 **마커의 유무**라는 것을 명문으로 못박는다.
   *   - `scripts/doc-citation.d.mts:77-78` — *"마커가 가르고 자리는 안 가른다 — 들여쓰기 폭도
   *     인용 블록 접두도 이 판정에 안 든다"*.
   *
   * 따라서 접두가 붙은 펜스와 안 붙은 펜스는 **같은 답**을 받아야 한다. **대조군(접두 없음)을
   * 같은 표에 두는 이유는 축 1이 선 이유와 같다** — 접두 쪽만 재면 *"전부 펜스로 본다"*와
   * 구별되지 않는다. 마찬가지로 접두가 붙었으나 마커가 없는 줄을 함께 두어, 통과가
   * *"`>`로 시작하면 넘긴다"*에서 온 것이 아님을 가른다.
   * ------------------------------------------------------------------------ */

  /** Q-1·Q-2 — 마커가 있으면 펜스다. 앞에 무엇이 붙었는지는 술어에 안 든다. */
  it.each([
    ["대조군 — 접두 없는 백틱", "```ts"],
    ["대조군 — 접두 없는 물결", "~~~ts"],
    ["인용 블록 + 백틱", "> ```ts"],
    ["인용 블록 + 물결", "> ~~~ts"],
    ["중첩 인용 블록 + 백틱", "> > ```"],
    ["중첩 인용 블록 + 물결", "> > ~~~"],
    ["접두 뒤 공백 없음", ">```"],
    ["들여쓴 인용 블록 — Q-2의 «몇 칸을 들여썼든»과 겹친 형태", "   > ```"],
  ])("FENCE_LINE은 %s을 펜스 줄로 잡는다", (_label, line) => {
    // `g` 플래그가 있으면 `test`가 `lastIndex`를 들고 다녀 순서에 따라 답이 갈린다.
    expect(new RegExp(FENCE_LINE.source).test(line)).toBe(true);
  });

  /**
   * 위 표의 반대편. **마커가 없으면 접두가 있어도 펜스가 아니다** — 이것이 참이어야 위 표의
   * 통과가 «마커를 봤다»에서 온 것이 된다. 홑 백틱 스팬 줄은 Q-1의 같은 부류이되 **인라인
   * 스팬** 쪽이고, 그것은 `maskCodeSpans`의 관할이라 펜스 줄이 아니다.
   */
  it.each([
    ["인용 블록 산문", "> 인용 블록 안의 보통 산문."],
    ["중첩 인용 블록 산문", "> > 더 깊은 산문."],
    ["인용 블록 + 홑 백틱 스팬", "> 그는 `code`라고 적었다"],
    ["인용 블록 + 백틱 둘", "> ``짝은 맞으나 펜스는 아니다``"],
  ])("FENCE_LINE은 %s을 펜스 줄로 잡지 않는다", (_label, line) => {
    expect(new RegExp(FENCE_LINE.source).test(line)).toBe(false);
  });

  /**
   * `.d.mts` — *"길이와 줄 구조가 보존된다"*. 접두가 붙어도 그대로다. 마스킹이 접두 줄에서
   * 안 걸리면 **그 안의 큰따옴표가 살아남아** 인용부호 구간으로 세어지고, 그것이 근거 없는
   * red다(Q-1이 *"그 안의 큰따옴표는 인용부호가 아니다"*로 닫은 자리).
   */
  it.each<[string, string[]]>([
    ["대조군 — 접두 없음", ["```ts", 'const a = "X";', "```"]],
    ["인용 블록 + 백틱", ["> ```ts", '> const a = "X";', "> ```"]],
    ["인용 블록 + 물결", ["> ~~~ts", '> const a = "X";', "> ~~~"]],
    ["중첩 인용 블록 + 백틱", ["> > ```ts", '> > const a = "X";', "> > ```"]],
    ["중첩 인용 블록 + 물결", ["> > ~~~ts", '> > const a = "X";', "> > ~~~"]],
  ])("펜스 마스킹은 %s 안의 큰따옴표를 지운다", (_label, block) => {
    const doc = ["산문 한 줄.", ...block, "끝."].join("\n");
    const masked = maskCodeFences(doc);
    expect(masked).toHaveLength(doc.length);
    expect(masked.split("\n")).toHaveLength(doc.split("\n").length);
    expect(masked).not.toContain('"X"');
  });

  /**
   * 소비자 층에서 같은 것을 다시 잰다. 마스킹이 맞아도 `quoteSpans`가 펜스를 안 거치면
   * 결과가 갈리므로, **계약이 말하는 층**(*"그 안의 큰따옴표는 인용부호가 아니다"*)에서
   * 직접 단언한다.
   */
  it.each<[string, string[]]>([
    ["대조군 — 접두 없음", ["```ts", 'const a = "X";', "```"]],
    ["인용 블록 + 백틱", ["> ```ts", '> const a = "X";', "> ```"]],
    ["인용 블록 + 물결", ["> ~~~ts", '> const a = "X";', "> ~~~"]],
    ["중첩 인용 블록", ["> > ```ts", '> > const a = "X";', "> > ```"]],
  ])("%s 안의 큰따옴표는 인용부호 구간이 아니다", (_label, block) => {
    expect(quoteSpans(["산문 한 줄.", ...block, "끝."].join("\n"))).toEqual([]);
  });

  /**
   * Q-1의 D-5 쪽 자국. 부류에서 빠지면 감쌀 인용 구간이 없으므로 D-5도 없다 — 축 7이
   * 접두 없는 펜스에 대해 든 것과 같은 단언이고, 여기서는 **컨테이너 축**만 다르다.
   */
  it.each<[string, string[]]>([
    ["대조군 — 접두 없음", ["```md", '**"X"**', "```"]],
    ["인용 블록 + 백틱", ["> ```md", '> **"X"**', "> ```"]],
    ["인용 블록 + 물결", ["> ~~~md", '> **"X"**', "> ~~~"]],
    ["중첩 인용 블록", ["> > ```md", '> > **"X"**', "> > ```"]],
  ])("D-5 판정은 %s 안의 바깥 강조를 잡지 않는다", (_label, block) => {
    expect(findD5Violations(["산문 한 줄.", ...block, "끝."].join("\n"))).toEqual([]);
  });

  /**
   * **위 세 표가 공허하지 않다는 증거.** 같은 문자열이 펜스 **밖**에 있으면 셋 다 답이
   * 뒤집힌다 — 접두 자체는 아무것도 끄지 않고(§3.3 *"인용 블록 예외도 없다"* · 축 4가 인용
   * 축에서 이미 든 것), **끄는 것은 펜스 마커뿐**이다. 이 케이스가 red면 위 표들의 green은
   * *"`>`로 시작하는 줄을 통째로 넘긴다"*는 관대함일 수 있다.
   */
  it("대조 — 펜스가 없으면 인용 블록 접두만으로는 아무것도 안 꺼진다", () => {
    const source = ["산문 한 줄.", '> **"X"**', "끝."].join("\n");
    expect(quoteSpans(source).length).toBeGreaterThan(0);
    expect(findD5Violations(source)).toHaveLength(1);
  });

  /* ---------------------------------------------------------------------------
   * Q-6 — 펜스의 닫기는 **마커가 정하고 자리는 정하지 않는다** (2026-08-15 확정)
   *
   * 이 자리는 2026-08-15까지 [미규정]이었다 — 그때 `scripts/doc-citation.d.mts`의 `FENCE_LINE`
   * 주석이 여닫의 «컨테이너»가 어긋난 쌍을 남은 미규정으로 들고 판정을 `K-118`에 넘기고 있었다.
   * Q-6이 답했고, **네 축이 한 술어의 면이므로 한 describe에
   * 둔다.** 기대값의 출처는 규칙 칸 한 문장뿐이다: *"닫는 마커는 여는 마커와 **같은 문자**이고
   * **런 길이가 여는 런 이상**이어야 한다. 들여쓰기 폭과 인용 블록 접두는 닫기 판정에 들지
   * 않는다."*
   *
   * **닫혔는가를 밖에서 잰다.** 닫기 판정은 표면에 없으므로 *"펜스 뒤의 인용이 살아 있는가"*로
   * 관측한다 — 안 닫히면 마스크가 문서 끝까지 번져 뒤 구간이 통째로 사라진다(Q-7이 든 증상).
   * ------------------------------------------------------------------------ */
  describe("Q-6 — 펜스의 닫기 (§3.4)", () => {
    /** 펜스 뒤 문단의 인용부호 구간 텍스트. 닫혔으면 하나, 안 닫혔으면 없다. */
    const afterFence = (open: string, close: string): string[] => {
      const doc = [open, 'const a = "펜스 안";', close, "", '뒤 문단이 "진짜 인용"을 든다.'].join(
        "\n",
      );
      return quoteSpans(doc).map((span) => doc.slice(span.start, span.end));
    };
    const closes = (open: string, close: string): void => {
      const texts = afterFence(open, close);
      expect(texts, `닫혔다면 뒤 인용 하나만 남는다: ${texts.join(" · ")}`).toHaveLength(1);
      expect(texts.join("")).toContain("진짜 인용");
      expect(texts.join("")).not.toContain("펜스 안");
    };
    const doesNotClose = (open: string, close: string): void => {
      expect(afterFence(open, close), "안 닫혔다면 뒤 구간이 마스크에 삼켜진다").toEqual([]);
    };

    /** 축 ① 컨테이너 — 인용 블록 접두는 닫기 판정에 들지 않는다. */
    it.each([
      ["여는 쪽만 접두", "> ```ts", "```"],
      ["닫는 쪽만 접두", "```ts", "> ```"],
      ["중첩 접두가 한쪽만", "> > ```ts", "```"],
      ["대조군 — 양쪽 다 접두", "> ```ts", "> ```"],
      ["대조군 — 양쪽 다 접두 없음", "```ts", "```"],
    ])("컨테이너가 %s이어도 닫힌다", (_label, open, close) => {
      closes(open, close);
    });

    /** 축 ② 들여쓰기 — 폭도 닫기 판정에 들지 않는다(Q-2의 «몇 칸을 들여썼든»과 같은 결). */
    it.each([
      ["여는 쪽만 4칸", "    ```ts", "```"],
      ["닫는 쪽만 8칸", "```ts", "        ```"],
      ["여는 4칸 · 닫는 2칸", "    ```ts", "  ```"],
      ["대조군 — 양쪽 다 4칸", "    ```ts", "    ```"],
    ])("들여쓰기가 %s이어도 닫힌다", (_label, open, close) => {
      closes(open, close);
    });

    /** 축 ③ 마커 문자 — 다르면 안 닫힌다. 백틱 펜스 안에 물결 펜스를 예시로 드는 형태가 산다. */
    it.each([
      ["백틱으로 열고 물결로 닫음", "```ts", "~~~"],
      ["물결로 열고 백틱으로 닫음", "~~~ts", "```"],
    ])("마커 문자가 다르면 안 닫힌다 — %s", (_label, open, close) => {
      doesNotClose(open, close);
    });

    it.each([
      ["대조군 — 백틱·백틱", "```ts", "```"],
      ["대조군 — 물결·물결", "~~~ts", "~~~"],
    ])("마커 문자가 같으면 닫힌다 — %s", (_label, open, close) => {
      closes(open, close);
    });

    /** 축 ④ 런 길이 — 여는 런 **이상**이어야 닫는다. 긴 펜스로 짧은 펜스를 감싸는 표기가 산다. */
    it.each([
      ["여는 4 · 닫는 3", "````ts", "```"],
      ["여는 5 · 닫는 4 (물결)", "~~~~~ts", "~~~~"],
    ])("닫는 런이 여는 런보다 짧으면 안 닫힌다 — %s", (_label, open, close) => {
      doesNotClose(open, close);
    });

    it.each([
      ["여는 3 · 닫는 3", "```ts", "```"],
      ["여는 3 · 닫는 5", "```ts", "`````"],
      ["여는 4 · 닫는 4", "````ts", "````"],
    ])("닫는 런이 여는 런 이상이면 닫힌다 — %s", (_label, open, close) => {
      closes(open, close);
    });

    /**
     * **이 계측이 공허하지 않다는 증거.** 위 «닫힌다» 표들은 *"마스킹을 아예 안 하는 파서"*
     * 에서도 그린이다 — 뒤 인용은 언제나 남기 때문이다. 그래서 **펜스 안이 실제로 지워졌다는
     * 것**과 **안 닫히는 쌍이 실제로 뒤를 삼킨다는 것**을 한 자리에서 함께 고정한다.
     */
    it("계측 자체의 역검증 — 펜스 안은 지워지고, 안 닫히는 쌍은 뒤를 삼킨다", () => {
      expect(afterFence("```ts", "```")).toHaveLength(1);
      expect(afterFence("```ts", "```").join("")).not.toContain("펜스 안");
      expect(afterFence("```ts", "~~~")).toEqual([]);
    });
  });
});

/**
 * §3.4 D-5 · D-7~D-9. **감쌈은 «정확히 감쌈»이다**(D-7) · **강조 마커는 부류다**(D-8) ·
 * **취소선은 부류 밖이다**(D-9).
 */
describe("축 7 — D-5: 인용부호 구간을 바깥에서 정확히 감싼 강조 (§3.4)", () => {
  /**
   * D-8 — *"별표·밑줄 계열 전부. 종류를 열거하지 않는다."* 인용부호 셋 모두에 걸린다
   * (*"하나만 걸면 «다른 형식을 쓰면 된다»는 도피처가 생긴다"*).
   */
  it.each([
    ["별표 둘 + 평문 큰따옴표", '**"X"**'],
    ["별표 둘 + «»", "**«X»**"],
    ["별표 셋 — 굵은 기울임", '***"X"***'],
    ["밑줄 둘", '__"X"__'],
    ["밑줄 하나", '_"X"_'],
  ])("%s은 D-5다", (_label, source) => {
    expect(findD5Violations(source)).toHaveLength(1);
  });

  /**
   * **`*"…"*`는 인용부호 형식 자체다** — §3.4 머리가 인용부호 셋 중 첫째로 든 표기다. 이것이
   * D-5로 잡히면 이 레포 문서의 지배적 인용 표기가 통째로 위반이 되고, 「소급 처분 0」이라는
   * 이 게이트 도입의 전제가 그 순간 깨진다.
   */
  it('`*"…"*`는 인용부호 형식이지 바깥 강조가 아니다', () => {
    expect(findD5Violations('그는 *"X"*라고 적었다')).toHaveLength(0);
  });

  /**
   * D-7 — *"강조 런이 인용과 다른 문자를 **함께** 담으면 D-5가 아니다."* 이 경계가 틀리면
   * 계수가 0이 아니라 실측 열일곱(한쪽 끝) · 여든여섯(진부분)이 된다.
   */
  it.each([
    ["진부분 — 뒤에 다른 글자", "**«X»의 뜻**"],
    ["한쪽 끝 붙음 — 앞", '**"X" 뒷말**'],
    ["한쪽 끝 붙음 — 뒤", '**앞말 "X"**'],
    ["문장 전체 강조 안의 인용", '**이 문단은 "X"를 든다**'],
  ])("%s은 D-5가 아니다", (_label, source) => {
    expect(findD5Violations(source)).toEqual([]);
  });

  /** D-9 — 취소선은 표시가 아니라 **내용**이라 벗기면 «철회됐다»가 사라진다. */
  it("바깥 취소선은 D-5가 아니다", () => {
    expect(findD5Violations('~~"X"~~')).toEqual([]);
  });

  /** B-3 — 안쪽 겹침은 D-5가 아니라 D-2·U-1의 관할이다. **근거가 다르다.** */
  it("안쪽 겹침은 D-5가 아니다 — B-3의 관할이다", () => {
    expect(findD5Violations('*"**X**"*')).toEqual([]);
  });

  /** Q-1 — 코드 표기 안은 인용부호가 아니므로 감쌀 인용 구간이 없다. */
  it("코드 스팬 안은 잡히지 않는다", () => {
    expect(findD5Violations('`**"X"**`')).toEqual([]);
  });

  it("코드 펜스 안은 잡히지 않는다", () => {
    expect(findD5Violations(["```md", '**"X"**', "```"].join("\n"))).toEqual([]);
  });

  /**
   * Q-2 — *"그래도 쓰이면 그것은 코드 표기가 아니므로 그 안의 큰따옴표는 인용부호다."*
   * **마커가 없는** 4칸 들여쓰기는 코드 블록으로 처리하지 않는다.
   */
  it("4칸 들여쓴 마커 없는 블록 안은 코드 표기가 아니라 잡힌다", () => {
    const source = ["산문 한 줄.", "", '    **"X"**', ""].join("\n");
    expect(findD5Violations(source)).toHaveLength(1);
  });

  /** §3.2와 같은 원리 — 위반 이름이 곧 고칠 곳의 주소이고 «기타»가 없다. */
  it("위반 이름은 하나뿐이고 한 줄에 둘이 있으면 둘 다 잡힌다", () => {
    const findings = findD5Violations('**"X"**와 __"Y"__');
    expect(findings).toHaveLength(2);
    expect([...new Set(findings.map((f) => f.violation))]).toEqual(["outer-emphasis-wrap"]);
  });

  /**
   * **P-4 — 발견의 열은 «위반 형태»의 첫 글자다.** §4가 D-5 갈래에 대해 그 형태를 못박는다:
   * *"D-5는 **감싼 강조 마커**의 첫 글자"*. 기준점은 인용부호 구간의 시작이 **아니라**
   * 구간을 두른 마커 런의 시작이고, 두 읽기는 값이 다르므로 이 단언이 둘을 가른다.
   *
   * **1-기반의 근거도 P-4 아래 문단이다** — *"홀수 갈래의 열은 오늘 언제나 1이다. 문단은
   * 언제나 줄의 시작에서 열리므로"*. 줄의 시작이 1이면 열은 1-기반이다.
   */
  it("자리는 1-기반이고 판정은 자리와 이름만 든다", () => {
    const finding = head(findD5Violations(["첫 줄.", '**"X"**'].join("\n")), "D-5가 안 잡혔다");
    expect(finding.line).toBe(2);
    // 줄 머리에 마커 런이 서므로 1이다. **이 값은 감쌈의 폭을 어떻게 읽든 같다** — 안쪽 별표를
    // 첫 형식의 일부로 읽어 폭 1로 보든, 평문 큰따옴표를 `**`가 감쌌다고 보아 폭 2로 보든
    // 마커 런의 첫 글자는 같은 자리다. 반대로 구간의 첫 글자로 읽으면 그 두 읽기가 2와 3으로
    // 갈린다 — 기준점을 마커에 두면 P-1의 경계 물음이 이 값에 안 샌다.
    expect(finding.column).toBe(1);
    expect(Object.keys(finding).sort()).toEqual(["column", "detail", "line", "violation"]);
  });

  /**
   * **폭이 달라도 기준점은 마커 런의 첫 글자다**(P-4 · §4). D-8이 강조 마커를 부류로 열면서
   * 폭을 술어에 안 담았고, P-4·§4도 *"감싼 강조 마커"*의 폭을 묻지 않는다 — 그러므로 폭 1과
   * 폭 2가 **같은 자리**를 내야 한다.
   *
   * **표본 셋 다 열이 4다.** 앞말이 세 글자(`앞`·`말`·공백)라 마커 런이 네 번째 칸에서
   * 열린다. 구간의 첫 글자를 기준점으로 읽으면 폭에 따라 5·6으로 **갈린다** — 기대값이 폭에
   * 안 움직인다는 것 자체가 이 단언이 재는 것이다.
   *
   * **표본에서 `**"X"**`를 뺐다.** 그 형태는 안쪽 별표가 첫 형식(`*"…"*`)의 일부로도 읽혀
   * 폭이 1인지 2인지가 표본 자신에서 안 갈린다(P-1이 여닫 표기를 구간에 넣으므로). 밑줄
   * 계열과 «…»는 인용부호 형식이 별표를 안 쓰므로 폭이 표기에서 바로 읽힌다 — D-5 규칙
   * 칸이 든 두 형태 중 «…» 쪽이 그것이다.
   */
  it.each([
    ["폭 1 — 밑줄 하나", '앞말 _"X"_'],
    ["폭 2 — 밑줄 둘", '앞말 __"X"__'],
    ["폭 2 — 별표 둘 + «…»", "앞말 **«X»**"],
  ])("%s — 열은 감싼 마커의 첫 글자다", (_label, source) => {
    const finding = head(findD5Violations(source), "D-5가 안 잡혔다");
    expect(finding.line).toBe(1);
    expect(finding.column).toBe(4);
  });

  /*
   * **[미규정] 비대칭 강조 런은 단언하지 않는다 — 판정 필요.** 왼쪽과 오른쪽 마커 개수가 다른
   * 입력(별표 둘로 열고 하나로 닫는 형태 따위)이 D-5인가, D-5라면 열이 어디인가를 **정본이
   * 가르지 않았다** — D-7은 마커 쌍이 구간의 *"바로 바깥"*에서 열고 닫을 것만 요구하고 두 런의
   * 길이가 같아야 한다고는 하지 않으며, D-8은 부류만, P-4·§4는 *"감싼 강조 마커"*의 첫 글자만
   * 든다. Q-1·Q-6이 백틱·펜스에 대해 런 길이를 술어에 넣은 것과 달리 강조 런에는 그런 항이
   * 없다. **단언하면 정해지지 않은 것을 계약처럼 굳힌다.**
   */

  /**
   * §4 — *"D-5 위반의 출력은 «원문»을 싣지 않는다"*. 게이트 출력이 실행 리포트·devnote를 거쳐
   * **S-4의 코퍼스에 들어가면** §3.4가 자기 문면에 대해 둔 회피를 게이트가 우회하는 경로가 된다.
   * `detail`이 문면을 담으면 그 경로가 그대로 열린다.
   */
  it("판정은 인용된 문면을 싣지 않는다", () => {
    const 문면 = "코퍼스를 오염시키는 문자열";
    const finding = head(findD5Violations(`**"${문면}"**`), "D-5가 안 잡혔다");
    // 비어 있으면 위 단언이 **공허하게** 통과한다 — 무엇을 싣지 않았는지 재려면 무언가를
    // 싣고 있어야 한다. `.d.mts`가 `detail`을 필수 필드로 들고, §3.2 갈래의 같은 필드가
    // 같은 이유로 비지 않는다(축 3의 마지막 케이스).
    expect(finding.detail.length).toBeGreaterThan(0);
    expect(finding.detail).not.toContain(문면);
  });

  it("D-5가 없으면 빈 배열이다 — 던지지 않는다", () => {
    expect(findD5Violations("강조도 인용부호도 없는 산문.")).toEqual([]);
    expect(findD5Violations("")).toEqual([]);
  });

  /** D-7의 판정 단위 — `outerWrap`은 **정확히** 감싼 것만 돌려준다. */
  it("outerWrap은 정확히 감싼 쌍만 돌려주고 진부분은 null이다", () => {
    const exact = '**"X"**';
    const exactSpan = head(quoteSpans(exact), "인용부호 구간이 잡히지 않았다");
    const wrap = outerWrap(exact, exactSpan.start, exactSpan.end);
    expect(wrap).not.toBeNull();
    expect(wrap?.kind).toBe("강조");

    const partial = "**«X»의 뜻**";
    const partialSpan = head(quoteSpans(partial), "인용부호 구간이 잡히지 않았다");
    expect(outerWrap(partial, partialSpan.start, partialSpan.end)).toBeNull();
  });

  /** D-9 — 취소선은 «부류 밖»이지 «못 본 것»이 아니다. 갈래를 들어야 D-9가 판정으로 산다. */
  it("outerWrap은 취소선을 갈래로 구별한다", () => {
    const source = '~~"X"~~';
    const span = head(quoteSpans(source), "인용부호 구간이 잡히지 않았다");
    expect(outerWrap(source, span.start, span.end)?.kind).toBe("취소선");
  });
});

/**
 * §3.4 Q-7 · §4. **파서는 글자가 짝을 이룬다고 가정하고, 가정이 깨지면 틀린 답이 아니라 조용한
 * 0을 낸다** — 이 축은 그 침묵을 실패로 바꾼 계약을 잰다.
 *
 * 기대값의 출처는 Q-7 규칙 칸과 그 아래 네 문단이다:
 *   - *"한 문단 안에서 평문 부류 글자의 수가 홀수이거나 펜스가 문서 끝까지 안 닫히면, 그 문서의
 *     인용부호 구간은 판정되지 않은 것이다 — 게이트는 조용한 0이 아니라 실패를 낸다"*
 *   - *"Q-7이 패리티를 재는 단위는 **문단 경계**이고 S-5의 단위가 아니다"*
 *   - *"짝 없는 글자의 자리는 그 문단의 첫 글자다 … 미닫힌 펜스는 다르다: 여는 줄이 특정된다"*
 *   - *"겹화살괄호 부류는 Q-7 밖이다"* · 탈출은 §3.3과 같다 — *"코드 표기로 들면 Q-1이 마스킹한다"*
 *   - §4 — 자리는 D-5와 **같은 형태**(문서 · 줄 · 열)이고 **출력은 문면을 안 싣는다**
 *
 * **2026-08-16 — P-4·P-5가 «열»과 «발견의 수»를 정했다**(§3.4 «파서와 게이트가 내는 값»). 그날까지
 * 이 축은 둘을 미규정으로 들고 열을 *"1 이상"*으로만 쟀는데, 그 서술은 이제 거짓이므로 남기지
 * 않는다. 두 값의 출처는 이렇다:
 *   - P-4 — *"발견의 열은 위반 형태의 첫 글자다. 위반 형태가 문자열 안에서 특정되지 않으면 **그것을
 *     담은 상한의 첫 글자**다"* · §4 — *"Q-7 미닫힘은 **펜스 마커**의 첫 글자, Q-7 홀수는 **그
 *     문단**의 첫 글자다"*
 *   - P-5 — *"발견은 자리마다 하나다 — 홀수 문단이 둘이면 발견도 둘이다"* · *"미닫힌 펜스는 문서에
 *     **최대 하나**다"*
 *
 * **표본은 정본 문면에서 독립으로 도출했다** — 플랜 T-001이 든 수용 표본 목록을 베끼지 않고,
 * 구현(`scripts/doc-citation.mjs`)과 `.d.mts`도 값의 출처로 쓰지 않았다(둘 다 같은 사이클에
 * 개정되는 중이라 «구현이 이러니 이게 맞겠지»가 성립하지 않는다). 시그니처만 `.d.mts`에서 읽었다.
 */
describe("축 8 — Q-7: 짝이 어긋난 입력에서 조용한 0을 내지 않는다 (§3.4 · §4)", () => {
  const names = (findings: readonly { readonly violation: string }[]): string[] =>
    findings.map((finding) => finding.violation);

  /* --- 홀수 갈래 --------------------------------------------------------- */

  it.each([
    ["곧은 글자 하나", '앞말 "짝을 잃은 글자가 이 문단에 하나 있다.'],
    ["곡선 여는 글자 하나", "앞말 “짝을 잃은 곡선 글자가 하나 있다."],
    ["곡선 닫는 글자 하나", "앞말 짝을 잃은 곡선 닫는 글자가 하나 있다.”"],
    ["셋 — 짝수가 아니면 수를 안 가린다", '"하나" 그리고 "짝이 없는 셋째'],
  ])("한 문단 안 평문 부류 글자가 홀수면 발견이다 — %s", (_label, doc) => {
    const findings = findQ7Violations(doc);
    expect(
      findings.length,
      "홀수인데 발견이 0이다 — 조용한 0이 바로 Q-7이 닫은 것이다",
    ).toBeGreaterThan(0);
    expect(names(findings)).toContain(UNPAIRED_QUOTE);
  });

  /**
   * **패리티의 상한이 문단이라는 것을 이 표본 하나가 가른다.** 문서 전체로 세면 둘이라 짝수이고
   * 발견이 0이 되는데, §3.4는 상한을 문단으로 못박았다(*"Q-7이 패리티를 재는 단위는 문단
   * 경계이고 S-5의 단위가 아니다"*). 문서 단위로 세는 읽기에서 이 검사가 red가 된다.
   */
  it("문서 전체로는 짝수여도 문단마다 홀수면 발견이다 — 상한은 문단 경계다", () => {
    const doc = ['앞 문단이 "를 하나 든다.', "", '뒤 문단도 "를 하나 든다.'].join("\n");
    const findings = findQ7Violations(doc);
    expect(findings.length, "문서 단위로 세면 짝수라 0이 된다").toBeGreaterThan(0);
    expect(names(findings)).toContain(UNPAIRED_QUOTE);
    // 자리는 **그 문단의 첫 글자**이므로 문단이 시작하는 줄만 나온다.
    expect(findings.map((finding) => finding.line).every((line) => line === 1 || line === 3)).toBe(
      true,
    );
  });

  /**
   * **P-5 — *"발견은 자리마다 하나다 — 홀수 문단이 둘이면 발견도 둘이다."*** 위 검사가 «둘 다
   * 나온다»까지만 재므로 하나로 뭉치는 구현도 그린이다. **수가 계약이다** — §4가 같은 값을
   * 다시 든다(*"홀수 문단이 둘이면 발견도 둘이고"*).
   *
   * **왜 수가 문제인가는 P-5 자신이 든다** — *"문서에 하나면 자리를 고를 수 없다"*(어느 문단을
   * 들든 나머지가 숨는다) · *"숨기면 고치는 쪽이 한 번에 하나씩만 본다"*. 즉 문서 단위로 세면
   * 게이트가 막으려던 조용함이 **한 층 아래로 옮겨갈 뿐**이다.
   */
  it("홀수 문단이 둘이면 발견도 둘이다 — 자리마다 하나다 (P-5)", () => {
    const doc = [
      '첫 문단이 "를 하나 든다.',
      "",
      "짝이 맞는 가운데 문단은 아무것도 안 낸다.",
      "",
      '셋째 문단도 "를 하나 든다.',
    ].join("\n");
    const findings = findQ7Violations(doc).filter(
      (finding) => finding.violation === UNPAIRED_QUOTE,
    );
    expect(findings, "문서 단위로 세면 하나로 뭉쳐 나머지 문단이 숨는다").toHaveLength(2);
    expect(findings.map((finding) => finding.line)).toEqual([1, 5]);
  });

  /**
   * **같은 규칙의 반대 방향** — 자리는 **문단**이지 글자가 아니다(*"짝 없는 글자의 자리는 그
   * 문단의 첫 글자다"* · 그 이유는 *"어느 글자가 짝을 잃었는지는 문자열 안에서 안 갈리고,
   * **그것이 이 규칙이 존재하는 이유 자체다**"*). 한 문단에 부류 글자가 셋이어도 자리는 하나이므로
   * 발견도 하나다 — 글자마다 세는 구현이면 이 단언이 red가 된다.
   */
  it("한 문단 안 부류 글자가 셋이어도 발견은 하나다 — 자리는 글자가 아니라 문단이다 (P-5)", () => {
    const findings = findQ7Violations('"하나" 그리고 "짝이 없는 셋째');
    expect(findings).toHaveLength(1);
    expect(names(findings)).toEqual([UNPAIRED_QUOTE]);
  });

  /**
   * *"짝 없는 글자의 자리는 그 문단의 첫 글자다"* — 지목이 아니라 문단을 든다.
   *
   * **열은 1이고, 그것은 규칙이 아니라 귀결이다.** P-4 둘째 절이 *"위반 형태가 문자열 안에서
   * 특정되지 않으면 그것을 담은 **상한**의 첫 글자"*라 했고, 홀수 갈래의 위반 형태는 특정되지
   * 않으므로(*"어느 글자가 짝을 잃었는지는 문자열 안에서 안 갈린다"*) 상한인 **문단**의 첫 글자로
   * 내려앉는다. 오늘 상한이 문단이고 *"문단은 언제나 줄의 시작에서 열리므로"* 그 값이 상수 1이다 —
   * 정본의 표현 그대로 *"**규칙이 아니라 귀결이고, 뒤집히면 상한 계산이 깨졌다는 신호다.**"*
   *
   * **§6 U-l이 닫히면 이 값이 움직인다.** 정본이 그 의존을 명시한다 — *"상한을 칸으로 내리면
   * 홀수 갈래의 자리도 칸의 첫 글자가 되어 열이 1이 아니게 된다."* 즉 **이 단언이 red로 뒤집히는
   * 길은 둘뿐이다**: 상한 계산이 깨졌거나, U-l이 닫혔거나. 아래 «상한은 S-5의 단위가 아니다»
   * 검사가 같은 의존을 반대편(계수 0)에서 잡고 있고, 이 둘은 U-l이 닫히는 날 함께 뒤집힌다.
   *
   * **표본이 이 값을 재게 만든다** — 부류 글자가 줄 머리가 아니라 문단 둘째 줄의 중간에 서므로,
   * 글자 자신을 지목하는 읽기(P-4 첫째 절을 홀수 갈래에도 적용하는 읽기)에서는 열이 1이 아니다.
   */
  it("홀수 갈래의 자리는 그 문단의 첫 줄·첫 글자다 (P-4 둘째 절)", () => {
    const doc = [
      "첫 문단은 짝이 맞는다.",
      "",
      "둘째 문단이 이어지다가",
      '이 줄 한가운데에서 "를 하나 든다.',
    ].join("\n");
    const finding = head(findQ7Violations(doc), "Q-7이 안 잡혔다");
    expect(finding.line, "문단의 첫 줄이지 글자가 선 줄이 아니다").toBe(3);
    expect(finding.column, "상한(문단)의 첫 글자이므로 오늘은 언제나 1이다").toBe(1);
  });

  /**
   * **«언제나»가 한정 없이 쓰였으므로 접두·들여쓰기에서도 1이다.** 정본은 *"홀수 갈래의 열은
   * 오늘 **언제나** 1이다"*라 적고 예외를 두지 않는다 — 근거가 *"문단은 언제나 줄의 시작에서
   * 열리므로"*라 컨테이너를 묻지 않는 서술이다.
   *
   * **이 표가 두 갈래의 분기를 고정한다.** 같은 세 모양에서 미닫힘 갈래는 1·3·5로 갈리는데
   * (위 «미닫힘의 열은 펜스 마커의 첫 글자다»), 홀수 갈래는 셋 다 1이다. 갈리는 이유는 P-4의
   * **두 절이 서로 다르게 걸리기 때문**이다 — 펜스는 위반 형태가 문자열 안에서 특정되어 첫째
   * 절이 걸리고, 홀수는 특정되지 않아 둘째 절로 내려앉는다. **한 갈래의 규약을 다른 갈래에
   * 복사한 구현이면 여기 아니면 저기가 red가 된다.**
   */
  it.each([
    ["인용 블록 접두", '> 이 문단이 "를 하나 든다.'],
    ["4칸 들여쓰기", '    이 문단이 "를 하나 든다.'],
    ["목록 항목", '- 이 항목이 "를 하나 든다.'],
  ])("홀수 갈래의 열은 컨테이너를 묻지 않고 1이다 — %s", (_label, third) => {
    const finding = head(findQ7Violations(["산문.", "", third].join("\n")), "Q-7이 안 잡혔다");
    expect(finding.line).toBe(3);
    expect(finding.column, "미닫힘 갈래의 마커 기준점을 홀수 갈래에 복사했다").toBe(1);
  });

  /* --- 미닫힘 갈래 ------------------------------------------------------- */

  it("닫는 줄이 아예 없는 펜스는 발견이다", () => {
    const doc = ["산문 한 줄.", "", "```ts", 'const a = "X";'].join("\n");
    const findings = findQ7Violations(doc);
    expect(names(findings)).toContain(UNCLOSED_FENCE);
  });

  it.each([
    ["물결로 열고 백틱으로 닫음 — 마커 문자", ["산문.", "", "~~~ts", "code", "```", "", "끝."]],
    ["여는 런 5 · 닫는 런 4 — 런 길이", ["~~~~~ts", "code", "~~~~", "", "끝."]],
  ])("Q-6이 «안 닫힌다»로 읽는 쌍은 미닫힘 발견이다 — %s", (_label, lines) => {
    expect(names(findQ7Violations(lines.join("\n")))).toContain(UNCLOSED_FENCE);
  });

  /**
   * *"Q-6이 «닫힌다»로 읽는 쌍은 미닫힘이 아니다"*의 방향. 위 표만 있으면 *"펜스를 본 순간
   * 무조건 미닫힘"*인 판정도 그린이고, 그 판정은 계약을 지킨 문서를 전부 red로 만든다 —
   * Q-6이 자리를 닫기 판정에서 뺀 것이 여기서 그대로 걸린다.
   */
  it.each([
    ["컨테이너가 어긋난 쌍", ["> ```ts", "> code", "```", "", "끝."]],
    ["들여쓰기가 어긋난 쌍", ["    ```ts", "    code", "```", "", "끝."]],
    ["닫는 런이 여는 런보다 긴 쌍", ["```ts", "code", "`````", "", "끝."]],
  ])("Q-6이 «닫힌다»로 읽는 쌍은 미닫힘이 아니다 — %s", (_label, lines) => {
    expect(findQ7Violations(lines.join("\n"))).toEqual([]);
  });

  /** *"미닫힌 펜스는 다르다: 여는 줄이 특정되므로 그 자리를 든다."* */
  it("미닫힘 갈래의 자리는 여는 줄이다 (1-기반)", () => {
    const doc = ["산문 한 줄.", "", "산문 두 줄.", "", "```ts", "code"].join("\n");
    const finding = head(
      findQ7Violations(doc).filter((item) => item.violation === UNCLOSED_FENCE),
      "미닫힘이 안 잡혔다",
    );
    expect(finding.line).toBe(5);
    // 줄 머리에 마커가 서므로 1이다 — 아래 표가 그 1이 «줄의 시작»이 아니라 «마커의 시작»이라는
    // 것을 접두·들여쓰기 표본으로 가른다.
    expect(finding.column).toBe(1);
  });

  /**
   * **P-4 — 미닫힘의 열은 «펜스 마커»의 첫 글자다.** §4가 갈래별로 못박는다: *"Q-7 미닫힘은
   * **펜스 마커**의 첫 글자"*. 위반 형태가 문자열 안에서 특정되는 갈래이므로 P-4 **첫째** 절이
   * 걸리고, 홀수 갈래처럼 상한으로 내려앉지 않는다.
   *
   * **표본 셋이 두 읽기를 가른다.** 열을 «여는 줄의 첫 글자»로 두는 읽기에서는 셋 다 1이 되고,
   * 마커로 두면 1·3·5로 갈린다(접두 `> ` 두 글자 뒤 · 공백 넉 칸 뒤). P-4가 마커를 고른 근거
   * 셋째가 정확히 이 표다 — *"미닫힘의 열을 여는 줄의 첫 글자로 두면 값이 언제나 1이라 줄이 이미
   * 든 것을 되풀이할 뿐이고, 인용 블록 접두·들여쓰기에서 어느 펜스인지 특정하지 못한다.
   * 마커로 두면 **열 1이 «자리를 특정하지 못했다»는 신호가 된다.**"*
   *
   * **두 표본이 열기 판정에도 걸려 있다** — Q-2가 *"몇 칸을 들여썼든 코드 표기다"*로 들여쓴
   * 펜스를 부류에 넣었고, Q-6이 인용 블록 접두를 같은 근거로 닫기 판정에서 뺐다. 그 둘이
   * 무너지면 이 표는 열이 아니라 **발견 0**으로 red가 되고, 그것도 잡아야 할 위반이다.
   */
  it.each([
    ["맨앞 — 마커가 줄 머리다", ["산문.", "", "```ts", "code"], 3, 1],
    ["인용 블록 접두 — `> ` 뒤", ["산문.", "", "> ```ts", "> code"], 3, 3],
    ["4칸 들여쓰기 — 공백 넉 칸 뒤", ["산문.", "", "    ```ts", "    code"], 3, 5],
  ])("미닫힘의 열은 펜스 마커의 첫 글자다 — %s", (_label, lines, line, column) => {
    const finding = head(
      findQ7Violations(lines.join("\n")).filter((item) => item.violation === UNCLOSED_FENCE),
      "미닫힘이 안 잡혔다",
    );
    expect(finding.line).toBe(line);
    expect(finding.column).toBe(column);
  });

  /**
   * **P-5 — *"미닫힌 펜스는 문서에 최대 하나다 — 열린 펜스가 문서 끝까지 마스크하므로 둘째가
   * 원리적으로 안 생긴다."*** 홀수 갈래와 달리 이쪽은 수가 **위로 막혀 있고**, 그것이 P-5가
   * *"이 규칙이 수를 늘리는 것은 홀수 갈래뿐이다"*라고 적은 근거다.
   *
   * **표본은 «둘째 여는 줄처럼 보이는 것»을 뒤에 둔다.** 물결 마커라 Q-6의 닫기 판정에 안 걸리고
   * (*"닫는 마커는 여는 마커와 **같은 문자**"*), 앞 펜스가 문서 끝까지 마스크하므로 새 열기도
   * 아니다. 마스킹이 여는 줄에서 끝나는 구현이면 발견이 둘이 되어 red가 된다.
   */
  it("미닫힌 펜스는 문서에 최대 하나다 (P-5)", () => {
    const doc = ["산문.", "", "```ts", "code", "~~~js", "more", "~~~~ ~~~"].join("\n");
    const findings = findQ7Violations(doc).filter((item) => item.violation === UNCLOSED_FENCE);
    expect(findings, "뒤의 마커가 둘째 미닫힘으로 세어졌다").toHaveLength(1);
    expect(head(findings, "미닫힘이 안 잡혔다").line).toBe(3);
  });

  /* --- 상한이 무엇인가 --------------------------------------------------- */

  /**
   * *"상한은 구간 추출이 쓰는 것과 같은 값이다 … 그물이 다른 값을 쓰면 지키려는 대상과
   * 어긋난다."* 두 층에서 **같은 문서로** 잰다 — 구간 추출이 문단을 넘는 후보를 버리는 바로 그
   * 자리가, 그물에서는 양쪽 문단의 홀수로 나와야 한다. 값이 갈리면 그물이 지키려는 대상을
   * 안 지킨다.
   */
  it("패리티의 상한은 구간 추출이 쓰는 상한과 같은 값이다 — 문단 경계", () => {
    const doc = ['앞 문단이 "를 열고', "", '뒤 문단이 "로 닫는 모양이다.'].join("\n");
    expect(quoteSpans(doc), "문단을 넘는 후보는 구간이 아니다").toEqual([]);
    const findings = findQ7Violations(doc);
    expect(findings.length, "구간 추출이 버린 자리를 그물이 안 잡았다").toBeGreaterThan(0);
    expect(names(findings)).toContain(UNPAIRED_QUOTE);
  });

  /**
   * 같은 문장의 뒷부분 — *"S-5의 단위가 아니다"*. 표는 빈 줄이 없어 **표 전체가 한 문단**이므로
   * 한 줄 안의 두 칸이 서로 상쇄하면 안 걸린다(*"패리티는 그물이지 보증이 아니다"*). 상한을
   * S-5의 단위(표 한 칸)로 읽으면 이 표본이 걸리므로, **0이라는 것이 상한을 가르는 관측이다.**
   * 상한을 칸으로 내릴 것인가는 §6 U-l이 들고 있다 — **이 검사가 red로 뒤집히는 날이 U-l이
   * 닫힌 날이다.**
   */
  it("상한은 S-5의 단위가 아니다 — 한 문단 안에서 상쇄하면 안 걸린다 (§6 U-l)", () => {
    expect(findQ7Violations('| "앞 칸 | 뒤 칸" |')).toEqual([]);
  });

  /* --- 음성 표본 --------------------------------------------------------- */

  it("짝이 맞고 펜스가 닫힌 문서는 발견 0이다", () => {
    const doc = [
      '그는 "X"라고 적었고 «Y»도 들었다.',
      "",
      "```ts",
      'const a = "Y";',
      "```",
      "",
      "끝 문단은 “곡선 쌍”을 든다.",
    ].join("\n");
    expect(findQ7Violations(doc)).toEqual([]);
  });

  /**
   * §3.4가 명시한 탈출 — *"비용은 정당한 홀수 글자가 게이트를 깨는 것이고 탈출은 이미 있다:
   * 코드 표기로 들면 Q-1이 마스킹한다"*. 이 탈출이 막히면 정당한 문서가 red가 되고, 그것이
   * §3.3이 숫자에 대해 둔 탈출과 같은 자리다.
   */
  it.each([
    ["인라인 스팬 안", '금지 표기는 `"` 한 글자다.'],
    ["이중 백틱 스팬 안", '금지 표기는 `` " `` 한 글자다.'],
    ["펜스 안", ["```ts", 'const a = "짝이 없다;', "```", "", "끝."].join("\n")],
  ])("홀수 글자가 코드 표기 안이면 발견 0이다 — %s", (_label, doc) => {
    expect(findQ7Violations(doc)).toEqual([]);
  });

  /** *"겹화살괄호 부류는 Q-7 밖이다 — 여는 글자와 닫는 글자가 다르므로 패리티가 안 밀린다."* */
  it.each([
    ["짝 없는 여는 글자", "이 문단은 «짝을 잃은 여는 글자를 든다."],
    ["짝 없는 닫는 글자", "이 문단은 짝을 잃은 닫는 글자» 를 든다."],
    ["문단을 넘는 배치", ["앞 문단이 «를 든다.", "", "뒤 문단이 »를 든다."].join("\n")],
  ])("겹화살괄호의 짝이 어긋나도 발견 0이다 — %s", (_label, doc) => {
    expect(findQ7Violations(doc)).toEqual([]);
  });

  it("빈 문서와 인용부호 없는 산문은 발견 0이다 — 던지지 않는다", () => {
    expect(findQ7Violations("")).toEqual([]);
    expect(findQ7Violations("따옴표도 펜스도 없는 산문.")).toEqual([]);
  });

  /* --- 출력 형태 (§4) ----------------------------------------------------- */

  /**
   * §4 — *"자리는 D-5와 같은 형태(문서 · 줄 · 열)로 내고 출력은 문면을 안 싣는다"* · *"Q-7의 두
   * 갈래는 D-5와 **같은 유니온**에 든다"*. 유니온은 타입이라 런타임에 없으므로, 관측 가능한
   * 자국인 **판정의 형태가 같다**를 잰다.
   */
  it("Q-7 판정은 D-5와 같은 형태다 — 키 집합이 같다", () => {
    const q7 = head(findQ7Violations('짝이 없는 "'), "Q-7이 안 잡혔다");
    const d5 = head(findD5Violations('**"X"**'), "D-5가 안 잡혔다");
    expect(Object.keys(q7).sort()).toEqual(["column", "detail", "line", "violation"]);
    expect(Object.keys(q7).sort()).toEqual(Object.keys(d5).sort());
  });

  /**
   * §4 — 출력이 문면을 실으면 그것이 실행 리포트·devnote를 거쳐 **S-4의 코퍼스**에 들어간다.
   * D-5에 대해 축 7이 든 것과 같은 근거이고, Q-7은 **문단 전체**가 원문이라 더 넓다.
   */
  it("판정은 문단의 문면을 싣지 않는다", () => {
    const 문면 = "코퍼스를 오염시키는 문자열";
    const finding = head(findQ7Violations(`${문면} "`), "Q-7이 안 잡혔다");
    // 비어 있으면 아래 단언이 공허하게 통과한다 — 무엇을 안 실었는지 재려면 무언가를 싣고 있어야
    // 한다(축 7의 같은 케이스와 같은 근거).
    expect(finding.detail.length).toBeGreaterThan(0);
    expect(finding.detail).not.toContain(문면);
  });

  it("이름은 두 갈래뿐이다 — 홀수와 미닫힘", () => {
    const sources = [
      '앞말 "짝 없음.',
      "앞말 “짝 없는 곡선.",
      ["```ts", "code"].join("\n"),
      ["~~~ts", "code", "```"].join("\n"),
      '짝이 맞는 "문단"은 아무 이름도 안 낸다.',
    ];
    const found = new Set<string>();
    for (const source of sources) {
      for (const finding of findQ7Violations(source)) found.add(finding.violation);
    }
    expect([...found].sort()).toEqual([UNCLOSED_FENCE, UNPAIRED_QUOTE].sort());
  });
});

describe("미규정 — 정본이 정하지 않은 자리 (§6)", () => {
  /**
   * §3.2가 갈래를 둘로 닫으며 *"셋째 형태가 나오면 그때 늘리되 «기타»를 두지 않는다"*고 적었다.
   * 플랜 작성 중 `<한글 앵커>:<숫자>` 형태가 `kanban.md`에서 하나 나왔다(`docs/` 안에는 0건).
   * 게이트 범위 밖이라 지금은 위반이 아니고, 갈래를 늘리는 판정은 `K-044`가 든다.
   * **단언하면 정해지지 않은 것을 계약처럼 굳힌다.**
   */
  it.todo("한글 앵커 + 줄번호(`머리:12` 형태)를 셋째 갈래로 잡을 것인가 — K-044");

  /** §6 U-a — 이 게이트는 형식만 본다. 절 번호가 실재하는 절인지는 `K-002`의 자리다. */
  it.todo("존재하지 않는 절 번호를 가리키는 인용을 잡을 것인가 — K-002");

  /** §6 U-c — 강제 범위는 `docs/*.md`다. 기록으로 넓힐 것인지는 `K-044`. */
  it.todo("`kanban.md` 등 기록까지 검사 범위를 넓힐 것인가 — K-044");

  /* --- 2026-08-15 이관분에서 새로 연 자리 (축 6·축 7) --------------------------------- */

  /**
   * `.d.mts`의 `QuoteSpan`이 *"인용부호 구간"*이라고만 하고, 구간이 인용부호 **문자 자신**을
   * 포함하는지(`"X"`인지 `X`인지)를 정하지 않는다. `outerWrap`이 그 경계 바로 바깥을 보므로
   * 이 값이 D-7 판정의 입력이다 — 축 6은 두 읽기 모두에서 참인 형태로만 단언한다.
   */
  it.todo("`QuoteSpan`은 인용부호 문자를 포함하는가 — 판정 필요");

  /**
   * §3.4 머리가 인용부호 셋 중 첫째로 `*"…"*`를 들어 **별표 한 겹이 그 형식의 일부**다. 그러면
   * `*«X»*`·`_«X»_`처럼 «…»에 한 겹만 두른 형태는 인용 형식인가 바깥 강조(D-5)인가 — D-8이
   * 마커를 부류로 열었으므로 형식 쪽에도 같은 물음이 선다. 실물은 확인하지 않았다.
   */
  it.todo("«…»에 강조 한 겹을 두른 형태는 형식인가 D-5인가 — 판정 필요");

  /*
   * **2026-08-16 — Q-7이 열었던 자리 둘이 닫혔다.** «발견의 수»와 «홀수 갈래의 열»을 미결로 들고
   * 있던 항목 둘이 여기 있었고, §3.4 P-4·P-5가 그 둘을 정하면서 축 8의 실단언으로 옮겨갔다.
   * 남겨 두면 이 목록이 «아직 안 정해졌다»는 거짓을 서술한다.
   */
});
