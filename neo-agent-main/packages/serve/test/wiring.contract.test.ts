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
 * ## 테마 층 — 이 파일의 셋째 몫 (2026-08-29)
 *
 * 같은 모듈의 순수 함수 하나(`themeDecision`)를 말미의 두 describe가 잰다. 정본은
 * `WEB-UI.md` **§12의 테마 층 항**이고, 그 항이 2026-08-27에 갈래 셋 중 첫째를 확정했다 —
 * 배선이 OS 선호(`prefers-color-scheme`)를 읽어 속성을 건다. 2026-08-29에 그 층의 소관이
 * 하나 늘어 브라우저 힌트(`:root`의 `color-scheme`)도 여기가 짓고, 근거는 §9.5 결정 10이
 * 그 선언과 `[data-theme]`를 *"같은 판정의 두 철자"*로 판정한 것이다.
 *
 * **그래서 이 축들이 재는 것 하나가 정합이다** — 같은 입력에서 두 철자가 같은 값인가. 정본이
 * 두 자리를 한 층에 모은 이유가 «갈리는 날 어느 쪽이 옳은지 가릴 근거가 없다»이므로, 정본이
 * 하나가 된 뒤에도 철자가 둘인 동안은 그 갈림이 여전히 표현 가능하다.
 *
 * **부트를 여기서 실행하지 않는다.** `client/main.js`는 DOM 전역에 닿으므로 node 런에서 못
 * 열고(형제 `client-wiring-landing.contract.test.ts`가 같은 이유로 그것을 뺐다), 그래서 「부트가
 * 이 판정을 실제로 부르는가」는 **소스 텍스트로** 잰다. 그 축이 재는 것은 임포트와 호출의
 * 실재이지 실행이 아니고, 실행 쪽은 루트 `MILESTONE.md`의 C2(브라우저 검증)가 진다.
 *
 * **[정정 — 2026-08-29] 그 받는 쪽이 이 절을 쓴 시점에 비어 있었다.** `e2e/` 전체에
 * `data-theme`·`color-scheme` 표기가 0건이라, 부트가 판정을 버리고 리터럴을 걸거나 아예 안
 * 걸어도 이 파일과 e2e가 전부 그린이었다
 * (`plans/20260829-client-wiring-theme-verify-report.md` F-2가 그것을 변이 둘로 쟀다).
 * **그 자리를 `e2e/theme.e2e.test.ts`가 받는다** — 선은 옳게 그었고 받는 쪽이 그날 섰다.
 *
 * **팔레트 이름을 손으로 적지 않는다.** 라이트 쪽 값은 자산의 토큰(`assets/tokens.css`)이
 * 실제로 갈리는 속성값에서 파생한다 — 손으로 옮겨 적으면 §9.4 결정 5가
 * *"관측형은 실물이 움직일 때마다 조용히 낡고"*로 이름 붙인 사본이 되고, 재생성이 그 속성값을
 * 바꾸는 날 배선과 화면이 갈린 채로 이 축이 그린이 된다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ANCHOR_NAMES } from "../client/anchors.js";
import type { AnchorSource, MediaPreferenceSource } from "../client/wiring.js";
import {
  anchorElement,
  safetyDisplay,
  THEME_PREFERENCE_QUERY,
  themeDecision,
} from "../client/wiring.js";
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

// ---------------------------------------------------------------------------
// 테마 판정의 입력 — 불리언이라 둘이 전수다
// ---------------------------------------------------------------------------

/** 미디어 질의의 가짜 원천. 무엇을 물었는지까지 관측한다 — 위 `probe`와 같은 배치다 */
type MediaProbe = {
  readonly source: MediaPreferenceSource;
  readonly asked: readonly string[];
};

const mediaProbe = (answer: boolean): MediaProbe => {
  const asked: string[] = [];
  return {
    asked,
    source: {
      matches(query: string): boolean {
        asked.push(query);
        return answer;
      },
    },
  };
};

/**
 * 원천이 낼 수 있는 답 전부. **불리언이므로 이 둘이 전수이고 손으로 센 결과가 아니다** —
 * 위 안전 사실의 곱이 넷인 것과 같은 성질이다.
 */
const PREFERENCES = [true, false] as const;

const preferenceLabel = (prefersLight: boolean): string =>
  prefersLight ? "OS가 라이트를 선호" : "OS가 라이트를 선호하지 않음";

// ---------------------------------------------------------------------------
// 소스 텍스트 — 부트는 DOM 전역에 닿으므로 실행하지 않고 읽는다
// ---------------------------------------------------------------------------

const SERVE = new URL("../", import.meta.url);
const readServe = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, SERVE)), "utf8");

