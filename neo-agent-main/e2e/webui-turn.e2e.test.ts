/**
 * **C2 시나리오** — 정본은 루트 `MILESTONE.md`의 C2이고, 도구·자리의 정본은
 * `docs/TECH-STACK.md` §7.1이다.
 *
 * 네 단계를 **각각 별도 단정**으로 잰다: 브라우저 로드 → 프롬프트 제출 → SSE 응답 렌더링 →
 * 승인 왕복 1회. 한 단정이 넷을 뭉쳐 재면 어느 자리가 깨졌는지가 실패 메시지에서 안 갈리고,
 * 그 순간 이 축은 「돌긴 도는가」밖에 못 말한다.
 *
 * ## 여기가 이 레포에서 처음 재는 것
 *
 * `packages/serve/client/`의 그리기·배선 층은 **오늘까지 아무도 실행으로 안 쟀다.**
 * `render.js`가 그 사실을 스스로 적었고(*"아무도 이 층을 이번 사이클에 실행으로 재지 않는다"*),
 * `stream.js`는 전송 신호를 옮기는 층에 대해 *"실제 브라우저를 붙이는 사이클이 그 자리의 첫
 * 검증이다."*라 적었으며, `anchors.js`는 전수 대조가 재는 것이 *"이름의 존재"*뿐이고 «그 자리가
 * 옳은가»는 C2가 진다고 적었다. **이 파일이 그 셋의 수신처다.**
 *
 * ## 앵커 이름을 손으로 발명하지 않는다
 *
 * 정본은 `packages/serve/client/anchors.js`이고 여기서 **값과 타입을 함께** 들여온다.
 * 아래 `anchor()`의 인자 타입이 그 파일의 닫힌 유니온이라 목록 밖 이름은 **컴파일에서** 붉고,
 * 런타임 대조는 유니온과 표가 함께 어긋나는 갈래를 덮는다. 루트에 `@neo-agent/serve` 개발
 * 의존이 없고 그 패키지의 `exports`가 `"."` 하나뿐이라 닿는 수단은 상대 경로다 — 플랜 §8의
 * `[추정]`이 그것이고, 이 파일이 그 추정을 실측으로 닫는다(R-5).
 *
 * ## 요소 종류를 전제하지 않는다 (`K-350`)
 *
 * §9.5가 앵커의 요소 종류를 안 정했으므로 오늘의 `<textarea>`·`<button>`은 계약이 아니다.
 * 그래서 조작은 사용자 관점의 `fill`·`click`뿐이고 `.value`·`.disabled` 같은 구조 접근을
 * 새로 심지 않는다 — 심으면 이 축이 계약에 없는 것을 계약처럼 굳힌다.
 *
 * ## 시각 회귀를 안 만든다 (§7.1 결정 9)
 *
 * 스크린샷도 픽셀 비교도 없다. 재는 것은 **화면 텍스트**와 컨트롤의 실재다.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Locator, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANCHOR_NAMES } from "../packages/serve/client/anchors.js";
import { APPROVAL_ANSWERS } from "../packages/serve/client/view.js";
import { launchBrowser } from "./browser.ts";
import {
  HARNESS_APPROVAL_BODY,
  HARNESS_APPROVAL_TARGET,
  HARNESS_APPROVAL_TOOL,
  HARNESS_CLOSING_REPLY,
  HARNESS_TEXT_REPLY,
  type Harness,
  requireHandle,
  startHarness,
} from "./harness.ts";

/** @see `../packages/serve/client/anchors.js` — 이름의 정본 */
type AnchorName = (typeof ANCHOR_NAMES)[number];

/** 답 하나. 정본은 `packages/serve/src/approvals.ts`이고 화면 쪽 값은 `view.js`가 파생한다 */
type ApprovalAnswer = (typeof APPROVAL_ANSWERS)[number];

/**
 * 앵커 이름 하나를 셀렉터로 옮긴다.
 *
 * **표기가 `id="<이름>"` 하나인 것은 `anchors.js`가 계약으로 든다** — 그래서 이 함수가 짓는
 * `#<이름>`은 발명이 아니라 그 표기의 이행이다. 인자 타입이 닫힌 유니온이라 목록 밖 이름은
 * 컴파일에서 붉고, 아래 런타임 대조는 유니온과 표가 **함께** 어긋나는 갈래를 덮는다(그 둘이
 * 같은 파일에 살아 서로를 강제하지만, 값을 실제로 받아 오는 쪽이 이 축의 근거다).
 */
function anchor(name: AnchorName): string {
  if (!ANCHOR_NAMES.includes(name)) {
    throw new Error(`앵커 ${name}가 정본 목록에 없다: ${JSON.stringify(ANCHOR_NAMES)}`);
  }
  return `#${name}`;
}

const TRANSCRIPT = anchor("transcript");
const COMPOSER_INPUT = anchor("composer-input");
const COMPOSER_SUBMIT = anchor("composer-submit");
const APPROVAL = anchor("approval");
const CONNECTION_STATUS = anchor("connection-status");

