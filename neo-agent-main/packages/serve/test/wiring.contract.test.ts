/**
 * 앵커 조회 통로의 계약 검증. 정본은 `docs/WEB-UI.md` §9.4 **결정 13**이다.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** `client/wiring.js`에서 읽은 것은
 * export 이름과 시그니처뿐이고 분기 조건도 문면도 읽지 않았다. 구현이 문서와 다르면 이 파일은
 * 문서 편에 선다.
 *
 *   - `WEB-UI.md` §9.4 결정 13 — *"배선은 DOM 조회 API를 직접 부르지 않는다."* ·
 *     *"앵커를 여는 통로는 하나이고 그 인자의 타입이 앵커 이름의 유니온이다."* ·
 *     *"못 찾으면 던진다."*
 *   - `WEB-UI.md` §9.4 결정 7 — 앵커 이름의 닫힌 집합을 이 레포가 정본으로 든다. 아래 축이
 *     기대 이름을 다시 적지 않고 `client/anchors.js`에서 받는 근거다
 *   - `WEB-UI.md` §9.3 — 브라우저 모듈에 타입 검사를 거는 배치(`allowJs`·`checkJs`). 아래
 *     컴파일 축이 성립하는 조건이 그것이다
 *
 * ## 이 파일의 절반은 런타임 단언이 아니다
 *
 * 결정 13이 고른 수단은 검사가 아니라 **도달 불가**다 — 목록 밖 이름은 타입 검사가 컴파일
 * 시점에 잡고, *"변수를 거친 조회도 넓은 문자열 타입이 그 유니온에 대입되지 않아"* 같은
 * 자리에서 함께 잡힌다. 그 성질을 재는 자리가 아래 `@ts-expect-error` 축이고, **그 축의 판정은
 * `pnpm typecheck`가 낸다**: 그 지시자는 에러가 나지 않으면 컴파일을 실패시키므로, 통로가
 * 인자 타입을 넓히는 순간 이 파일이 아니라 타입체크가 멈춘다.
 *
 * **그 축이 둘이다** (2026-08-27). 하나는 조회 **이름**이 닫힌 유니온인가를 재고, 다른 하나는
 * 원천이 낼 수 있는 **빈 값**이 `null` 하나로 닫혔는가를 잰다. 결정 13이 던짐을 요구하며 쓴 말이
 * `null`이 아니라 *"빈 값"*이므로 뒤엣것도 계약이고, 그것이 없으면 아래 런타임 축의 `undefined`
 * 갈래가 «단언을 써야 재지는 것»으로만 남아 그 단언이 무엇을 우회한 것인지를 아무것도 안 든다.
 *
 * **그 줄들을 런타임에 실행하지 않는다.** 통로는 못 찾으면 던지므로 실행되면 vitest가 그
 * 자리에서 붉고, 그때 붉는 원인은 계약이 아니라 이 파일의 배치가 된다. 그래서 호출되지 않는
 * 함수 안에 두고 그 함수의 존재만 단언한다(선례는 `packages/core/test/invariants.test.ts`의
 * 타입 전용 검증 배치다).
 *
 * **대조군을 함께 둔다.** 목록 **안** 이름은 지시자 없이 컴파일된다 — 없으면 위 둘이
 * 타입이 인자를 전부 거부하는 상태와 구별되지 않는다. 선례는
 * `packages/cli/test/doc-status.contract.test.ts`의 같은 배치다.
 *
 * ## 이 파일이 재지 못하는 것
 *
 * **배선이 통로를 우회해 DOM API를 직접 부르는 것.** 결정 13이 그 한계를 스스로 적었고
 * (*"배선이 통로를 우회해 DOM API를 직접 부르는 것"*), 그것을 재는 유일한 수단이 그 항이
 * 정확히 거부한 텍스트 스캔이다. 남는 것은 사람의 검토와 그 항이 든 재도입 트리거다.
 *
 * **던지는 오류의 형태도 재지 않는다** — 결정 13이 *"던짐의 자리와 사용자가 보는 형태는
 * 세부다."*로 닫았다. 아래가 재는 것은 던짐의 **존재**와 그 오류가 못 찾은 이름을 드는가뿐이다.
 *
 * ## 결정 11의 표시 판정 — 이 파일의 나머지 절반
 *
 * 같은 모듈의 순수 함수 하나를 말미의 describe가 잰다. 정본은 `WEB-UI.md` §9.4 **결정 11**과
 * 그것이 승계하는 `CLI-INTERFACE.md` **§7.1**이고, 기준은 그 두 절이 같은 낱말로 든
 * *"구별과 비침묵"*이다.
 *
 *   - `CLI-INTERFACE.md` §7.1 — *"두 계약 항목이 켜져 있을 때(기본값일 때)는 표시하지
 *     않는다."* · 측정은 *"승인 모드가 `off`인 세션과 `manual`인 세션의 상태줄 출력이 서로
 *     갈리는가, `off`인 쪽이 비어 있지 않은가"*
 *   - `WEB-UI.md` §9.4 결정 11 — 같은 기준이 웹에서 서고 *"모집단은 화면이 아니라 배선이다"*
 *
 * **재는 것은 판정이지 화면의 실물이 아니다.** 결정 11이 그 한계를 스스로 적었다 —
 * *"오늘 DOM 배선이 0건이라 그 축이 재는 것은 순수 함수 하나이고"*,
 * *"화면이 그 판정을 실제로 그리는가는 결정 8의 대조와 마찬가지로 C2의 브라우저 검증이
 * 진다"*. 그 C2는 루트 `MILESTONE.md`가 든다.
 *
 * **문면도 재지 않는다** — 두 절이 *"문면을 리터럴로 고정하지 않는다"*를 똑같이 적었고,
 * 판정의 반환이 불리언 둘인 것이 그 규율의 실물이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { describe, expect, test } from "vitest";
import { ANCHOR_NAMES } from "../client/anchors.js";
import type { AnchorSource } from "../client/wiring.js";
import { anchorElement, safetyDisplay } from "../client/wiring.js";
import type { StateSnapshot } from "../src/protocol.ts";

// ---------------------------------------------------------------------------
// 주입 원천 — DOM이 아니다
// ---------------------------------------------------------------------------

/**
 * 요소 자리에 세우는 값. **DOM 타입이 아니다** — 통로의 시그니처가 요소 타입을 열어 두었으므로
 * 이 축이 브라우저 환경 없이 선다(§9.4 결정 13의 통로가 원천을 인자로 받는 배치).
 */
