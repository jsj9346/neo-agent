/**
 * **테마 층이 화면에 닿는가** — 정본은 `docs/WEB-UI.md` §12의 테마 층 항이고, 그 항이
 * 2026-08-27에 갈래 셋 중 첫째를 확정했다: 배선이 OS 선호(`prefers-color-scheme`)를 읽어
 * 속성을 건다. 2026-08-29에 같은 항이 브라우저 힌트(`:root`의 `color-scheme`)도 이 층에
 * 주었고, 근거는 §9.5 결정 10이 그 선언과 `[data-theme]`를 *"같은 판정의 두 철자"*로
 * 판정한 것이다.
 *
 * ## 이 파일이 받는 것은 계약 축이 명시로 밀어낸 층이다
 *
 * `packages/serve/test/wiring.contract.test.ts`가 스스로 선을 그었다 — *"그 축이 재는 것은
 * 임포트와 호출의 실재이지 실행이 아니고, 실행 쪽은 루트 `MILESTONE.md`의 C2(브라우저
 * 검증)가 진다"*. **그 받는 쪽이 2026-08-29까지 비어 있었다**
 * (`plans/20260829-client-wiring-theme-verify-report.md` F-2). 그 리포트가 변이 둘로 그 공백을
 * 실물로 쟀다: 부트가 판정을 부르고 **그 값을 버린 채 리터럴을 걸어도**, **아예 안 걸어도**
 * 계약 축 열셋과 e2e 스물하나가 전부 통과했다. 선은 옳게 그었고 받는 쪽이 없었다.
 *
 * 그래서 여기서 재는 것은 **텍스트가 아니라 브라우저가 파싱한 문서의 상태**다. `codeOf`가
 * 소스에서 찾는 문자열 리터럴은 쓰이지 않는 배열 안에 있어도 참이지만, `documentElement`의
 * 속성은 부트가 실제로 걸었을 때만 선다.
 *
 * ## 팔레트 값을 손으로 적지 않는다
 *
 * 기대값은 **자산의 토큰**(`/tokens.css`)이 실제로 갈리는 속성 선택자에서 파생한다. 손으로
 * 옮겨 적으면 §9.4 결정 5가 *"관측형은 실물이 움직일 때마다 조용히 낡고"*로 이름 붙인
 * 사본이 되고, 재생성이 그 속성값을 바꾸는 날 배선과 화면이 갈린 채로 이 축이 그린이 된다.
 *
 * **자산의 주소도 손으로 안 적는다.** §9.5 결정 2가 그 주소의 정본을 못박았다 —
 * *"②는 **매니페스트 자신**(§9.2 — 키의 정본이 곧 서빙 표다. 별도 상수를 세우면 사본이 하나
 * 는다)"*. 형제 `packages/serve/test/assets.contract.test.ts`가 쓰는 관행 그대로다.
 *
 * ## 이 파일이 재지 않는 것 — 질의의 **방향**
 *
 * 「질의가 라이트를 묻는가 다크를 묻는가」는 순수 판정이라 계약 축이 진다(같은 리포트 F-1).
 * 여기서 아래 첫 축이 그 뒤집힘도 함께 붉히기는 하지만, 그것은 오늘 토큰이 `data-theme`으로
 * 켜는 팔레트가 라이트 하나라는 **관측**에 기댄 부수 효과다. 재생성이 다크 블록을 하나
 * 더 내면 그 부수 효과가 사라지고, 그때도 방향은 계약 축이 그대로 잰다 — 층을 그렇게 가른
 * 근거가 이것이다.
 *
 * ## 선호를 페이지보다 **먼저** 세운다
 *
 * 판정은 부트에서 한 번만 돌고 `matchMedia`의 `change` 구독이 없다(같은 리포트 F-10 —
 * 미규정이지 결함이 아니다). 그래서 선호는 컨텍스트를 만들 때 세우고, 연 뒤에 바꾸지
 * 않는다 — 뒤에 바꾸면 이 축이 재는 것이 계약에 없는 성질(런타임 추종)이 된다.
 *
 * ## 시각 회귀를 안 만든다 (§7.1 결정 9)
 *
 * 스크린샷도 픽셀 비교도 없다. 아래 마지막 축이 계산된 배경색을 보지만 재는 것은 **두 선호가
 * 서로 다른 값을 낸다**는 것뿐이고, 어느 색인가는 안 묻는다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ASSET_MANIFEST, assetRoot } from "../packages/serve/src/assets.ts";
import { launchBrowser } from "./browser.ts";
import { type Harness, requireHandle, startHarness } from "./harness.ts";

/** 토큰 자산 하나. 주소는 매니페스트가 든다(§9.5 결정 2) — 여기서 경로를 짓지 않는다. */
const TOKENS_ENTRY = ASSET_MANIFEST["/tokens.css"];

const TOKENS = readFileSync(join(assetRoot(TOKENS_ENTRY.origin), TOKENS_ENTRY.file), "utf8");

