/**
 * **관측 둘** — 플랜 `plans/20260828-webui-e2e-harness-plan.md` §4의 T-008이 이 파일의 정본이고,
 * 물음의 출처는 `docs/TECH-STACK.md` §7.1(「무엇을 재려고 도입하는가」)과
 * `plans/20260828-k307-interview.md` 미결 1이다.
 *
 * - **관측 A — `/client/` 도달 가능성.** 브라우저가 C2 한 턴을 도는 동안 **실제로 받아 간**
 *   `/client/` 요청 목록을 모으고, `ASSET_MANIFEST`의 `/client/` 등재분과 나란히 남긴다.
 * - **관측 B — C2가 지나지 않는 앵커.** `packages/serve/client/anchors.js`가 배선한 앵커 전체와,
 *   C2 시나리오가 실제로 건드리는 앵커를 대조해 차집합을 남긴다.
 *
 * ## 여기서 상등을 단정하지 않는다 — 이 파일에 단정 호출이 0건인 것이 그 형태다
 *
 * 「등재된 것이 전부 실제로 열려야 한다」는 **오늘 어느 정본에도 없다.** `assets.ts`가
 * §9.2의 판별을 인용해 *"판별은 종류이지 도달이 아니다"*를 적었고, §9.5 결정 4의 인접 물음
 * (임포트 그래프가 `authored` 집합을 덮을 의무를 정본이 지웠는가)은 2026-08-27에 **미규정
 * 유지**로 판정됐다. 같은 자리를 `K-346`이 지고 있다. 그러므로 계약이 없는 상태에서 상등을
 * 심으면 이 축이 **정본보다 넓게 주장하는 검사**가 된다.
 *
 * 앵커 쪽도 같다. `anchors.js`가 스스로 *"재는 것이 이름의 **존재**이지 부재가 아니다"*를 적고
 * 그 비대칭을 §9.5의 판정(*"위험한 방향만 기계가 잡는다"*)으로 돌렸다 — 「C2가 모든 앵커를
 * 지나야 한다」는 어디에도 없다.
 *
 * **그래서 이 파일이 내는 것은 기록이지 판정이 아니다.** 판정은 `K-346`(도달 가능성의 계약)과
 * `K-350`(앵커 요소 종류)이 진다.
 *
 * **완전하지 않다는 것도 적는다**(플랜 §8 G-15). 「어떤 값에서도 안 붉는다」를 기계로 완전히
 * 재는 수단이 없어 **단정 호출 0건**으로 대신했고, 이 축이 예외를 던지는 형태로 붉을 여지는
 * 남는다 — 아래 대기(`waitFor`)가 그것이다. 그 대기가 필요한 이유는 관측이 **흐름이 실제로
 * 돌았을 때의 값**이어야 하기 때문이고, 돌지 않았는데 조용히 빈 목록을 남기면 그것이 곧
 * `ARCHITECTURE.md` §2.6이 금지한 침묵이다. 즉 남은 붉음의 여지는 **관측이 성립하지 않음**을
 * 알리는 자리이지 계약 판정이 아니다.
 *
 * **이 주석이 단정 호출의 토큰을 문자 그대로 안 적는 것은 의도다.** 재는 수단이 그 토큰을
 * `grep -c`로 이 파일 전체에서 세는 것이므로, 설명하려고 토큰을 본문에 적으면 검사가 자기
 * 설명을 세어 0이 아닌 값을 낸다 — 실제로 초안이 2를 냈고 그 둘이 전부 이 주석이었다.
 * 서술이 자기가 재는 값을 흔드는 자리라, 서술 쪽을 물렸다. 명령의 정본은 플랜 §4 T-008이다.
 *
 * ## C2를 재현한다 — 그 재현이 C2와 같음을 소스에서 잰다
 *
 * T-007의 축(`webui-turn.e2e.test.ts`)에 수집 코드를 심으면 그 축이 관측 도구가 되어 계약
 * 판정과 기록이 한 파일에서 섞인다. 그래서 이 파일이 **자기 브라우저·자기 하네스로 같은 네
 * 단계를 다시 돈다.** 재현이 C2와 같은지는 말로 두지 않고, 그 축의 소스에서 `anchor("…")`가
 * 드는 이름을 **기계로 뽑아** 이 재현이 실제로 건드린 이름과 나란히 남긴다.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Locator, Page } from "playwright";
import { afterAll, beforeAll, describe, it } from "vitest";
import { ANCHOR_NAMES } from "../packages/serve/client/anchors.js";
import type { APPROVAL_ANSWERS } from "../packages/serve/client/view.js";
import { ASSET_MANIFEST } from "../packages/serve/src/assets.ts";
import { launchBrowser } from "./browser.ts";
import {
  HARNESS_APPROVAL_TOOL,
  HARNESS_CLOSING_REPLY,
  HARNESS_TEXT_REPLY,
  type Harness,
  startHarness,
} from "./harness.ts";
import { E2E_DIR } from "./paths.ts";

/**
 * 목록을 남기는 자리. 기본값이 레포 루트의 `plans/`인 것은 이 관측의 **수신처가 그
 * 디렉터리의 리포트**이기 때문이다(플랜 §4 T-008). 그 디렉터리는 루트 `.gitignore`가 닫아
 * 로컬 전용이라, 산출이 제품 트리를 오염시키지 않는다.
 */