/**
 * 승인 컨트롤이 자기 답을 나르는 자리. `render.js`가 이 표기로 짓고 위임 리스너가 같은
 * 표기로 읽는다 — 브라우저에서 답을 보내는 수단이 이것 하나다.
 */
const ANSWER_ATTR = "data-approval-answer";

/** 이 시나리오가 보내는 답. 타입이 서버의 집합이라 집합 밖 값은 컴파일에서 붉는다 */
const ALLOW_ONCE: ApprovalAnswer = "allow-once";

/** 1턴에 넣을 프롬프트. **화면에서 되찾을 문면이므로 다른 것과 안 겹치게 둔다** */
const PROMPT_TEXT_TURN = "e2e C2 1턴 — 텍스트 한 턴을 받는다";

/** 2턴에 넣을 프롬프트. 승인을 트립시키는 도구 호출이 여기서 난다 */
const PROMPT_APPROVAL_TURN = "e2e C2 2턴 — 승인 왕복을 돈다";

/**
 * 화면 쪽 대기의 상한. **vitest의 `testTimeout`(60초)보다 짧게 둔다** — 짧아야 실패가
 * 「어느 자리를 기다리다 죽었는가」를 든 Playwright 문면으로 나오고, 길면 러너의 밋밋한
 * 타임아웃이 그 진단을 덮는다.
 */
const WAIT_MS = 20_000;

// **핸들의 선언 타입이 `| undefined`인 것이 계약이다.** `beforeAll`이 도중에 던지면
// vitest는 축을 건너뛰면서도 `afterAll`은 돌린다 — 그때 무가드로 역참조하면 정리가
// TypeError로 접히고, 실패 목록의 첫 줄이 셋업의 진짜 원인 대신 그 TypeError가 된다.
// 그래서 정리는 `?.`로 지나가고, 읽는 자리는 아래 두 관문이 좁힌다.
let harnessHandle: Harness | undefined;
let browserHandle: Browser | undefined;
let page: Page;

const harness = (): Harness => requireHandle(harnessHandle, "하네스");
const browser = (): Browser => requireHandle(browserHandle, "브라우저");

/**
 * 브라우저 콘솔의 `error`. **화면이 조용히 깨지는 자리가 여기로 나온다** — 배선이 던지거나
 * 자산이 404이거나 CSP가 막으면 화면에는 «그냥 안 뜬다»로만 보이고 서버는 그것을 원리적으로
 * 못 잰다(`docs/ARCHITECTURE.md` §2.6).
 */
const consoleErrors: string[] = [];

/** 잡히지 않은 예외. 위와 같은 갈래이나 출처가 페이지 자신이다 */
const pageErrors: string[] = [];

/**
 * 자리 하나가 문면을 담을 때까지 기다리고, 그 자리의 화면 텍스트를 돌려준다.
 *
 * 기다림의 수단이 `filter({ hasText })`인 것은 그것이 **렌더된 텍스트**를 보기 때문이다 —
 * DOM 구조나 요소 종류를 안 묻는다(`K-350`).
 */
async function textAfter(root: Locator, needle: string): Promise<string> {
  await root.filter({ hasText: needle }).waitFor({ state: "attached", timeout: WAIT_MS });
  return (await root.textContent()) ?? "";
}

/** 실패 메시지에 붙일 진단. 서버 쪽 고지가 사라지지 않게 한다 */
function diagnostics(): string {
  return [
    `서버 로그: ${harness().log()}`,
    `콘솔 에러: ${JSON.stringify(consoleErrors)}`,
    `페이지 에러: ${JSON.stringify(pageErrors)}`,
  ].join("\n");
}