/**
 * 팔레트를 가르는 **속성 이름**. §12와 §9.5 결정 5가 이름으로 든 것이고 값이 아니다 —
 * 값 쪽만 파생한다.
 *
 * 「토큰의 `data-*` 선택자가 정확히 하나다」로 이름까지 파생하지 않는 것은 의도다. 그것은
 * 생성 자산의 **관측**이고, §9.5 결정 11이 *"관측 동결을 계약으로 쓰지 않는다"*로 그 형태를
 * 기각했다(같은 리포트 F-8).
 */
const THEME_ATTRIBUTE = "data-theme";

/**
 * 토큰이 그 속성으로 **실제로 켜는** 팔레트 값 전부.
 *
 * **fail-closed다.** 파생이 비면 아래 첫 축이 붉는다 — 조용히 0건을 세는 갈래를 안 둔다
 * (형제 `packages/serve/test/client-wiring-landing.contract.test.ts`의 파싱이 쓴 규율).
 */
const SWITCHED_PALETTES = [
  ...new Set([...TOKENS.matchAll(/\[data-theme="([^"]+)"\]/g)].map((match) => match[1] ?? "")),
];

/** 브라우저 힌트의 이름. CSS 속성 이름이 그 성질의 유일한 철자라 이름을 계약으로 든다. */
const COLOR_SCHEME_PROPERTY = "color-scheme";

/** 이 축이 세우는 OS 선호 둘. 불리언 하나의 두 값이라 손으로 센 목록이 아니다. */
const SCHEMES = ["light", "dark"] as const;

type Scheme = (typeof SCHEMES)[number];

/** 선호 하나에서 실제로 관측된 것. 전부 브라우저가 파싱한 문서에서 읽는다. */
interface ThemeObservation {
  /** 루트에 실제로 걸린 팔레트 속성값. 안 걸렸으면 `null`이다 */
  readonly dataTheme: string | null;
  /** 루트 인라인 스타일의 브라우저 힌트. 안 걸렸으면 빈 문자열이다 */
  readonly colorScheme: string;
  /** 화면이 실제로 그린 배경. 속성이 팔레트를 정말 갈랐는지가 여기서 갈린다 */
  readonly background: string;
  /** 이 선호에서 페이지가 던진 것. 실패 문면에 싣는다 */
  readonly pageErrors: readonly string[];
}

// **핸들의 선언 타입이 `| undefined`인 것이 계약이다.** `beforeAll`이 도중에 던지면
// vitest는 축을 건너뛰면서도 `afterAll`은 돌린다 — 그때 무가드로 역참조하면 정리가
// TypeError로 접히고, 실패 목록의 첫 줄이 셋업의 진짜 원인 대신 그 TypeError가 된다.
// 그래서 정리는 `?.`로 지나가고, 읽는 자리는 아래 두 관문이 좁힌다.
let harnessHandle: Harness | undefined;
let browserHandle: Browser | undefined;

const harness = (): Harness => requireHandle(harnessHandle, "하네스");
const browser = (): Browser => requireHandle(browserHandle, "브라우저");

/** 선호별 관측. `beforeAll`이 한 번 채우고 아래 축들이 나눠 읽는다 */
const observed = new Map<Scheme, ThemeObservation>();

/**
 * 선호 하나를 세운 컨텍스트로 화면을 한 번 열고, 루트의 상태를 읽어 온다.
 *
 * 컨텍스트를 선호마다 새로 여는 이유는 위 머리가 든다 — 판정이 부트에서 한 번만 돌므로
 * 선호는 **페이지가 열리기 전에** 서 있어야 한다.
 */
async function observe(scheme: Scheme): Promise<ThemeObservation> {
  const context = await browser().newContext({ colorScheme: scheme });
  const pageErrors: string[] = [];
  try {
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      pageErrors.push(error.stack ?? error.message);
    });

    const response = await page.goto(harness().url, { waitUntil: "domcontentloaded" });
    if (response === null || response.status() !== 200) {
      throw new Error(
        `선호 ${scheme}: 화면을 못 받았다 — 상태 ${String(response?.status())}\n${harness().log()}`,
      );
    }

    // **여기서 기다리지 않는다.** 화면이 여는 스크립트가 `type="module"`이라 지연 스크립트로
    // 돌고, `domcontentloaded`는 그 실행 **뒤에** 뜬다. 그래서 이 읽기는 경합이 아니다 —
    // 기다림을 걸면 「안 걸렸다」가 붉음이 아니라 타임아웃으로 나와 진단이 흐려진다.
    const seen = await page.evaluate(
      ({ attribute, property }) => {
        const root = document.documentElement;
        return {
          dataTheme: root.getAttribute(attribute),
          colorScheme: root.style.getPropertyValue(property),
          background: getComputedStyle(document.body).backgroundColor,
        };
      },
      { attribute: THEME_ATTRIBUTE, property: COLOR_SCHEME_PROPERTY },
    );

    return { ...seen, pageErrors };
  } finally {
    await context.close();
  }
}