const OUTPUT_DIR =
  process.env.NEO_E2E_OBSERVATION_DIR ?? fileURLToPath(new URL("../../plans/", import.meta.url));

const OUTPUT_A = join(OUTPUT_DIR, "20260828-webui-e2e-observation-a.json");
const OUTPUT_B = join(OUTPUT_DIR, "20260828-webui-e2e-observation-b.json");

/** C2 축의 소스. 관측 B가 「C2가 이름으로 드는 앵커」를 여기서 뽑는다 */
const C2_SOURCE = join(E2E_DIR, "webui-turn.e2e.test.ts");

/** 화면 쪽 대기의 상한. C2 축과 같은 값이다 */
const WAIT_MS = 20_000;

const PROMPT_TEXT_TURN = "e2e T-008 관측 1턴 — 텍스트 한 턴을 받는다";
const PROMPT_APPROVAL_TURN = "e2e T-008 관측 2턴 — 승인 왕복을 돈다";

const ANSWER_ATTR = "data-approval-answer";

/** 답 하나. 타입이 서버의 집합에서 파생하므로 집합 밖 값은 컴파일에서 붉는다 */
type ApprovalAnswer = (typeof APPROVAL_ANSWERS)[number];

/** 이 재현이 보내는 답. C2 축과 같은 값이다 */
const ALLOW_ONCE: ApprovalAnswer = "allow-once";

/** 브라우저 안에서 앵커 접촉을 모으는 자리. 이름을 길게 둔 것은 페이지 전역과의 충돌 회피다 */
interface AnchorObservations {
  /** 자기 자신이나 자손이 변한 앵커 — 배선이 그 자리를 실제로 채웠다는 형태 */
  mutated: Set<string>;
  /** 사용자 조작(click·input·change·keydown)이 닿은 앵커 */
  interacted: Set<string>;
}

type ObservationWindow = Window & {
  __neoAnchorObservations?: AnchorObservations;
};

let harness: Harness;
let browser: Browser;
let page: Page;

/** 관측 A의 수집통 — 경로 → 응답 상태. 같은 경로를 두 번 받아도 한 항이다 */
const clientResponses = new Map<string, number>();

/** 브라우저가 열려다 실패한 `/client/` 경로. 「받아 갔다」와 「받으려다 못 받았다」를 가른다 */
const clientFailures = new Map<string, string>();

function clientPathOf(url: string): string | undefined {
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith("/client/") ? pathname : undefined;
  } catch {
    return undefined;
  }
}