type FakeElement = { readonly tag: string };

/** 원천이 실제로 무엇을 물었는지까지 관측한다 — 이름이 그대로 조회 키인가를 재려면 필요하다 */
type Probe = {
  readonly source: AnchorSource<FakeElement>;
  readonly asked: readonly string[];
};

function probe(present: ReadonlyMap<string, FakeElement>): Probe {
  const asked: string[] = [];
  return {
    asked,
    source: {
      getElementById(id: string): FakeElement | null {
        asked.push(id);
        return present.get(id) ?? null;
      },
    },
  };
}

/** 이름 전부가 실재하는 원천 */
function fullScreen(): Probe {
  return probe(new Map(ANCHOR_NAMES.map((name) => [name, { tag: name }])));
}

/** 아무것도 없는 원천 — 화면이 앵커를 안 든 상태 */
const emptyScreen = (): Probe => probe(new Map());

/**
 * **빈 값을 내는 원천 둘.** 결정 13이 던짐을 요구하며 쓴 말은 `null`이 아니라 *"빈 값"*이고
 * (*"통로가 빈 값을 조용히 흘리면"*), `undefined`는 그 외연 안이다. 아래 「빈 값을 조용히
 * 흘리는 갈래가 없다」 축이 이 둘을 전수로 돈다.
 *
 * **`undefined` 쪽이 단언을 거치는 것이 결함이 아니라 계약의 표현이다.** 통로의 원천 타입이
 * 요소를 `object`로 제약하므로 그런 원천은 컴파일에서 붉고, 그 성질은 아래 컴파일 축이 잰다.
 * 여기 단언은 **그 타입 층을 우회한 자리에서도 런타임이 여전히 막는가**를 재려고만 쓴다 —
 * 타입과 런타임 중 하나만 두면 우회가 곧 침묵이다.
 */
const EMPTY_SOURCES: readonly (readonly [string, AnchorSource<FakeElement>])[] = [
  ["null 원천", emptyScreen().source],
  ["undefined 원천", { getElementById: () => undefined } as unknown as AnchorSource<FakeElement>],
];

// ---------------------------------------------------------------------------
// 컴파일 축의 표본 — 런타임 축이 이 리터럴들의 자격을 함께 고정한다
// ---------------------------------------------------------------------------