describe("MILESTONE C2 — 웹 UI 한 턴", () => {
  beforeAll(async () => {
    harnessHandle = await startHarness();
    browserHandle = await launchBrowser();
    page = await browser().newPage();
    page.setDefaultTimeout(WAIT_MS);

    // **수집을 페이지보다 먼저 단다.** 뒤에 달면 첫 그리기까지의 고지가 조용히 사라지고,
    // 그 창이 정확히 배선이 부팅하는 창이다.
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.stack ?? error.message);
    });
  });

  afterAll(async () => {
    await browserHandle?.close();
    await harnessHandle?.stop();
  });

  it("C2-1 브라우저 로드 — 하네스 주소를 열고 화면이 뜬다", async () => {
    const response = await page.goto(harness().url, { waitUntil: "domcontentloaded" });

    expect(response, "탐색이 응답을 못 받았다").not.toBeNull();
    expect(response?.status(), diagnostics()).toBe(200);

    // 앵커가 실제로 화면에 있다. `anchors.js`의 전수 대조는 **원문의 부분 문자열**을 보므로
    // 주석 안의 표기도 존재로 읽는다 — 여기서 재는 것은 브라우저가 파싱한 DOM의 실재다.
    for (const selector of [TRANSCRIPT, COMPOSER_INPUT, COMPOSER_SUBMIT, APPROVAL]) {
      expect(await page.locator(selector).count(), `앵커 ${selector}`).toBe(1);
    }

    // **스트림이 실제로 열렸다.** 이 문면이 서려면 `/client/main.js`가 로드돼 앵커를 열고,
    // `stream.js`가 `EventSource`를 세우고, 그 개시 신호가 상태를 지나 그리기에 닿아야 한다 —
    // 즉 이 한 줄이 배선 전체가 부팅했다는 관측 가능한 형태다.
    const status = await textAfter(page.locator(CONNECTION_STATUS), "연결됨");
    expect(status, diagnostics()).toContain("연결됨");
  });

  it("C2-2 프롬프트 제출 — 입력 앵커에 넣고 제출 앵커를 누른다", async () => {
    // 사용자 관점 조작뿐이다. 요소 종류를 안 묻는다(`K-350`).
    await page.locator(COMPOSER_INPUT).fill(PROMPT_TEXT_TURN);
    await page.locator(COMPOSER_SUBMIT).click();

    // **제출이 서버까지 갔다는 것의 형태**는 내가 친 문면이 트랜스크립트로 돌아오는 것이다.
    // 화면이 낙관적으로 그리지 않으므로(§9.6 결정 5) 이 문면의 출처는 서버의 스트림뿐이다.
    const transcript = await textAfter(page.locator(TRANSCRIPT), PROMPT_TEXT_TURN);
    expect(transcript, diagnostics()).toContain(PROMPT_TEXT_TURN);
  });

  it("C2-3 SSE 응답 렌더링 — 모의 모델의 텍스트가 화면 텍스트로 선다", async () => {
    const transcript = await textAfter(page.locator(TRANSCRIPT), HARNESS_TEXT_REPLY);

    // **모의 모델이 낸 문면 그대로다.** 이 문자열은 하네스의 상수라, 바꾸면 이 단정이 붉는다 —
    // 그것이 이 축의 역검증이고 통과가 공허하지 않다는 증거다.
    expect(transcript, diagnostics()).toContain(HARNESS_TEXT_REPLY);
  });

  it("C2-4 승인 왕복 1회 — 대기가 뜨고, 답을 보내면 런이 이어져 닫힌다", async () => {
    await page.locator(COMPOSER_INPUT).fill(PROMPT_APPROVAL_TURN);
    await page.locator(COMPOSER_SUBMIT).click();

    // ① 도구 호출이 승인 대기를 띄운다. 문면의 머리가 도구 이름이므로 그것으로 «이 승인이
    //    그 호출의 것»임이 갈린다.
    const pending = await textAfter(page.locator(APPROVAL), HARNESS_APPROVAL_TOOL);
    expect(pending, diagnostics()).toContain(HARNESS_APPROVAL_TOOL);

    // ② 답 셋이 전부 컨트롤로 서 있다(§9.6 결정 7 — 부분집합 금지). 하나라도 빠지면 화면이
    //    사용자에게서 답을 조용히 지운 것이다.
    for (const answer of APPROVAL_ANSWERS) {
      expect(
        await page.locator(`${APPROVAL} [${ANSWER_ATTR}="${answer}"]`).count(),
        `답 ${answer}의 컨트롤`,
      ).toBeGreaterThan(0);
    }

    // ③ 답을 보낸다. **이것이 왕복의 유일한 수단이다** — 서버에 직접 POST하면 재는 것이
    //    브라우저가 아니다.
    await page.locator(`${APPROVAL} [${ANSWER_ATTR}="${ALLOW_ONCE}"]`).first().click();

    // ④ 런이 이어졌다. 도구가 실제로 돌았고(파일) 모델이 한 번 더 불려 런이 닫혔다(문면).
    const transcript = await textAfter(page.locator(TRANSCRIPT), HARNESS_CLOSING_REPLY);
    expect(transcript, diagnostics()).toContain(HARNESS_CLOSING_REPLY);

    const written = join(harness().workspace, HARNESS_APPROVAL_TARGET);
    expect(existsSync(written), `승인된 쓰기의 산물이 없다 — ${written}\n${diagnostics()}`).toBe(
      true,
    );
    expect(readFileSync(written, "utf8")).toBe(HARNESS_APPROVAL_BODY);

    // ⑤ 대기가 접혔다. 답이 갔는데 자리가 남으면 사용자는 같은 승인을 두 번 본다.
    await page
      .locator(`${APPROVAL} [${ANSWER_ATTR}]`)
      .first()
      .waitFor({ state: "detached", timeout: WAIT_MS });
    expect(await page.locator(`${APPROVAL} [${ANSWER_ATTR}]`).count()).toBe(0);
  });

  it("C2-5 브라우저 콘솔 에러와 pageerror가 0건이다", () => {
    // **위 넷이 전부 초록이어도 이 축이 붉을 수 있다** — 화면이 조용히 깨지는 갈래(자산 404 ·
    // CSP 차단 · 배선의 잡히지 않은 예외)는 시나리오를 통과시키면서 자국만 남기기 때문이다.
    expect(consoleErrors, `서버 로그: ${harness().log()}`).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