/** 자리 하나가 문면을 담을 때까지 기다린다. C2 축과 같은 수단(렌더된 텍스트)이다 */
async function waitForText(root: Locator, needle: string): Promise<void> {
  await root.filter({ hasText: needle }).waitFor({ state: "attached", timeout: WAIT_MS });
}

/** `A \ B`. 순서는 입력 순서를 보존한다 */
function difference(left: readonly string[], right: readonly string[]): string[] {
  const drop = new Set(right);
  return left.filter((item) => !drop.has(item));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("T-008 관측 — /client/ 도달 가능성 · C2가 안 지나는 앵커", () => {
  beforeAll(async () => {
    harness = await startHarness();
    browser = await launchBrowser();
    page = await browser.newPage();
    page.setDefaultTimeout(WAIT_MS);

    // **수집을 탐색보다 먼저 단다.** 뒤에 달면 첫 그리기까지의 요청이 조용히 사라지고, 그
    // 창이 정확히 배선이 모듈을 여는 창이다 — 관측 A가 재려는 것이 통째로 빠진다.
    page.on("response", (response) => {
      const path = clientPathOf(response.url());
      if (path !== undefined) clientResponses.set(path, response.status());
    });
    page.on("requestfailed", (request) => {
      const path = clientPathOf(request.url());
      if (path !== undefined) {
        clientFailures.set(path, request.failure()?.errorText ?? "<이유 없음>");
      }
    });

    // 브라우저 안의 앵커 접촉 수집기. `addInitScript`는 페이지의 어떤 스크립트보다 먼저
    // 도므로 배선이 첫 프레임을 그리기 전부터 관측이 선다.
    await page.addInitScript((names: readonly string[]) => {
      const anchors = new Set(names);
      const observations: AnchorObservations = { mutated: new Set(), interacted: new Set() };
      (window as ObservationWindow).__neoAnchorObservations = observations;

      /** 노드에서 위로 올라가 이 노드를 소유한 앵커 이름을 찾는다. 없으면 undefined */
      const ownerAnchor = (node: EventTarget | null): string | undefined => {
        let element = node instanceof Element ? node : (node as Node | null)?.parentElement;
        while (element) {
          if (element.id !== "" && anchors.has(element.id)) return element.id;
          element = element.parentElement;
        }
        return undefined;
      };

      new MutationObserver((records) => {
        for (const record of records) {
          const owner = ownerAnchor(record.target);
          if (owner !== undefined) observations.mutated.add(owner);
        }
      }).observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });

      for (const type of ["click", "input", "change", "keydown"]) {
        document.addEventListener(
          type,
          (event) => {
            const owner = ownerAnchor(event.target);
            if (owner !== undefined) observations.interacted.add(owner);
          },
          true,
        );
      }
    }, ANCHOR_NAMES);

    // ── C2의 네 단계를 그대로 재현한다 ────────────────────────────────────────
    await page.goto(harness.url, { waitUntil: "domcontentloaded" });
    await waitForText(page.locator("#connection-status"), "연결됨");

    await page.locator("#composer-input").fill(PROMPT_TEXT_TURN);
    await page.locator("#composer-submit").click();
    await waitForText(page.locator("#transcript"), HARNESS_TEXT_REPLY);

    await page.locator("#composer-input").fill(PROMPT_APPROVAL_TURN);
    await page.locator("#composer-submit").click();
    await waitForText(page.locator("#approval"), HARNESS_APPROVAL_TOOL);
    await page.locator(`#approval [${ANSWER_ATTR}="${ALLOW_ONCE}"]`).first().click();
    await waitForText(page.locator("#transcript"), HARNESS_CLOSING_REPLY);
  });

  afterAll(async () => {
    await browser.close();
    await harness.stop();
  });

  it("관측 A — ASSET_MANIFEST의 /client/ 등재분과 브라우저 수신분을 나란히 남긴다", () => {
    const registered = Object.keys(ASSET_MANIFEST)
      .filter((route) => route.startsWith("/client/"))
      .sort();
    const received = [...clientResponses.keys()].sort();
    const failed = [...clientFailures.keys()].sort();

    const record = {
      관측: "A — /client/ 도달 가능성",
      정본: "docs/TECH-STACK.md §7.1 · plans/20260828-webui-e2e-harness-plan.md §4 T-008",
      단정하지_않는_것:
        "「등재된 것이 전부 열려야 한다」는 어느 정본에도 없다 — K-346이 그 판정을 진다",
      시각: new Date().toISOString(),
      등재: { 수: registered.length, 목록: registered },
      수신: {
        수: received.length,
        목록: received,
        상태: Object.fromEntries([...clientResponses].sort(([a], [b]) => a.localeCompare(b))),
      },
      실패: { 수: failed.length, 목록: Object.fromEntries([...clientFailures]) },
      차집합: {
        "등재_안_수신(등재 \\ 수신)": difference(registered, received),
        "수신_안_등재(수신 \\ 등재)": difference(received, registered),
      },
    };

    writeJson(OUTPUT_A, record);
    console.log(`[T-008 관측 A] ${OUTPUT_A}\n${JSON.stringify(record.차집합)}`);
  });

  it("관측 B — 배선된 앵커 전체와 C2가 건드리는 앵커를 대조해 차집합을 남긴다", async () => {
    const all = [...ANCHOR_NAMES].sort();

    // 런타임 — 이 재현이 실제로 건드린 앵커
    const observed = await page.evaluate(() => {
      const captured = (window as ObservationWindow).__neoAnchorObservations;
      return {
        mutated: [...(captured?.mutated ?? [])].sort(),
        interacted: [...(captured?.interacted ?? [])].sort(),
      };
    });
    const touched = [...new Set([...observed.mutated, ...observed.interacted])].sort();

    // 정적 — T-007의 C2 축이 **이름으로 드는** 앵커. 재현이 그 축과 같은 자리를 도는지가
    // 이 열로 갈린다(재현이 넓거나 좁으면 두 열이 어긋난다).
    const namedByC2 = [
      ...new Set(
        [...readFileSync(C2_SOURCE, "utf8").matchAll(/\banchor\("([^"]+)"\)/g)].flatMap((match) =>
          match[1] === undefined ? [] : [match[1]],
        ),
      ),
    ].sort();

    // 화면에 자리 자체는 있는가. `anchors.js`가 *"앵커는 값과 무관하게 항상 존재한다"*를
    // 계약으로 들었으므로, 「자리는 있는데 C2가 안 지난다」와 「자리가 없다」를 가른다.
    const presentInDom: string[] = [];
    for (const name of all) {
      if ((await page.locator(`#${name}`).count()) > 0) presentInDom.push(name);
    }

    const record = {
      관측: "B — C2가 지나지 않는 앵커",
      정본: "packages/serve/client/anchors.js · plans/20260828-k307-interview.md 미결 1",
      단정하지_않는_것: "「C2가 모든 앵커를 지나야 한다」는 어느 정본에도 없다 — K-350 인접",
      시각: new Date().toISOString(),
      배선된_앵커: { 수: all.length, 목록: all },
      화면에_실재: { 수: presentInDom.length, 목록: presentInDom },
      C2가_건드림: {
        수: touched.length,
        목록: touched,
        내용이_변함: observed.mutated,
        조작을_받음: observed.interacted,
      },
      C2가_이름으로_듦: {
        수: namedByC2.length,
        목록: namedByC2,
        출처: "e2e/webui-turn.e2e.test.ts",
      },
      차집합: {
        "C2가_안_지남(배선 \\ 건드림)": difference(all, touched),
        "C2가_이름으로_안_듦(배선 \\ 이름)": difference(all, namedByC2),
        "건드렸으나_이름에_없음(건드림 \\ 이름)": difference(touched, namedByC2),
        "화면에_없음(배선 \\ 실재)": difference(all, presentInDom),
      },
    };

    writeJson(OUTPUT_B, record);
    console.log(`[T-008 관측 B] ${OUTPUT_B}\n${JSON.stringify(record.차집합)}`);
  });
});