/**
 * 목록 **안** 이름 하나. 컴파일 축은 리터럴을 요구하므로 여기서 한 번 적되, 이 값이 여전히
 * 목록 안이라는 것은 아래 런타임 축이 잰다 — 목록에서 빠지는 날 컴파일 축이 조용히 뒤집히는
 * 대신 그 축이 먼저 붉는다.
 */
const CONTROL_NAME = "transcript";

/** 목록 **밖** 이름 하나. 같은 근거로 자격을 아래 축이 고정한다 */
const OFF_LIST_NAME = "transcript-foot";

// ---------------------------------------------------------------------------

describe("조회 통로 — 런타임 (WEB-UI §9.4 결정 13)", () => {
  test("원천이 준 요소를 그대로 돌려준다", () => {
    const { source } = fullScreen();
    const element = anchorElement(source, CONTROL_NAME);
    expect(element).toEqual({ tag: CONTROL_NAME });
  });

  test("이름 전량에서 원천이 받은 조회 키가 앵커 이름 그 자체다", () => {
    // 통로가 이름에 접두·접미를 붙이면 화면이 든 `id`와 안 맞고, 그 실패는 조용하다 —
    // 조회가 아무것도 못 찾고 그리기가 그냥 안 일어난다(`ARCHITECTURE.md` §2.6).
    expect(ANCHOR_NAMES.length, "이름이 0이면 아래 전수가 공허하다").toBeGreaterThan(0);
    for (const name of ANCHOR_NAMES) {
      const { source, asked } = fullScreen();
      const element = anchorElement(source, name);
      expect(asked, `${name}: 조회 키가 이름과 다르다`).toEqual([name]);
      expect(element).toEqual({ tag: name });
    }
  });

  test("원천이 돌려준 바로 그 값이다 — 통로가 사본을 만들지 않는다", () => {
    const target: FakeElement = { tag: "동일성 표본" };
    const { source } = probe(new Map([[CONTROL_NAME, target]]));
    expect(anchorElement(source, CONTROL_NAME)).toBe(target);
  });

  test("못 찾으면 던진다 — 이름 전량에서", () => {
    for (const name of ANCHOR_NAMES) {
      const { source } = emptyScreen();
      expect(() => anchorElement(source, name), `${name}: 조용히 흘렸다`).toThrow();
    }
  });

  test("던진 오류가 못 찾은 이름을 든다 — 이름 전량에서", () => {
    // 문면은 세부다. 재는 것은 **어느 이름을 못 찾았는지가 오류에 남는가** 하나다.
    for (const name of ANCHOR_NAMES) {
      const { source } = emptyScreen();
      let caught: unknown;
      try {
        anchorElement(source, name);
      } catch (error) {
        caught = error;
      }
      expect(caught, `${name}: 던지지 않았다`).toBeInstanceOf(Error);
      expect(
        caught instanceof Error ? caught.message : "",
        `${name}: 오류가 못 찾은 이름을 안 든다`,
      ).toContain(name);
    }
  });

  test("빈 값을 조용히 흘리는 갈래가 없다 — 던짐이 유일한 처분이다", () => {
    // 결정 13이 이 자리를 계약으로 든 근거가 결정 8의 한계다: 그 대조는 부분 문자열이라
    // 그린이 런타임의 실재를 보장하지 않는다. 통로가 `null`·`undefined`를 반환값으로 흘리면
    // 그 보증 공백이 화면까지 그대로 간다.
    //
    // **주석이 든 둘을 실제로 둘 다 잰다** (2026-08-27 — 이 축은 한때 `null` 하나만 재면서
    // 주석으로 둘을 들었다. 그것이 `WEB-UI.md` §2.3이 *"검사가 실제보다 넓게 주장하는 것이
    // 진짜 결함이었던 자리"*로 이름 붙인 형태이고, 주장과 측정을 맞추는 쪽으로 뒤집었다).
    expect(EMPTY_SOURCES.length, "빈 값의 외연이 하나면 아래 전수가 공허하다").toBe(2);
    for (const [label, source] of EMPTY_SOURCES) {
      let returned: unknown = "던지지 않았다";
      try {
        returned = anchorElement(source, CONTROL_NAME);
      } catch {
        returned = "던졌다";
      }
      expect(returned, `${label}: 빈 값을 조용히 흘렸다`).toBe("던졌다");
    }
  });

  test("이 모듈이 DOM 전역에 안 닿는다 — 브라우저 없이 통로가 돈다", () => {
    // 이 파일이 통로를 임포트하고 위 축들이 실제로 돈다는 사실 자체가 절반이다(전역 접근이
    // 로드 시점에 있으면 임포트만으로 깨진다). 나머지 절반을 여기서 못박는다 — 원천을 인자로
    // 받으므로 통로가 전역을 볼 필요가 없다(§9.4 결정 13 · §9.3의 경계).
    expect(Object.hasOwn(globalThis, "document"), "node 런에 DOM 전역이 있다").toBe(false);
    const { source } = fullScreen();
    expect(anchorElement(source, CONTROL_NAME)).toEqual({ tag: CONTROL_NAME });
  });
});

