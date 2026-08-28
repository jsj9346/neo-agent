/**
 * 하네스 계약의 **독립 검증** — 정본은 `docs/TECH-STACK.md` §7.1 결정 4(모의 범위)·
 * 결정 5(포트 0)이고, 시나리오 쪽 정본은 루트 `MILESTONE.md` C2다.
 *
 * **기대값을 하네스에서 읽지 않았다.** 옆 `harness.e2e.test.ts`가 자기 모의 범위를
 * `MOCKED_FACTORY_KEYS`와의 상등으로 재는데, 그 상수는 **구현이 스스로 선언한 값**이라
 * 그 축은 「선언과 실물이 같은가」까지만 잰다. 문서가 정한 범위와 같은가는 안 잰다.
 * 이 파일은 그 자리를 문서 쪽에서 다시 연다.
 *
 * **이 자리가 `e2e/`인 이유** — 아래 축들은 하네스를 실제로 기동해야 관측된다.
 * `packages/cli/test/`에 두면 상시 게이트가 매 실행마다 서버를 띄우게 되고, 그것은
 * §7.1 결정 2가 게이트 밖으로 뺀 바로 그 실행이다. 정적으로 재지는 축은
 * `packages/cli/test/webui-e2e-wiring.qa.test.ts`가 진다.
 *
 * **이 파일은 상시 게이트 밖이다.** `pnpm check`는 이 축들을 부르지 않으므로 여기의
 * 빨간불은 `pnpm test:e2e`를 사람이 부를 때만 보인다.
 */

import type { Browser, Page } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import type { ANCHOR_NAMES } from "../packages/serve/client/anchors.js";
import { launchBrowser } from "./browser.ts";
import { type Harness, type HarnessOptions, startHarness } from "./harness.ts";

/** 하네스가 공개한 유일한 주입 자리의 타입. 문서가 모델을 유일한 모의로 정했으므로 여기 하나여야 한다 */
type HarnessModel = NonNullable<HarnessOptions["model"]>;

/** 이 파일이 브라우저에서 되찾을 문면. 하네스의 상수와 겹치지 않게 둔다 */
const QA_REPLY = "QA 독립 검증이 주입한 문면입니다.";

const USAGE = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 };

/** 텍스트 한 턴만 내는 모델. 하네스의 기본 모의와 문면이 다른 것이 이 축의 전부다 */
function qaModel(): HarnessModel {
  return {
    modelId: "qa-verifier/local",
    async *stream() {
      yield { type: "text_delta", text: QA_REPLY };
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text: QA_REPLY }],
          stopReason: "end_turn",
          usage: USAGE,
          timestamp: Date.now(),
        },
      };
    },
  };
}

const anchor = (name: (typeof ANCHOR_NAMES)[number]): string => `#${name}`;

const WAIT_MS = 20_000;

// ---------------------------------------------------------------------------
// 결정 4 — 모의로 두는 것은 모델뿐인가
// ---------------------------------------------------------------------------

