/**
 * 문서 인용 형식 — `DOC-CITATION.md`의 기계화.
 *
 * 기대값의 출처는 전부 정본 문서다:
 *   - §3.1 — 판별 기준(*"대상 트리가 고정돼 있는가"*)과 **판별이 인용 문자열 안에서 완결된다**는 것. 축 1·축 2
 *   - §3.2 — `CitationViolation`의 **갈래 둘**, «기타»를 두지 않는다, 허용 형식을 열거하지 않는다. 축 3
 *   - §3.3 — `NN` 탈출 / **억제 목록도 인용 블록 예외도 없다**. 축 4
 *   - §4   — 탐색 범위는 **파일 전체**(머리 40줄이 아니다) · 판정과 실행부가 파일이 다르다. 축 5
 *   - §3.4 — D-5·D-7~D-9(감쌈의 폭·마커 부류·취소선) · Q-1~Q-3(코드 표기와 인용부호). 축 6·축 7
 *
 * **2026-08-15 — 인용부호 구간 파서와 D-5 판정이 이 모듈로 이관됐다**(§6 U-e · §4). 축 6·축 7이
 * 그 표면의 계약이다. 기대값은 `scripts/doc-citation.d.mts`(시그니처)와 §3.4 문면에서만 도출했고
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
   * `scripts/doc-citation.d.mts`의 **값 선언 아홉**이다(`export declare const`·`function`).
   * `type` 선언(`Citation`·`CitationViolation`·`CitationVerdict`·`TextSpan`·`QuoteSpan`·
   * `OuterWrap`·`RuleViolation`·`RuleFinding`)은 런타임에 없으므로 이 목록에 들지 않는다.
   * 뒤 넷은 2026-08-15 이관분이다(§4 · §6 U-e).
   */
  it("순수 모듈은 임포트 시 아무것도 하지 않는다", async () => {
    const module = await import("../../../scripts/doc-citation.mjs");
    expect(Object.keys(module).sort()).toEqual([
      "FENCE_LINE",
      "FROZEN_TREES",
      "findCitations",
      "findD5Violations",
      "judgeCitation",
      "maskCodeFences",
      "maskCodeSpans",
      "outerWrap",
      "quoteSpans",
    ]);
  });
});

/**
 * §3.4 Q-1~Q-3. **마스킹이 먼저다** — Q-1이 코드 표기를 부류로 두고 그 안의 큰따옴표를 인용부호
 * 밖에 두므로, 구간을 재기 전에 코드가 지워져 있어야 한다.
 */
describe("축 6 — 무엇이 코드이고 무엇이 인용부호인가 (§3.4 Q-1~Q-3)", () => {
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

  it("자리는 1-기반이고 판정은 자리와 이름만 든다", () => {
    const finding = head(findD5Violations(["첫 줄.", '**"X"**'].join("\n")), "D-5가 안 잡혔다");
    expect(finding.line).toBe(2);
    // [미규정] 열의 기준점이 **마커의 시작**인지 **인용부호의 시작**인지는 §4도 `.d.mts`도
    // 정하지 않는다. 1-기반이라는 것만 단언한다.
    expect(finding.column).toBeGreaterThanOrEqual(1);
    expect(Object.keys(finding).sort()).toEqual(["column", "detail", "line", "violation"]);
  });

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
   * §4가 D-5 출력을 **문서 · 줄 · 열**로 정했으나 **열의 기준점**을 정하지 않았다 — 강조 마커의
   * 시작인가 인용부호 구간의 시작인가. `.d.mts`도 *"1-기반"*만 든다. 축 7은 그래서 1-기반만
   * 단언한다. **단언하면 정해지지 않은 것을 계약처럼 굳힌다.**
   */
  it.todo("D-5 열의 기준점은 마커의 시작인가 인용부호의 시작인가 — 판정 필요");

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
});
