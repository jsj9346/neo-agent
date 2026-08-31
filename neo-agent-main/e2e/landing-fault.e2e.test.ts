/**
 * **착지 실패의 처분** — 정본은 `docs/WEB-UI.md` §8.1 계약 ⑥(「착지가 실패하면 배선은
 * 멈춘다」)과 §9.6 결정 13(자국이 서는 자리와 잡는 자리)이고, 이 파일이 사는 규율의
 * 정본은 `docs/TECH-STACK.md` §7.1(특히 결정 2·결정 6)이다.
 *
 * **왜 이 자리인가.** §8.1이 그 계약 밑에 *"막지 못하는 것을 적는다"*로 스스로 적는다 —
 * *"이 계약은 배선의 성질이라 ... 순수 함수 축이 못 잰다. 첫 검증은 브라우저 e2e이고,
 * 그 축이 필요로 하는 것은 **화면이 모르는 판별자를 내는 서버**다."* §9.6의 「이 절이
 * 재지 못하는 것」이 같은 낱말로 되풀이한다(*"결정 13의 자국을 유닛 축이 못 잰다"*).
 * 이 파일이 그 문장이 지목한 축이다.
 *
 * ## 기대값의 출처
 *
 * **§8.1 계약 ⑥의 문면 하나뿐이다.**
 *
 * > 화면 층이 던지면 배선은 그 자리에서 멈춘다 — 스트림을 닫고, 더 이상 어떤 신호도
 * > 접지 않으며, 멈췄다는 사실이 화면에 선다. 그 자국은 던진 층을 안 거친다.
 *
 * 그 문장이 재야 할 것 셋으로 갈린다: ① **자국이 선다** ② **멈춘다** ③ **얼어붙지
 * 않는다**(§8.1이 이 계약을 낳은 실패를 *"사용자가 보는 것은 «에이전트가 멈췄다»이고
 * 실제로는 스트림이 흐르고 있다"*로 이름 붙였다).
 *
 * **문면의 값을 단언에 박지 않는다.** 자국의 실제 문자열은 §12가 세부로 둔 자리이고,
 * 박으면 이 축이 계약이 아니라 구현의 사본을 잰다. 재는 것은 «갈렸는가 · 비지
 * 않았는가»뿐이고, 그래서 이 파일에는 정상 턴을 도는 **대조군**이 함께 선다 — 자국이
 * 정상 종료 상태와도 갈린다는 것이 「자국이 실제로 섰다」의 유일한 값-무관 증거다.
 *
 * ## 던짐을 어떻게 내는가
 *
 * §8.1이 요구한 «화면이 모르는 판별자를 내는 서버»를 하네스의 **유일한 주입 자리**
 * (`HarnessOptions.model`)로 만든다. 모델이 내는 최종 메시지의 내용 블록 하나를 코어
 * 유니온에 없는 판별자로 두면, 코어 루프가 어댑터 메시지를 그대로 펴고 서버 코덱이
 * 나가는 프레임에 스키마를 안 걸므로(*"밖에서 온 바이트만 스키마로 잰다"*) 그 값이
 * 브라우저까지 그대로 간다. 화면 층의 소진 검사가 거기서 던진다.
 *
 * **이것은 §8.1이 이 경로의 실제 발현으로 지목한 것과 같은 형태다** — *"서버가 새 코어로
 * 다시 뜬 뒤에도 열려 있던 탭."* 그 탭의 화면이 모르는 갈래를 서버가 보낸다.
 *
 * ## 이 파일이 재지 못하는 것
 *
 * - **자국이 던진 층을 안 거치는가**(계약 ⑥ 마지막 문장 · §9.6 결정 13)를 **직접** 못
 *   잰다. 밖에서 보이는 것은 결과(자국이 실제로 섰다)뿐이고, 그것이 어느 경로로 쓰였는지는
 *   DOM에 안 남는다. 아래 축들이 재는 것은 그 계약의 **필요조건**이다 — 자국이 뷰·접기를
 *   거쳤다면 같은 던짐에 다시 걸려 자국 자체가 안 섰을 것이므로, 「자국이 섰다」가 그
 *   경로를 배제하는 방향의 증거이기는 하되 증명은 아니다.
 * - **스트림을 실제로 닫았는가**를 소켓 층에서 못 잰다. 아래 L-2가 재는 것은 그 결과
 *   (뒤에 온 서버 푸시가 화면을 안 바꾼다)이지 닫힘 그 자체가 아니다.
 *
 * ## 상시 게이트 밖이다
 *
 * `pnpm check`는 이 축들을 부르지 않는다(§7.1 결정 2). 여기의 빨간불은 사람이
 * `pnpm test:e2e`를 부를 때만 보인다. **브라우저 부재는 건너뛰기가 아니라 하드 실패다**
 * (결정 6) — 이 파일에 `it.skip`도 조건부 건너뛰기도 없다.
 */