describe("조회 통로 — 컴파일 (WEB-UI §9.4 결정 13)", () => {
  /**
   * **타입 전용 검증 — 실행하지 않는다.** 아래 `@ts-expect-error`가 에러를 잡지 못하면
   * `pnpm typecheck`가 unused directive로 실패한다. 통로가 못 찾으면 던지므로 이 함수를
   * 부르면 첫 줄에서 그냥 터진다 — 부르지 않는 것이 배치의 절반이다.
   *
   * `widened`가 인자로 온 것이 변수를 거친 조회의 자리다. 이 파일 안에서 리터럴을 넓히면
   * 그 넓힘 자체가 이 파일의 성질이 되므로, 넓은 타입을 밖에서 받는다.
   */
  function offListNamesDoNotCompile(
    source: AnchorSource<FakeElement>,
    widened: string,
  ): FakeElement[] {
    return [
      // @ts-expect-error §9.4 결정 13 — 목록 밖 이름 리터럴은 앵커 이름의 유니온이 아니다.
      anchorElement(source, OFF_LIST_NAME),
      // @ts-expect-error §9.4 결정 13 — 넓은 문자열은 그 유니온에 대입되지 않는다.
      anchorElement(source, widened),
      // 대조군 — 목록 안 이름은 지시자 없이 컴파일된다. 없으면 위 둘이 타입이 인자를 전부
      // 거부하는 상태와 구별되지 않는다.
      anchorElement(source, CONTROL_NAME),
    ];
  }

  /**
   * **타입 전용 검증 — 실행하지 않는다.** 위와 같은 배치이고 재는 것만 다르다.
   *
   * 결정 13이 던짐을 요구하며 쓴 말이 *"빈 값"*이므로 그 외연은 `null` 하나가 아니다. 통로가
   * 그 외연을 `null` 하나로 닫는 수단이 **원천의 요소 타입 제약**이고, 그것이 빠지면
   * `AnchorSource<요소 | undefined>`가 단언 없이 성립해 통로의 반환에 `undefined`가 섞인다.
   * 아래 지시자가 그 제약의 실재를 잰다 — 제약이 사라지면 에러가 안 나고 `pnpm typecheck`가
   * unused directive로 멈춘다.
   */
  function emptyValueSourcesDoNotCompile(): void {
    // @ts-expect-error §9.4 결정 13 — 빈 값이 `undefined`인 원천은 요소 타입 제약이 막는다.
    const undefinedSource: AnchorSource<FakeElement | undefined> = {
      getElementById: () => undefined,
    };
    void undefinedSource;
  }

  test("컴파일 축이 실제로 존재한다 — 실행하지 않고 존재만 단언한다", () => {
    expect(offListNamesDoNotCompile).toBeTypeOf("function");
    expect(emptyValueSourcesDoNotCompile).toBeTypeOf("function");
  });

  test("대조군 이름이 여전히 목록 안이다", () => {
    // 이 축이 없으면 대조군이 목록에서 빠지는 날 그 줄이 조용히 `@ts-expect-error` 대상이
    // 되고, 그때 컴파일 축은 전부 거부하는 상태를 재는 것으로 뒤집힌 채 그린이다.
    const names: readonly string[] = ANCHOR_NAMES;
    expect(names, "대조군이 목록 밖으로 나갔다").toContain(CONTROL_NAME);
  });

  test("목록 밖 표본이 여전히 목록 밖이다", () => {
    const names: readonly string[] = ANCHOR_NAMES;
    expect(names, "목록 밖 표본이 목록 안으로 들어왔다").not.toContain(OFF_LIST_NAME);
  });
});