/**
 * 주석만 걷어낸 코드. **문자열은 남긴다** — 부트가 무엇을 쓰는가는 문자열 리터럴로 살고,
 * 그것을 함께 지우면 아래 두 철자 축이 공허해진다. 형제 독립 QA가 같은 술어를 쓴다.
 */
const codeOf = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CLIENT_MAIN = readServe("client/main.js");
const TOKENS = readServe("assets/tokens.css");

/**
 * 토큰이 팔레트를 가르는 **속성 선택자**에서 파생한다. 손으로 옮겨 적지 않는 근거는 파일
 * 머리가 든다 — 재생성이 그 속성을 바꾸면 배선과 화면이 갈리고, 사본은 그때 조용하다.
 *
 * **fail-closed다.** 파생이 비거나 속성 이름이 여럿이면 아래 첫 축이 붉는다 — 조용히 0건을
 * 세는 갈래를 안 둔다(형제 `client-wiring-landing.contract.test.ts`의 파싱이 쓴 규율).
 */
const THEME_SELECTORS = [...TOKENS.matchAll(/\[(data-[a-z-]+)="([^"]+)"\]/g)];
const THEME_ATTRIBUTES = new Set(THEME_SELECTORS.map((match) => match[1] ?? ""));
const SWITCHED_PALETTES = new Set(THEME_SELECTORS.map((match) => match[2] ?? ""));

/**
 * 브라우저 힌트의 이름. **§12의 테마 층 항이 이름으로 든 것**이고 값이 아니다 — 재생성이
 * 그 선언을 걷었으므로 토큰에서 파생할 원천이 없다(§9.5 결정 10이 그것을 사본 하나의 소멸로
 * 판정했다). 이름을 계약으로 드는 것은 CSS 속성 이름이 그 성질의 유일한 철자이기 때문이다.
 */
const COLOR_SCHEME_PROPERTY = "color-scheme";

describe("테마 판정 (WEB-UI §12 테마 층 항 · §9.5 결정 10)", () => {
  test("원천이 받은 질의가 OS의 팔레트 선호를 묻는다 — 그 하나뿐이다", () => {
    // 질의가 판정과 같은 모듈에 사는 것이 이 축이 성립하는 조건이다. 부트가 스스로 지으면
    // 오타가 조용하고(`matchMedia`는 못 알아듣는 질의에 안 던진다) 관측되는 것은 테마가 안
    // 걸린 것이 아니라 언제나 다크다 — `ARCHITECTURE.md` §2.6의 형태다.
    expect(THEME_PREFERENCE_QUERY, "질의가 OS 선호를 안 묻는다").toContain("prefers-color-scheme");
    for (const prefersLight of PREFERENCES) {
      const { source, asked } = mediaProbe(prefersLight);
      themeDecision(source);
      expect(asked, `${preferenceLabel(prefersLight)}: 원천이 받은 질의가 다르다`).toEqual([
        THEME_PREFERENCE_QUERY,
      ]);
    }
  });

  test("두 철자가 갈릴 수 없다 — 같은 입력에서 두 값이 같다", () => {
    // §9.5 결정 10 — 그 선언과 `[data-theme]`는 *"같은 판정의 두 철자"*다. 정본이 하나가 된
    // 뒤에도 철자는 둘이므로 갈림이 여전히 표현 가능하고, 이 축이 그 자리를 막는다.
    for (const prefersLight of PREFERENCES) {
      const decision = themeDecision(mediaProbe(prefersLight).source);
      expect(decision.colorScheme, `${preferenceLabel(prefersLight)}: 두 철자가 갈렸다`).toBe(
        decision.dataTheme,
      );
    }
  });

  test("OS 선호를 실제로 읽는다 — 두 입력의 판정이 갈린다", () => {
    // 없으면 상수를 돌려주는 구현도 위 정합 축을 통과한다. 갈리는 것이 §12가 확정한 갈래
    // 첫째(*"배선이 OS 선호(`prefers-color-scheme`)를 읽어 속성을 건다"*)의 실물이다.
    const light = themeDecision(mediaProbe(true).source);
    const other = themeDecision(mediaProbe(false).source);
    expect(light.dataTheme, "선호가 갈려도 같은 팔레트를 낸다").not.toBe(other.dataTheme);
    expect(light.colorScheme, "선호가 갈려도 같은 힌트를 낸다").not.toBe(other.colorScheme);
  });

  test("질의가 묻는 팔레트를 참으로 답한 쪽이 그대로 낸다 — 방향이 계약이다", () => {
    // **위 축들은 방향을 안 잰다.** 질의의 실재는 부분 문자열 대조라 `light`·`dark` 어느
    // 쪽이든 참이고, 갈림 축은 두 입력의 답이 다르다는 것만 본다 — 질의를 뒤집으면 그
    // 셋이 전부 그린인 채로 다크를 선호하는 OS에 라이트 팔레트가 걸린다
    // (`ARCHITECTURE.md` §2.6의 형태다 — 화면은 멀쩡히 뜨고 팔레트만 반대다).
    //
    // **기대 팔레트를 손으로 안 적는다.** 재는 것은 값이 아니라 **관계**다 — 원천이 받은
    // 질의가 묻는 낱말과, 그 질의에 참으로 답했을 때의 판정이 같은가. §12가 확정한
    // 갈래 첫째의 *"읽어"*가 뜻하는 것이 이 관계이고, 질의를 바꾸면 판정도 함께 따라와야
    // 이 축이 선다.
    const { source, asked } = mediaProbe(true);
    const decision = themeDecision(source);
    const [query] = asked;
    // 파생이 실패하면 조용히 넘기지 않는다 — 뽑을 낱말이 없다는 것은 질의가 이 성질을
    // 안 묻는다는 뜻이고, 그때 이 축이 그린이면 그것이 곧 침묵이다.
    const asking = /prefers-color-scheme\s*:\s*([a-z-]+)/.exec(query ?? "")?.[1];
    expect(asking, `질의에서 팔레트 낱말을 못 뽑았다 — ${String(query)}`).toBeTruthy();
    expect(decision.dataTheme, "질의가 묻는 팔레트와 참으로 답한 쪽의 판정이 갈렸다").toBe(asking);
  });

  test("파생이 실물을 얻는다 — 토큰이 팔레트를 가르는 속성이 정확히 하나다", () => {
    expect(THEME_SELECTORS.length, "토큰에서 팔레트 선택자를 못 찾았다").toBeGreaterThan(0);
    expect([...THEME_ATTRIBUTES], "팔레트를 가르는 속성이 하나가 아니다").toHaveLength(1);
    expect(SWITCHED_PALETTES.size, "토큰이 가르는 팔레트 값이 없다").toBeGreaterThan(0);
  });

  test("선호가 라이트면 토큰이 실제로 갈리는 팔레트 값을 낸다", () => {
    // 배선이 내는 값과 화면이 갈리는 값이 어긋나면 속성은 걸리고 팔레트는 안 갈린다 —
    // 침묵이다. 기대값을 손으로 적지 않고 자산에서 파생하는 근거가 그것이다.
    const decision = themeDecision(mediaProbe(true).source);
    expect([...SWITCHED_PALETTES], "라이트 판정이 토큰이 아는 팔레트 값이 아니다").toContain(
      decision.dataTheme,
    );
  });

  test("두 입력 전부에서 값이 비어 있지 않다", () => {
    // 빈 문자열을 걸면 속성은 서고 팔레트는 안 갈리며 브라우저 힌트도 죽는다. 비침묵이
    // 이 층에서 갖는 형태다.
    for (const prefersLight of PREFERENCES) {
      const decision = themeDecision(mediaProbe(prefersLight).source);
      expect(
        decision.dataTheme.length,
        `${preferenceLabel(prefersLight)}: 속성값이 비었다`,
      ).toBeGreaterThan(0);
      expect(
        decision.colorScheme.length,
        `${preferenceLabel(prefersLight)}: 힌트가 비었다`,
      ).toBeGreaterThan(0);
    }
  });

  test("판정이 입력 밖의 것을 안 본다 — 같은 입력이 같은 답을 낸다", () => {
    // 위 `safetyDisplay`의 같은 축과 같은 근거다. 판정이 전역이나 호출 순서를 보면 이 축의
    // 그린이 화면에 대해 아무것도 뜻하지 않게 된다.
    for (const prefersLight of PREFERENCES) {
      const first = themeDecision(mediaProbe(prefersLight).source);
      const second = themeDecision(mediaProbe(prefersLight).source);
      expect(second, `${preferenceLabel(prefersLight)}: 같은 입력에 답이 갈렸다`).toEqual(first);
    }
  });

  test("브라우저 없이 판정이 돈다 — node 런에 미디어 질의 전역이 없다", () => {
    // 원천을 인자로 받으므로 이 모듈이 전역을 볼 필요가 없다(§9.3의 경계). 전역을 읽으면
    // 이 파일이 임포트만으로 깨지거나, 깨지지 않는 대신 재는 것이 전역이 된다.
    expect(Object.hasOwn(globalThis, "matchMedia"), "node 런에 미디어 질의 전역이 있다").toBe(
      false,
    );
    const decision = themeDecision(mediaProbe(true).source);
    expect(decision.dataTheme).toBe(decision.colorScheme);
  });
});

describe("테마 층의 부트 (WEB-UI §12 테마 층 항 · §9.6 결정 10)", () => {
  test("역검증 — 술어가 주석을 걷고 문자열은 남긴다", () => {
    // 이것이 없으면 아래 축들이 «주석에 적혀 있어서 그린»과 구별되지 않고, 반대로 문자열을
    // 함께 지우는 술어를 쓰면 두 철자 축이 공허해진다.
    const stripped = codeOf('/* themeDecision( */\n// themeDecision(\nconst q = "data-theme";');
    expect(stripped, "주석 안의 호출이 남았다").not.toContain("themeDecision(");
    expect(stripped, "문자열 리터럴이 함께 지워졌다").toContain('"data-theme"');
  });

  test("부트가 판정을 임포트한다", () => {
    // §12의 테마 층 항이 이 층을 배선에 주었고, 부트가 안 부르면 그 판정은 아무 데도 안
    // 닿는다 — 순수 함수 하나가 초록인 채로 화면은 늘 기본 팔레트다.
    const imports = [
      ...codeOf(CLIENT_MAIN).matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g),
    ];
    const fromWiring = imports.filter((match) => (match[2] ?? "").endsWith("/wiring.js"));
    expect(fromWiring.length, "부트가 배선의 순수 층을 안 연다").toBeGreaterThan(0);
    expect(
      fromWiring.map((match) => match[1] ?? "").join(","),
      "부트가 테마 판정을 안 들여온다",
    ).toContain("themeDecision");
  });

  test("부트가 판정을 정확히 1회 부른다", () => {
    // 여러 번 부르면 그때마다 원천을 다시 묻고, 답이 갈리는 순간 루트에 건 두 철자가 서로
    // 다른 판정에서 온 값이 된다 — 위 정합 축이 막는 것이 부트에서 되살아난다.
    const calls = [...codeOf(CLIENT_MAIN).matchAll(/\bthemeDecision\s*\(/g)];
    expect(calls.length, "부트의 테마 판정 호출 수가 1이 아니다").toBe(1);
  });

  test("부트의 원문에 두 철자가 있다", () => {
    // 판정이 두 값을 함께 내도 부트가 한쪽만 쓰면 화면에서 둘이 갈린다. §12가 2026-08-29에
    // 이 층의 소관을 하나 늘린 자리가 그것이다.
    //
    // **[정정 — 2026-08-29] 이 축은 「부트가 두 철자를 실물로 쓴다」라는 이름으로 서 있었고
    // 그 이름이 재는 것보다 넓었다.** `codeOf`가 문자열 리터럴을 남기므로 이 대조는 두
    // 철자가 **쓰이지 않는 배열 안에 있어도** 참이다 — 검증이 변이 둘로 그것을 실물로 쟀다
    // (`plans/20260829-client-wiring-theme-verify-report.md` F-3 · M5·M6). 같은 파일
    // `SafetyAnchorName` 주석이 2026-08-27에 자기 손으로 고친 형태이고, §2.3이
    // *"검사가 실제보다 넓게 주장하는 것이 진짜 결함이었던 자리"*로 이름 붙인 그것이다.
    //
    // **쓰기가 실제로 닿는가는 `e2e/theme.e2e.test.ts`가 잰다** — 브라우저가 파싱한
    // `documentElement`의 상태를 보므로 원문의 리터럴로는 통과할 수 없다. 이 축이 남는
    // 근거는 그 층이 상시 게이트 밖(`K-365`)이라, 철자가 원문에서 사라지는 갈래를 게이트
    // 안에서 붉히는 자리가 따로 필요하다는 것이다.
    const code = codeOf(CLIENT_MAIN);
    const [attribute] = [...THEME_ATTRIBUTES];
    expect(attribute, "파생이 비었다").toBeTruthy();
    expect(code, `부트가 팔레트 속성을 안 쓴다 — ${attribute}`).toContain(`"${attribute}"`);
    expect(code, "부트가 브라우저 힌트를 안 쓴다").toContain(`"${COLOR_SCHEME_PROPERTY}"`);
  });

  test("부트가 미디어 질의를 스스로 안 적는다 — 질의의 정본이 배선 하나다", () => {
    // 부트가 질의를 다시 적으면 그것이 사본이고, 두 문자열이 갈리는 날 관측되는 것은 위
    // 침묵 실패다. 질의를 통째로 넘기는 것이 그 사본을 원리적으로 없앤다.
    expect(codeOf(CLIENT_MAIN), "부트가 미디어 질의를 다시 적었다").not.toContain(
      "prefers-color-scheme",
    );
  });
});