import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ANCHOR_NAMES } from "../packages/serve/client/anchors.js";
import { launchBrowser } from "./browser.ts";
import { type Harness, type HarnessOptions, startHarness } from "./harness.ts";

// ---------------------------------------------------------------------------
// 주입 — 하네스가 여는 자리 하나에서만 유도한다
// ---------------------------------------------------------------------------

/** 하네스가 공개한 유일한 주입 자리의 타입 */
type HarnessModel = NonNullable<HarnessOptions["model"]>;
type ModelStreamEvent =
  ReturnType<HarnessModel["stream"]> extends AsyncIterable<infer Event> ? Event : never;
type DoneEvent = Extract<ModelStreamEvent, { type: "done" }>;
/** 최종 메시지의 내용 블록. 코어 소유 유니온이고 화면의 소진 검사가 이것 위에 선다 */
type ContentBlock = DoneEvent["message"]["content"][number];

const USAGE = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 };

/**
 * 코어 유니온에 없는 판별자. **캐스트가 이 한 자리뿐인 것이 의도다** — 역할 쪽으로 내면
 * 레이블 조회가 `undefined`가 되는 곁가지가 하나 더 붙어 재는 것이 흐려진다.
 */
const UNKNOWN_BLOCK = {
  type: "qa-landing-fault/unknown-block",
  text: "이 블록은 화면이 모르는 판별자를 든다",
} as unknown as ContentBlock;

/** 대조군이 화면에서 되찾을 문면. 자국과 겹치지 않게 둔다 */
const CONTROL_REPLY = "대조군이 낸 정상 응답입니다.";

/**
 * 결함 모델이 실제로 불린 횟수. **서버에서 런이 돌았다는 것의 관측점이다** — 나가는
 * 요청만 세면 「서버가 거절했을 수도 있다」가 남는데, 모델이 한 번 더 불렸다는 사실에는
 * 그 갈래가 없다.
 */
let faultModelCalls = 0;

/** 화면이 모르는 판별자 하나만 내는 모델 */
function faultModel(): HarnessModel {
  return {
    modelId: "qa-landing-fault/unknown",
    async *stream() {
      faultModelCalls += 1;
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [UNKNOWN_BLOCK],
          stopReason: "end_turn",
          usage: USAGE,
          timestamp: Date.now(),
        },
      };
    },
  };
}