describe("TECH-STACK §7.1 결정 4 — 모의 범위", () => {
  let harness: Harness | undefined;

  afterAll(async () => {
    await harness?.stop();
  });

  it("Q-1 조립에 넘어간 팩토리 모의가 §7.1 결정 4의 닫힌 집합과 정확히 같다", async () => {
    // **기대값의 출처는 §7.1 결정 4의 제목 문장이다(2026-08-28 정정판)** — 재는 대상은
    // 조립 실물이고 모의로 두는 것은 "모델과 Docker 가용 판정(probeDocker)뿐"이라고
    // 적혀 있다. 그 문장은 닫힌 열거이므로 팩토리를 이 둘 밖으로 더 채우면 문서와 갈린다.
    //
    // 이 축은 원래 "모델 하나뿐"을 기대해 `probeDocker` 모의를 계약 위반(F-1)으로
    // 잡았었다(`plans/20260828-webui-e2e-qa-report.md`). 사용자 확인 후 §7.1 결정 4가
    // 그 모의를 명시 예외로 받아들이도록 개정됐으므로, 기대값도 그 개정된 계약을 따른다
    // — 구현을 계약에 맞춘 것이 아니라 계약을 실물 근거 위에서 다시 확정한 것이다.
    harness = await startHarness();
    const filled = Object.keys(harness.deps.factories ?? {}).sort();
    expect(filled, `§7.1 결정 4가 정한 모의 집합과 다르다: ${JSON.stringify(filled)}`).toEqual([
      "createModelClient",
      "probeDocker",
    ]);
  });

  it("Q-2 그 밖의 조립 부품은 실물이다", async () => {
    // 결정 4가 실물로 못박은 것들 — 소켓·자산·프로토콜·승인 레지스트리. 팩토리 표면에서
    // 이름으로 확인할 수 있는 것은 저장소·게이트·도구·경계이고, 소켓과 자산은 아래
    // 실응답이 든다. Q-1이 붉어도 이 축은 독립으로 값을 갖는다.
    harness ??= await startHarness();
    const filled = new Set(Object.keys(harness.deps.factories ?? {}));
    for (const key of ["openStore", "createGate", "createTools", "createBoundary"]) {
      expect(filled.has(key), `${key}가 모의됐다`).toBe(false);
    }
    const response = await fetch(`${harness.url}/`);
    expect(response.status, `로그: ${harness.log()}`).toBe(200);
    await response.text();
  });
});

// ---------------------------------------------------------------------------
// 결정 5 — 포트를 0으로 받는다
// ---------------------------------------------------------------------------

