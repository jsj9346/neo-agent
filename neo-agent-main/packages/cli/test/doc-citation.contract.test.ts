/**
 * 문서 인용 형식 — `DOC-CITATION.md`의 기계화.
 *
 * 기대값의 출처는 전부 정본 문서다:
 *   - §3.1 — 판별 기준(*"대상 트리가 고정돼 있는가"*)과 **판별이 인용 문자열 안에서 완결된다**는 것. 축 1·축 2
 *   - §3.2 — `CitationViolation`의 **갈래 둘**, «기타»를 두지 않는다, 허용 형식을 열거하지 않는다. 축 3
 *   - §3.3 — `NN` 탈출 / **억제 목록도 인용 블록 예외도 없다**. 축 4
 *   - §4   — 탐색 범위는 **파일 전체**(머리 40줄이 아니다) · 판정과 실행부가 파일이 다르다. 축 5
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
  FROZEN_TREES,
  findCitations,
  judgeCitation,
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

  /** §4 — 판정과 실행부는 파일이 다르다. 순수 모듈은 부작용이 없다. */
  it("순수 모듈은 임포트 시 아무것도 하지 않는다", async () => {
    const module = await import("../../../scripts/doc-citation.mjs");
    expect(Object.keys(module).sort()).toEqual(["FROZEN_TREES", "findCitations", "judgeCitation"]);
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
});