// ---------------------------------------------------------------------------
// 표시 판정의 입력 — 네 조합은 손 목록이 아니라 곱이다
// ---------------------------------------------------------------------------

type SafetyFacts = StateSnapshot["safety"];

/**
 * 두 도메인. 정본은 `WEB-UI.md` §6.1의 `StateSnapshot`이고, 그 절이 값을
 * *"`packages/cli`의 설정 유니온을 그대로 옮긴 것이고 이 문서가 넓히지 않는다"*로 닫았다.
 *
 * **여기 적은 것은 그 유니온의 사본이 아니라 곱의 재료다.** 사본이 낡는 것은 아래 타입 단언이
 * 막는다 — 도메인이 넓어지면 그 자리가 컴파일에서 붉고, 그때 이 축의 전수가 표본으로 조용히
 * 내려앉는 대신 먼저 붉는다.
 */
const APPROVAL_MODES = ["manual", "off"] as const satisfies readonly SafetyFacts["approvalMode"][];
const SANDBOXES = ["on", "off"] as const satisfies readonly SafetyFacts["sandbox"][];

/** 두 도메인의 곱. **전수인 것이 이 배열의 성질이지 손으로 센 결과가 아니다** */
const SAFETY_COMBINATIONS: readonly SafetyFacts[] = APPROVAL_MODES.flatMap((approvalMode) =>
  SANDBOXES.map((sandbox) => ({ approvalMode, sandbox })),
);

/** 판정이 채우는 두 자리의 이름. 아래 축 하나가 이 둘이 앵커 목록 안임을 함께 고정한다 */
const APPROVAL_SLOT = "safety-approval-mode";
const SANDBOX_SLOT = "safety-sandbox";

const label = (safety: SafetyFacts): string =>
  `approvalMode=${safety.approvalMode} sandbox=${safety.sandbox}`;