/** 실패 메시지에 붙일 진단. 서버 쪽 고지와 페이지 예외가 사라지지 않게 한다 */
function diagnostics(): string {
  return [
    `서버 로그: ${harness().log()}`,
    ...SCHEMES.map((scheme) => `선호 ${scheme}: ${JSON.stringify(observed.get(scheme) ?? null)}`),
  ].join("\n");
}

/** 관측 하나. 훅이 채우지 못한 자리를 조용히 넘기지 않는다 */
function seen(scheme: Scheme): ThemeObservation {
  const observation = observed.get(scheme);
  if (observation === undefined) {
    throw new Error(`선호 ${scheme}의 관측이 없다.\n${diagnostics()}`);
  }
  return observation;
}

describe("MILESTONE C2 — 테마 층이 화면에 닿는다 (WEB-UI §12 테마 층 항)", () => {
  beforeAll(async () => {
    harnessHandle = await startHarness();
    browserHandle = await launchBrowser();
    for (const scheme of SCHEMES) {
      observed.set(scheme, await observe(scheme));
    }
  });

  afterAll(async () => {
    await browserHandle?.close();
    await harnessHandle?.stop();
  });

  it("파생이 실물을 얻는다 — 토큰이 이 속성으로 켜는 팔레트가 있다", () => {
    // 이것이 없으면 아래 첫 축이 빈 집합을 상대로 돌아 공허하게 붉거나 그린이 된다.
    expect(
      SWITCHED_PALETTES,
      `토큰에서 ${THEME_ATTRIBUTE} 팔레트를 못 뽑았다 — ${TOKENS_ENTRY.file}`,
    ).not.toEqual([]);
  });

  it("라이트를 선호하는 브라우저에 토큰이 가르는 팔레트가 걸린다", () => {
    // §12가 확정한 갈래 첫째의 실물이다. 부트가 판정을 버리고 리터럴을 걸거나(리포트 M5)
    // 질의의 방향이 뒤집히면(M4) 여기서 걸리는 값이 토큰이 아는 팔레트가 아니게 된다.
    expect(
      SWITCHED_PALETTES,
      `라이트 선호에 걸린 ${THEME_ATTRIBUTE}가 토큰이 아는 팔레트가 아니다\n${diagnostics()}`,
    ).toContain(seen("light").dataTheme);
  });

  it("선호가 갈리면 화면에 걸린 팔레트도 갈린다", () => {
    // 부트가 아무것도 안 걸면(M6) 둘 다 `null`이고, 리터럴을 걸면(M5) 둘이 같다. 어느
    // 쪽이든 화면은 멀쩡히 뜨고 팔레트만 고정된다 — `ARCHITECTURE.md` §2.6의 형태다.
    const light = seen("light").dataTheme;
    const dark = seen("dark").dataTheme;
    expect(light, `라이트 선호에 ${THEME_ATTRIBUTE}가 안 걸렸다\n${diagnostics()}`).toBeTruthy();
    expect(dark, `다크 선호에 ${THEME_ATTRIBUTE}가 안 걸렸다\n${diagnostics()}`).toBeTruthy();
    expect(dark, `선호가 갈려도 같은 팔레트가 걸렸다\n${diagnostics()}`).not.toBe(light);
  });

  it("두 철자가 화면에서도 함께 선다", () => {
    // §9.5 결정 10 — 그 선언과 `[data-theme]`는 *"같은 판정의 두 철자"*다. 순수 층에서
    // 둘이 같은 것은 계약 축이 재고, 여기서 재는 것은 **그 둘이 함께 루트에 닿는가**다.
    for (const scheme of SCHEMES) {
      const observation = seen(scheme);
      expect(
        observation.colorScheme,
        `선호 ${scheme}: 브라우저 힌트가 팔레트와 다르다\n${diagnostics()}`,
      ).toBe(observation.dataTheme);
    }
  });

  it("걸린 팔레트가 실제로 화면을 가른다 — 두 선호의 배경이 다르다", () => {
    // 속성만 서고 팔레트가 안 갈리는 갈래를 이 축이 막는다. 값이 아니라 **갈림**을 재므로
    // 재생성이 색을 바꿔도 안 낡는다(§7.1 결정 9 — 시각 회귀를 안 만든다).
    expect(
      seen("dark").background,
      `선호가 갈려도 화면이 같은 배경을 그렸다\n${diagnostics()}`,
    ).not.toBe(seen("light").background);
  });

  it("테마를 거는 동안 페이지가 아무것도 안 던진다", () => {
    // 부트에서 가장 먼저 도는 층이라, 여기서 던지면 그 뒤의 배선이 통째로 안 선다.
    for (const scheme of SCHEMES) {
      expect(seen(scheme).pageErrors, `선호 ${scheme}: ${harness().log()}`).toEqual([]);
    }
  });
});
