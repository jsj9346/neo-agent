/**
 * 브라우저 확보 관문의 최소 스모크 — 정본은 `docs/TECH-STACK.md` §7.1 결정 6이다.
 *
 * 재는 것은 하나뿐이다: **이 머신에서 크로미움이 실제로 열리는가.** 열고 닫는 것 말고는
 * 아무것도 하지 않는다 — 화면·서버·시나리오는 각각 뒤 작업의 몫이다.
 *
 * ## 이 파일이 없으면 관문의 역검증이 공허하다
 *
 * `e2e/`에 `*.e2e.test.ts`가 0건이면 `vitest run`이 파일 0건으로 **비영 종료**한다. 그러면
 * 「브라우저 부재 → 비영 종료」가 브라우저와 무관하게 통과해 버린다 — 붉기는 붉는데 붉은
 * 이유가 다르다. 결정 6이 겨눈 조용한 초록의 거울상이다. 그래서 관문과 그것을 실제로
 * 지나는 축이 같은 자리에 함께 선다.
 *
 * ## 건너뛰지 않는다
 *
 * `it.skip`도 조건부 건너뛰기도 없다. 이 명령은 사람이 명시적으로 부르는 것이므로, 브라우저
 * 없이 초록으로 끝나는 것은 브라우저 없이 브라우저 검증을 통과했다는 뜻이 된다.
 */

import { expect, it } from "vitest";
import { launchBrowser } from "./browser.ts";

it("헤드리스 크로미움을 열고 닫는다", async () => {
  const browser = await launchBrowser();

  try {
    expect(browser.isConnected()).toBe(true);
    // 버전 문자열이 서면 기동이 형식만 성공한 것이 아니라 프로토콜 왕복이 실제로 돌았다는 뜻이다.
    expect(browser.version()).toMatch(/^\d+\./);
  } finally {
    await browser.close();
  }

  expect(browser.isConnected()).toBe(false);
});