describe("표시 판정 (WEB-UI §9.4 결정 11 · CLI-INTERFACE §7.1)", () => {
  test("도메인의 곱이 전수다 — 조합이 넷이고 서로 다르다", () => {
    // 이 축이 없으면 아래 전부가 표본을 전수라 부르는 상태가 된다. §6.1이 두 도메인을 각각
    // 둘로 닫았으므로 곱은 넷이고, 넷이 아니면 계약이 아니라 이 파일의 재료가 낡은 것이다.
    expect(SAFETY_COMBINATIONS).toHaveLength(4);
    expect(new Set(SAFETY_COMBINATIONS.map(label)).size, "조합에 중복이 있다").toBe(4);
  });

  test("판정이 채우는 두 자리가 앵커 목록 안이다", () => {
    // 판정과 자리를 잇는 것이 이 이름 둘이다. 목록 밖으로 나가면 배선이 그릴 자리가 없고
    // 그 실패는 조용하다(`ARCHITECTURE.md` §2.6).
    const names: readonly string[] = ANCHOR_NAMES;
    expect(names).toContain(APPROVAL_SLOT);
    expect(names).toContain(SANDBOX_SLOT);
  });

  test("네 조합 전부에서 판정이 두 자리를 불리언으로 든다", () => {
    // 자리가 값과 무관하게 늘 있다는 것(결정 11 — *"앵커는 값과 무관하게 항상 있다"*)의
    // 판정 쪽 대응이다. 거짓이 뜻하는 것은 자리의 부재가 아니라 그 안이 비는 것이고,
    // *"비어 있는 자리는 이 화면의 정상 상태다."*
    for (const safety of SAFETY_COMBINATIONS) {
      const shown = safetyDisplay(safety);
      expect(shown[APPROVAL_SLOT], `${label(safety)}: 승인 모드 자리가 불리언이 아니다`).toBeTypeOf(
        "boolean",
      );
      expect(shown[SANDBOX_SLOT], `${label(safety)}: 샌드박스 자리가 불리언이 아니다`).toBeTypeOf(
        "boolean",
      );
    }
  });

  test("기본값에서 둘 다 표시하지 않는다", () => {
    // §7.1 — *"두 계약 항목이 켜져 있을 때(기본값일 때)는 표시하지 않는다."* 결정 11이 그
    // 조항을 승계하며 든 문장이 기본값의 실물을 든다:
    // *"그래서 웹 화면도 `approvalMode`가 `manual`이고 `sandbox`가 `on`일 때 그 사실을
    // 표시하지 않는다."*
    const shown = safetyDisplay({ approvalMode: "manual", sandbox: "on" });
    expect(shown[APPROVAL_SLOT], "기본값인데 승인 모드를 표시한다").toBe(false);
    expect(shown[SANDBOX_SLOT], "기본값인데 샌드박스를 표시한다").toBe(false);
  });

  test("비침묵 — 내려간 값에서 그 자리가 참이다 (승인 모드)", () => {
    // *"`off`인 쪽이 비어 있지 않은가"*. 보호가 내려갔는데 자리가 비면 그것이 §2.6의 실패다.
    for (const sandbox of SANDBOXES) {
      const shown = safetyDisplay({ approvalMode: "off", sandbox });
      expect(shown[APPROVAL_SLOT], `sandbox=${sandbox}: 승인 모드가 내려갔는데 비었다`).toBe(true);
    }
  });

  test("비침묵 — 내려간 값에서 그 자리가 참이다 (샌드박스)", () => {
    for (const approvalMode of APPROVAL_MODES) {
      const shown = safetyDisplay({ approvalMode, sandbox: "off" });
      expect(shown[SANDBOX_SLOT], `approvalMode=${approvalMode}: 셸이 호스트인데 비었다`).toBe(
        true,
      );
    }
  });

  test("구별 — 승인 모드가 갈리면 그 자리의 판정도 갈린다", () => {
    // *"승인 모드가 `off`인 세션과 `manual`인 세션의 상태줄 출력이 서로 갈리는가"* —
    // 다른 쪽 값을 고정한 채 물어야 구별이 그 항목의 것이다.
    for (const sandbox of SANDBOXES) {
      const lowered = safetyDisplay({ approvalMode: "off", sandbox })[APPROVAL_SLOT];
      const kept = safetyDisplay({ approvalMode: "manual", sandbox })[APPROVAL_SLOT];
      expect(lowered, `sandbox=${sandbox}: 승인 모드의 두 값이 안 갈린다`).not.toBe(kept);
    }
  });

  test("구별 — 샌드박스가 갈리면 그 자리의 판정도 갈린다", () => {
    for (const approvalMode of APPROVAL_MODES) {
      const lowered = safetyDisplay({ approvalMode, sandbox: "off" })[SANDBOX_SLOT];
      const kept = safetyDisplay({ approvalMode, sandbox: "on" })[SANDBOX_SLOT];
      expect(lowered, `approvalMode=${approvalMode}: 샌드박스의 두 값이 안 갈린다`).not.toBe(kept);
    }
  });

  test("독립성 — 한쪽만 내려가면 다른 쪽은 함께 켜지지 않는다", () => {
    // §7.1의 내용 표가 둘을 각자의 행으로 들고 출처도 갈린다(설정 동결 · 5b 판정 동결).
    // 한 판정이 둘을 함께 켜면 화면이 사용자가 내리지 않은 결정을 지어내는 것이 된다.
    const approvalOnly = safetyDisplay({ approvalMode: "off", sandbox: "on" });
    expect(approvalOnly[APPROVAL_SLOT], "내려간 쪽이 안 켜졌다").toBe(true);
    expect(approvalOnly[SANDBOX_SLOT], "샌드박스가 `on`인데 함께 켜졌다").toBe(false);

    const sandboxOnly = safetyDisplay({ approvalMode: "manual", sandbox: "off" });
    expect(sandboxOnly[SANDBOX_SLOT], "내려간 쪽이 안 켜졌다").toBe(true);
    expect(sandboxOnly[APPROVAL_SLOT], "승인 모드가 `manual`인데 함께 켜졌다").toBe(false);
  });

  test("판정이 입력 밖의 것을 안 본다 — 같은 입력이 같은 답을 낸다", () => {
    // 순수 함수인 것이 결정 11이 모집단을 배선으로 옮길 수 있었던 조건이다. 판정이 전역이나
    // 호출 순서를 보면 이 축이 재는 그린이 화면에 대해 아무것도 뜻하지 않게 된다.
    for (const safety of SAFETY_COMBINATIONS) {
      const first = safetyDisplay(safety);
      const second = safetyDisplay({ ...safety });
      expect(second, `${label(safety)}: 같은 입력에 답이 갈렸다`).toEqual(first);
    }
  });
});