describe("TECH-STACK §7.1 결정 5 — 포트 0", () => {
  it("Q-3 셋을 동시에 띄워도 서로 다른 실포트로 선다", async () => {
    // 결정 5가 겨눈 실패는 둘째 인스턴스의 `EADDRINUSE`다. 옆 축이 둘을 겹치는 데까지
    // 갔으므로 여기서는 셋으로 넓힌다 — 커널이 고르는가 우연히 비어 있었는가를
    // 하나 더 쌓아 가른다.
    const harnesses: Harness[] = [];
    try {
      for (let index = 0; index < 3; index += 1) {
        harnesses.push(await startHarness());
      }
      const ports = harnesses.map((one) => one.port);
      expect(new Set(ports).size, `포트가 겹쳤다: ${JSON.stringify(ports)}`).toBe(3);
      for (const port of ports) expect(port).toBeGreaterThan(0);
      for (const one of harnesses) {
        const response = await fetch(`${one.url}/`);
        expect(response.status, `로그: ${one.log()}`).toBe(200);
        await response.text();
      }
    } finally {
      for (const one of harnesses) await one.stop();
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// C2-3의 역검증 — 화면에 선 문면의 출처가 정말 모델인가
// ---------------------------------------------------------------------------

describe("MILESTONE C2 — SSE 렌더링 축의 역검증", () => {
  let harness: Harness | undefined;
  let browser: Browser | undefined;
  let page: Page | undefined;
  const consoleErrors: string[] = [];

  afterAll(async () => {
    await browser?.close();
    await harness?.stop();
  });

  it("Q-4 모델을 갈아 끼우면 화면 문면이 따라 바뀐다", async () => {
    // **이 축이 없으면 C2-3의 통과가 공허할 수 있다.** 그쪽은 하네스의 상수를 화면에서
    // 되찾는데, 그 상수가 화면 쪽 어딘가에 같은 값으로 박혀 있어도 같은 초록이 난다.
    // 주입한 모델의 문면이 화면에 서는 것만이 그 자리의 출처가 모델임을 가른다.
    //
    // 동시에 이것이 결정 4가 정한 주입 자리의 실효 확인이다 — 모델이 유일한 모의라면
    // 그 하나를 갈아 끼우는 것만으로 관측이 바뀌어야 한다.
    harness = await startHarness({ model: qaModel() });
    browser = await launchBrowser();
    page = await browser.newPage();
    page.setDefaultTimeout(WAIT_MS);
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const response = await page.goto(harness.url, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `로그: ${harness.log()}`).toBe(200);

    const status = page.locator(anchor("connection-status"));
    await status.filter({ hasText: "연결됨" }).waitFor({ state: "attached", timeout: WAIT_MS });

    await page.locator(anchor("composer-input")).fill("QA 역검증 — 주입한 모델의 문면을 되찾는다");
    await page.locator(anchor("composer-submit")).click();

    const transcript = page.locator(anchor("transcript"));
    await transcript.filter({ hasText: QA_REPLY }).waitFor({ state: "attached", timeout: WAIT_MS });
    const text = (await transcript.textContent()) ?? "";
    expect(text, `콘솔 에러: ${JSON.stringify(consoleErrors)}`).toContain(QA_REPLY);

    // 기본 모의의 문면은 안 나온다 — 나오면 주입이 안 먹었고 화면이 다른 출처를 그린 것이다.
    expect(text).not.toContain("하네스가 낸 결정적 응답입니다.");
  }, 180_000);
});

// ---------------------------------------------------------------------------
// C2-3이 실제로 재는 층 — 델타인가 최종 메시지인가
// ---------------------------------------------------------------------------

describe("MILESTONE C2 — 렌더링 축의 모집단", () => {
  let harness: Harness | undefined;
  let browser: Browser | undefined;

  afterAll(async () => {
    await browser?.close();
    await harness?.stop();
  });

  it("Q-5 [미규정] 델타와 최종 메시지가 갈리면 화면이 드는 것은 최종 메시지다", async () => {
    // **이 축은 Q-4를 만들다 실물로 걸린 것을 붙든다.** Q-4의 역검증에서 델타 쪽 문면만
    // 바꿨더니 축이 그대로 초록이었다 — 화면에 남은 텍스트가 최종 메시지에서 왔기
    // 때문이다. 즉 C2의 셋째 단계는 「모델이 낸 문면이 화면에 선다」까지를 재고
    // 「델타가 스트리밍으로 흘렀다」는 안 잰다.
    //
    // **[미규정]** `MILESTONE.md` C2는 그 단계를 SSE 응답 렌더링이라고만 적고 어느 층을
    // 재는지 정하지 않으며, `TECH-STACK.md` §7.1도 정하지 않는다. 그래서 여기서는
    // 판정하지 않고 **오늘 실물을 붙들기만 한다** — 델타 층을 별도로 재기로 정해지면
    // 그 축은 이 자리가 아니라 계약이 새로 여는 자리에 선다. 리포트에 판정 필요로 올렸다.
    const DELTA_ONLY = "QA 델타 전용 문면";
    const FINAL_ONLY = "QA 최종 전용 문면";

    harness = await startHarness({
      model: {
        modelId: "qa-verifier/split",
        async *stream() {
          yield { type: "text_delta", text: DELTA_ONLY };
          yield {
            type: "done",
            message: {
              role: "assistant",
              content: [{ type: "text", text: FINAL_ONLY }],
              stopReason: "end_turn",
              usage: USAGE,
              timestamp: Date.now(),
            },
          };
        },
      },
    });
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(WAIT_MS);
    await page.goto(harness.url, { waitUntil: "domcontentloaded" });
    await page
      .locator(anchor("connection-status"))
      .filter({ hasText: "연결됨" })
      .waitFor({ state: "attached", timeout: WAIT_MS });

    await page.locator(anchor("composer-input")).fill("QA 델타·최종 갈림 관측");
    await page.locator(anchor("composer-submit")).click();

    const transcript = page.locator(anchor("transcript"));
    await transcript
      .filter({ hasText: FINAL_ONLY })
      .waitFor({ state: "attached", timeout: WAIT_MS });
    const text = (await transcript.textContent()) ?? "";

    expect(text, "최종 메시지가 화면에 안 섰다").toContain(FINAL_ONLY);
    // 델타 문면이 남는가는 오늘 실물을 그대로 적는다. 값이 바뀌면 이 축이 그 사실을 든다.
    expect(text.includes(DELTA_ONLY), `오늘 화면이 델타 문면을 남기는가: ${text}`).toBe(false);
  }, 180_000);
});