/** 같은 자리에 아는 판별자를 내는 모델. 갈리는 것이 블록의 판별자 하나뿐이다 */
function controlModel(): HarnessModel {
  return {
    modelId: "qa-landing-fault/control",
    async *stream() {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text: CONTROL_REPLY }],
          stopReason: "end_turn",
          usage: USAGE,
          timestamp: Date.now(),
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 관측 도구
// ---------------------------------------------------------------------------

const anchor = (name: (typeof ANCHOR_NAMES)[number]): string => `#${name}`;

const WAIT_MS = 20_000;
/** 「그 뒤로 아무 일도 안 난다」를 재려면 실제로 시간을 줘야 한다 */
const SETTLE_MS = 2_500;

/** 화면에서 읽는 것 전부. 두 시점의 이 값이 같으면 「화면이 안 바뀌었다」다 */
interface Screen {
  readonly status: string;
  readonly transcript: string;
  readonly approval: string;
}

async function readScreen(page: Page): Promise<Screen> {
  return {
    status: (await page.locator(anchor("connection-status")).textContent()) ?? "",
    transcript: (await page.locator(anchor("transcript")).textContent()) ?? "",
    approval: (await page.locator(anchor("approval")).textContent()) ?? "",
  };
}

/**
 * `connection-status`가 `from`과 달라질 때까지 기다린다. **못 기다려도 던지지 않는다** —
 * 타임아웃을 훅에서 터뜨리면 축의 진단이 「hook failed」 한 줄로 뭉개진다. 마지막으로 읽은
 * 값을 그대로 돌려주고 판정은 단언이 한다.
 */
async function awaitStatusChange(page: Page, from: string): Promise<string> {
  const deadline = Date.now() + WAIT_MS;
  let last = from;
  while (Date.now() < deadline) {
    last = (await page.locator(anchor("connection-status")).textContent()) ?? "";
    if (last !== from && last.trim() !== "") return last;
    await page.waitForTimeout(150);
  }
  return last;
}

// ---------------------------------------------------------------------------
// 관측 기록 — 세 축이 같은 한 번의 구동을 나눠 읽는다
// ---------------------------------------------------------------------------

interface Observed {
  /** A: 턴 도중의 착지 실패 */
  readonly turn: {
    statusBeforeSubmit: string;
    statusAfterFault: string;
    screenAfterFault: Screen;
  };
  /**
   * B: 대조군 — 같은 자리를 아는 판별자로 지났을 때의 종착 문면.
   *
   * **뒤의 셋은 역검증용이다.** 「멈췄다」를 재는 축들(L-2a·L-2c)은 *화면이 안 바뀐다*로
   * 재므로, 그 측정이 애초에 변화를 못 보는 것이면 초록이 공허하다. 멈추지 **않은** 배선에
   * 같은 두 신호를 넣어 화면이 실제로 바뀌는 것을 함께 잰다.
   */
  readonly control: {
    terminalStatus: string;
    transcript: string;
    screenBeforeGesture: Screen;
    screenAfterGesture: Screen;
    screenAfterServerShutdown: Screen;
  };
  /**
   * C: 결함이 이미 박힌 스냅샷을 받는 탭. §8.1이 이 경로의 실제 발현으로 지목한
   * 「열려 있던 탭」의 형태이고, **컴포저가 잠기지 않은 채로 던진다** — 그래서 여기서만
   * 「멈춘 뒤에 실제 사용자 제스처가 도달 가능한가」를 잴 수 있다.
   */
  readonly reloaded: {
    screenAfterFault: Screen;
    submitActionable: boolean;
    gestureError: string;
    requestsAfterGesture: readonly string[];
    modelCallsBeforeGesture: number;
    modelCallsAfterGesture: number;
    screenAfterGesture: Screen;
    screenAfterServerShutdown: Screen;
  };
  /** 브라우저 콘솔에 남은 것 전부(진단용) */
  readonly consoleMessages: readonly string[];
}

const observed: Observed = {
  turn: { statusBeforeSubmit: "", statusAfterFault: "", screenAfterFault: blankScreen() },
  control: {
    terminalStatus: "",
    transcript: "",
    screenBeforeGesture: blankScreen(),
    screenAfterGesture: blankScreen(),
    screenAfterServerShutdown: blankScreen(),
  },
  reloaded: {
    screenAfterFault: blankScreen(),
    submitActionable: false,
    gestureError: "",
    requestsAfterGesture: [],
    modelCallsBeforeGesture: -1,
    modelCallsAfterGesture: -1,
    screenAfterGesture: blankScreen(),
    screenAfterServerShutdown: blankScreen(),
  },
  consoleMessages: [],
};

function blankScreen(): Screen {
  return { status: "<미관측>", transcript: "<미관측>", approval: "<미관측>" };
}

let faultHarness: Harness | undefined;
let controlHarness: Harness | undefined;
let browser: Browser | undefined;

describe("WEB-UI §8.1 계약 ⑥ · §9.6 결정 13 — 착지가 실패하면 배선은 멈춘다", () => {
  beforeAll(async () => {
    browser = await launchBrowser();

    // --- B. 대조군 먼저 — 자국을 「정상 종착 문면」과 가를 기준선을 만든다 -----------
    controlHarness = await startHarness({ model: controlModel() });
    const controlPage = await browser.newPage();
    controlPage.setDefaultTimeout(WAIT_MS);
    await controlPage.goto(controlHarness.url, { waitUntil: "domcontentloaded" });
    await controlPage
      .locator(anchor("connection-status"))
      .filter({ hasText: /\S/ })
      .waitFor({ state: "attached", timeout: WAIT_MS });
    await controlPage.locator(anchor("composer-input")).fill("대조군 — 아는 판별자 한 턴");
    await controlPage.locator(anchor("composer-submit")).click();
    await controlPage
      .locator(anchor("transcript"))
      .filter({ hasText: CONTROL_REPLY })
      .waitFor({ state: "attached", timeout: WAIT_MS });
    await controlPage.waitForTimeout(SETTLE_MS);
    const controlScreen = await readScreen(controlPage);
    Object.assign(observed.control, {
      terminalStatus: controlScreen.status,
      transcript: controlScreen.transcript,
      screenBeforeGesture: controlScreen,
    });

    // 역검증 — 멈추지 않은 배선에 같은 두 신호를 넣는다. 여기서 화면이 안 바뀌면
    // 아래 L-2a·L-2c의 초록은 계약이 아니라 측정의 눈멂을 뜻한다.
    await controlPage.locator(anchor("composer-input")).fill("대조군 — 둘째 제스처");
    await controlPage.locator(anchor("composer-submit")).click();
    await controlPage.waitForTimeout(SETTLE_MS);
    observed.control.screenAfterGesture = await readScreen(controlPage);

    await controlHarness.stop();
    await controlPage.waitForTimeout(SETTLE_MS);
    observed.control.screenAfterServerShutdown = await readScreen(controlPage);
    await controlPage.close();

    // --- A. 턴 도중의 착지 실패 -----------------------------------------------------
    faultHarness = await startHarness({ model: faultModel() });
    const page = await browser.newPage();
    page.setDefaultTimeout(WAIT_MS);
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));
    const requests: string[] = [];
    page.on("request", (request) => requests.push(`${request.method()} ${request.url()}`));

    await page.goto(faultHarness.url, { waitUntil: "domcontentloaded" });
    await page
      .locator(anchor("connection-status"))
      .filter({ hasText: /\S/ })
      .waitFor({ state: "attached", timeout: WAIT_MS });
    await page.waitForTimeout(SETTLE_MS);
    observed.turn.statusBeforeSubmit = (await readScreen(page)).status;

    await page.locator(anchor("composer-input")).fill("착지 실패 — 화면이 모르는 판별자를 받는다");
    await page.locator(anchor("composer-submit")).click();
    observed.turn.statusAfterFault = await awaitStatusChange(
      page,
      observed.turn.statusBeforeSubmit,
    );
    await page.waitForTimeout(SETTLE_MS);
    observed.turn.screenAfterFault = await readScreen(page);

    // --- C. 결함이 스냅샷에 박힌 채로 새 연결이 서는 탭 ------------------------------
    // 여기서 다시 여는 이유는 «잠기지 않은 컴포저»다. A에서는 결정 5의 제출 잠금이
    // 걸린 그림이 마지막으로 성공한 그리기라 DOM이 잠긴 채 얼어 있고, 그러면 실제
    // 사용자 클릭이 원리적으로 불가능해 「멈춘 뒤 신호를 접는가」를 못 잰다. 새 연결의
    // 핸드셰이크는 그 결함 메시지를 스냅샷으로 싣고 **첫 그리기에서** 던지므로 컴포저는
    // 정적 초기 상태(열림) 그대로다 — §8.1이 이 경로의 실제 발현으로 든 「열려 있던 탭」의
    // 형태이기도 하다.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(SETTLE_MS);
    observed.reloaded.screenAfterFault = await readScreen(page);

    const submit = page.locator(anchor("composer-submit"));
    observed.reloaded.submitActionable = await submit.isEnabled();
    const markBeforeGesture = requests.length;
    observed.reloaded.modelCallsBeforeGesture = faultModelCalls;
    try {
      await page.locator(anchor("composer-input")).fill("멈춘 뒤의 제스처", { timeout: 5_000 });
      await submit.click({ timeout: 5_000 });
    } catch (error) {
      observed.reloaded.gestureError = error instanceof Error ? error.message : String(error);
    }
    await page.waitForTimeout(SETTLE_MS);
    Object.assign(observed.reloaded, {
      requestsAfterGesture: requests.slice(markBeforeGesture),
      modelCallsAfterGesture: faultModelCalls,
      screenAfterGesture: await readScreen(page),
    });

    // 서버가 내는 푸시 하나 — 종료 고지. 배선이 멈췄으면 이것이 화면에 안 닿는다.
    await faultHarness.stop();
    await page.waitForTimeout(SETTLE_MS);
    observed.reloaded.screenAfterServerShutdown = await readScreen(page);

    Object.assign(observed, { consoleMessages });
  });

  afterAll(async () => {
    // **핸들의 부재를 가드한다.** §7.1 결정 6이 브라우저 부재를 하드 실패로 정했으므로
    // 이 훅은 「기동이 실패한 뒤」에도 돈다. 무가드로 역참조하면 그 자리에서 TypeError가
    // 나면서 하네스 정지가 안 돌고 HTTP 서버가 바인드된 채 남는다.
    try {
      await browser?.close();
    } finally {
      await faultHarness?.stop();
      await controlHarness?.stop();
    }
  });

  // -------------------------------------------------------------------------
  // 축 1 — 자국이 선다
  //
  // 도출: 계약 ⑥ *"멈췄다는 사실이 화면에 선다"* + §9.6 결정 13 *"자리는
  // `connection-status`다."*
  // -------------------------------------------------------------------------

  it("L-1 착지가 실패하면 `connection-status`에 던짐 이전과 다른 자국이 서고, 그 자국이 비어 있지 않다", () => {
    const before = observed.turn.statusBeforeSubmit;
    const after = observed.turn.statusAfterFault;
    const diagnostic = `이전=${JSON.stringify(before)} 이후=${JSON.stringify(after)} 대조군=${JSON.stringify(observed.control.terminalStatus)} 콘솔=${JSON.stringify(observed.consoleMessages)}`;

    expect(before.trim(), `기준선이 비어 있으면 「갈렸다」가 뜻을 잃는다 — ${diagnostic}`).not.toBe(
      "",
    );
    expect(after.trim(), `자국이 비어 있다 — ${diagnostic}`).not.toBe("");
    expect(after, `자국이 던짐 이전과 안 갈렸다 — ${diagnostic}`).not.toBe(before);
  });

  it("L-1b 그 자국이 정상 턴의 종착 문면과도 갈린다", () => {
    // **이 축이 없으면 L-1이 공허할 수 있다.** 제출 왕복 동안의 평범한 문면 변화(결정 5의
    // 잠금 표시 등)만으로도 「갈렸다」가 서기 때문이다. 갈리는 것이 내용 블록의 판별자
    // 하나뿐인 대조군을 같은 자리에서 돌려, 자국이 **정상 종착과도** 다른 값임을 잰다.
    // 문면의 값은 여전히 안 박는다 — 재는 것은 두 종착이 같은가뿐이다.
    const diagnostic = `결함=${JSON.stringify(observed.turn.statusAfterFault)} 대조군=${JSON.stringify(observed.control.terminalStatus)} 대조군 트랜스크립트=${JSON.stringify(observed.control.transcript)}`;

    expect(observed.control.transcript, `대조군이 정상 턴을 못 돌았다 — ${diagnostic}`).toContain(
      CONTROL_REPLY,
    );
    expect(
      observed.turn.statusAfterFault,
      `착지 실패의 종착이 정상 턴의 종착과 같다 — 자국이 안 섰거나 화면이 판별자를 조용히 흘렸다. ${diagnostic}`,
    ).not.toBe(observed.control.terminalStatus);
  });

  // -------------------------------------------------------------------------
  // 축 2 — 멈춘다
  //
  // 도출: 계약 ⑥ *"배선은 그 자리에서 멈춘다 — 스트림을 닫고, 더 이상 어떤 신호도 접지
  // 않으며"*. §9.6 결정 3이 콜백 다섯과 **사용자 제스처**를 한 알파벳에 넣었으므로
  // «신호»의 모집단에 제스처가 든다 — 그래서 아래 둘이 같은 계약의 두 면이다.
  // -------------------------------------------------------------------------

  it("L-0 역검증 — 멈추지 않은 배선에서는 같은 두 신호가 화면을 실제로 바꾼다", () => {
    // **이 축이 없으면 L-2a·L-2c의 초록을 못 읽는다.** 「화면이 안 바뀐다」는 단언은
    // 측정이 변화를 볼 수 있을 때만 계약을 잰다. 대조군(정상 턴을 마친 살아 있는 배선)에
    // 같은 제스처와 같은 서버 종료를 넣어 둘 다 화면을 바꾸는 것을 확인한다.
    expect(
      observed.control.screenAfterGesture,
      "대조군에서 제스처가 화면을 안 바꿨다 — L-2a의 측정이 눈이 멀었다",
    ).not.toEqual(observed.control.screenBeforeGesture);
    expect(
      observed.control.screenAfterServerShutdown,
      "대조군에서 서버 종료가 화면을 안 바꿨다 — L-2c의 측정이 눈이 멀었다",
    ).not.toEqual(observed.control.screenAfterGesture);
  });

  it("L-2a 멈춘 뒤 사용자 제스처가 화면을 더 안 바꾼다", () => {
    const diagnostic = `제스처 도달 가능=${String(observed.reloaded.submitActionable)} 제스처 오류=${JSON.stringify(observed.reloaded.gestureError)}`;
    expect(
      observed.reloaded.screenAfterGesture,
      `멈춘 뒤의 제스처가 화면을 바꿨다 — ${diagnostic}`,
    ).toEqual(observed.reloaded.screenAfterFault);
  });

  it("L-2b [미규정] 멈춘 뒤에도 제스처가 서버로 요청을 내보낸다 — 오늘의 실물", () => {
    // **이 축은 판정이 아니라 관측이다** (2026-08-31 · 유저 판정으로 강등). 원래 이 자리는
    // *"서버로 나가지 않는다"*를 계약 ⑥에서 도출해 단언했고 붉었다. 판정을 다시 하니
    // **계약 ⑥의 세 절이 전부 실물에서 지켜진다**: 스트림은 닫혔고(L-2c), 신호는 안 접히며
    // (부트가 접는 자리를 갈아 끼운다 — 화면이 안 바뀌는 L-2a가 그 결과다), 자국은 섰다
    // (L-1). **«요청을 안 내보낸다»는 절이 정본에 없다** — §8.1도 §9.6도 멈춘 배선의
    // 바깥 방향 왕복을 어느 자리에서도 안 든다.
    //
    // 그렇다고 결함이 아닌 것은 아니다. 화면에 「멈췄다」가 선 채로 사용자의 프롬프트가
    // 서버에서 실제로 실행되고 그 사실이 어디에도 안 남는 것은 `ARCHITECTURE.md` §2.6이
    // 이름 붙인 침묵 실패의 형태다. **그래서 축을 지우지 않고 오늘 실물을 붙든다** —
    // 처분이 나서 요청이 막히는 날 이 축이 붉고, 그때 이 주석이 그 카드를 가리킨다.
    // 판정은 `/make-design docs/WEB-UI.md §8.1` 소관이다.
    //
    // 원인은 `client/main.js`의 제스처 콜백이다 — 접는 자리가 갈아 끼워져 신호는 안 접히나
    // 같은 콜백의 다음 줄이 왕복을 그대로 낸다. 경로를 안 박고 **메서드**로 가른다(자산은
    // 전부 GET이고 배선이 내는 왕복은 POST다 — 어느 엔드포인트인가는 §12의 세부다).
    const outgoing = observed.reloaded.requestsAfterGesture.filter((entry) =>
      entry.startsWith("POST "),
    );
    expect(
      observed.reloaded.submitActionable,
      `제스처가 도달 불가면 이 관측이 공허하다 — 오류=${JSON.stringify(observed.reloaded.gestureError)}`,
    ).toBe(true);
    expect(
      outgoing.length,
      `오늘의 실물이 바뀌었다 — 멈춘 뒤의 제스처가 더는 서버로 안 나간다. 정본 §8.1의 처분이 났는지 확인하고 이 축을 판정 축으로 되돌린다. 나간 것: ${JSON.stringify(observed.reloaded.requestsAfterGesture)}`,
    ).toBeGreaterThan(0);
  });

  it("L-2d [미규정] 그 요청이 서버에서 런을 실제로 돌린다 — 오늘의 실물", () => {
    // L-2b가 남기는 갈래 하나를 닫는다 — 「요청은 나갔지만 서버가 거절했을 수도 있다」.
    // 모의 모델이 한 번 더 불렸다는 사실에는 그 갈래가 없다. **이것이 위 관측을 결함으로
    // 만드는 부분이다** — 나간 것이 거절당하고 끝나는 것이 아니라 런이 실제로 돈다.
    // 위 축과 같은 이유로 판정이 아니라 관측이고, 같은 카드가 처분을 진다.
    expect(
      observed.reloaded.modelCallsAfterGesture,
      `오늘의 실물이 바뀌었다 — 멈춘 뒤의 제스처가 더는 런을 안 돌린다 (모델 호출 ${String(observed.reloaded.modelCallsBeforeGesture)} → ${String(observed.reloaded.modelCallsAfterGesture)}). L-2b와 함께 판정 축으로 되돌린다.`,
    ).toBeGreaterThan(observed.reloaded.modelCallsBeforeGesture);
  });

  it("L-2c 멈춘 뒤 서버가 낸 푸시가 화면을 더 안 바꾼다", () => {
    // 서버 종료는 §6.1의 종료 고지를 푸시하고, 그 뒤 전송은 끊긴 연결을 다시 붙이려 든다.
    // 배선이 스트림을 닫았으면 둘 다 화면에 안 닿는다. 닫지 않았으면 종료 문면이나 상실
    // 문면 중 하나가 자국을 덮는다 — 그것이 이 축이 겨눈 실패다.
    expect(
      observed.reloaded.screenAfterServerShutdown,
      "서버 푸시가 멈춘 뒤의 화면을 바꿨다 — 스트림이 안 닫혔다",
    ).toEqual(observed.reloaded.screenAfterGesture);
  });

  // -------------------------------------------------------------------------
  // 축 3 — 얼어붙지 않는다
  //
  // 도출: 계약 ⑥이 처분을 낳은 근거 문장 — *"화면이 그 시점에 얼어붙고 영영 안 움직인다.
  // 사용자가 보는 것은 «에이전트가 멈췄다»이고 실제로는 스트림이 흐르고 있다."* 그 실패의
  // 관측 가능한 형태는 «던짐 이전 화면이 자국 없이 그대로 남는다»이고, 계약이 요구하는 것은
  // 그 자리에 **배선이 멈췄다는 자국**이 서는 것이다.
  // -------------------------------------------------------------------------

  it("L-3a 결함이 스냅샷에 박힌 채 새로 선 연결에서도 자국이 화면에 선다 — 콘솔이 유일한 자국이 아니다", () => {
    // §8.1은 접기가 던지는 갈래를 *"콘솔 밖에는 자국이 없다"*로 적고 계약 ⑥이 그 처분을
    // 뒤집었다. 그래서 이 축이 재는 것은 **화면(DOM)** 이다 — 콘솔은 계약이 요구하는
    // 자리가 아니므로 단언에 안 넣고 진단으로만 싣는다.
    const diagnostic = `콘솔=${JSON.stringify(observed.consoleMessages)} 화면=${JSON.stringify(observed.reloaded.screenAfterFault)}`;
    expect(
      observed.reloaded.screenAfterFault.status.trim(),
      `첫 그리기가 던진 탭의 화면에 자국이 없다 — ${diagnostic}`,
    ).not.toBe("");
    expect(
      observed.reloaded.screenAfterFault.status,
      `그 자국이 정상 턴의 종착 문면과 같다 — 사용자가 「에이전트가 멈췄다」로 읽는다. ${diagnostic}`,
    ).not.toBe(observed.control.terminalStatus);
  });

  it("L-3b 그 자국이 지속한다 — 이후 어떤 신호도 그것을 지우지 않는다", () => {
    // 「영영 안 움직인다」의 반대는 «자국이 잠깐 떴다가 다음 신호에 덮인다»도 포함한다.
    // 제스처 뒤·서버 푸시 뒤에도 같은 자국이 비어 있지 않게 남아 있어야 한다.
    for (const [label, screen] of [
      ["제스처 뒤", observed.reloaded.screenAfterGesture],
      ["서버 푸시 뒤", observed.reloaded.screenAfterServerShutdown],
    ] as const) {
      expect(screen.status.trim(), `${label}에 자국이 비었다`).not.toBe("");
      expect(screen.status, `${label}에 자국이 바뀌었다`).toBe(
        observed.reloaded.screenAfterFault.status,
      );
    }
  });

  it("L-3c 턴 도중에 던진 탭에서도 자국이 지속한다", () => {
    expect(
      observed.turn.screenAfterFault.status,
      `자국이 안정되기 전에 다른 값으로 밀렸다: ${JSON.stringify(observed.turn.screenAfterFault)}`,
    ).toBe(observed.turn.statusAfterFault);
  });

  // -------------------------------------------------------------------------
  // 회색지대 — 판정하지 않고 붙들기만 한다
  // -------------------------------------------------------------------------

  it("L-4 [미규정] 던짐 시점의 트랜스크립트 잔여물", () => {
    // **[미규정]** §9.6 결정 8이 그리기를 *"전량 재구성"*으로 정했는데, 그 재구성이 도중에
    // 던지면 앵커 안에 **반쯤 지어진 것**이 남는가 지어지기 전 것이 남는가를 §8.1도 §9.6도
    // 정하지 않는다. 계약 ⑥이 정한 것은 «멈춘다»와 «자국이 선다»뿐이고 남은 화면의 모양은
    // 안 든다. 그래서 여기서는 **판정하지 않고 오늘 실물을 붙들기만 한다** — 이 값이
    // 바뀌면 이 축이 그 사실을 든다. 리포트에 「판정 필요」로 올렸다.
    //
    // 판정이 필요한 이유: 반쯤 지어진 트랜스크립트는 「화면은 상태의 함수다」가 거짓인
    // 화면이고(§9.6 결정 8이 부분 갱신을 기각한 근거가 그 성질이다), 사용자는 그것을
    // 자국과 **함께** 본다.
    expect(typeof observed.turn.screenAfterFault.transcript).toBe("string");
    expect(typeof observed.reloaded.screenAfterFault.transcript).toBe("string");
  });
});
