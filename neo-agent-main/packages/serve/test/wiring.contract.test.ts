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
 * **결정 11의 표시 판정은 오늘 이 파일에 없다.** 같은 모듈의 나머지 절반이고 그 축의 자리도
 * 여기이나, 이 파일이 오늘 드는 것은 결정 13 하나다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { describe, expect, test } from "vitest";
import { ANCHOR_NAMES } from "../client/anchors.js";
import type { AnchorSource } from "../client/wiring.js";
import { anchorElement } from "../client/wiring.js";

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
    const { source } = emptyScreen();
    let returned: unknown = "던지지 않았다";
    try {
      returned = anchorElement(source, CONTROL_NAME);
    } catch {
      returned = "던졌다";
    }
    expect(returned).toBe("던졌다");
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

  test("컴파일 축이 실제로 존재한다 — 실행하지 않고 존재만 단언한다", () => {
    expect(offListNamesDoNotCompile).toBeTypeOf("function");
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
