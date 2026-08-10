/**
 * 결과 보고의 계약 — 2026-08-10 판정 A-17·A-18·A-19.
 *
 * 이 파일은 QA 계약 테스트(`web-fetch.contract.test.ts`·`fetch.contract.test.ts`)와
 * **작성 주체가 다르다.** 저쪽은 구현을 보기 전에 정본에서만 기대값을 도출한 독립
 * 검증이고, 여기는 세 건의 판정을 내린 뒤 그 판정을 못 박는 것이다. 섞지 않는 이유는
 * 출처를 구분해야 나중에 "이 기대값이 어디서 왔나"를 되짚을 수 있기 때문이다.
 *
 * 기대값의 출처: `docs/WEB-ACCESS.md` §3(추출 회계·빈 결과 명시)·§9 A-17·A-18·A-19.
 *
 * **문면을 통째로 고정하지 않는다.** §9가 "전부 조정 가능"이라고 선언한 층이므로,
 * 판정이 실제로 정한 것 — 어떤 **사실이 결과에 도달하는가**, 그리고 무엇을 **말하지
 * 않는가** — 만 고정한다. 문장을 다듬는 일이 테스트를 깨서는 안 된다.
 */

import type { AgentTool, ToolExecutionContext, ToolResult } from "@neo-agent/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createWebFetchTool,
  type FetchOptions,
  type FetchOutcome,
  fetchUrl,
  type UrlVerdict,
  verifyUrl,
} from "../src/index.ts";
import {
  loopbackVerifyFor,
  relaxTlsForFixtureCert,
  startTestHttpsServer,
  type TestHttpsServer,
} from "./fixtures/https-server.ts";

function ctx(): ToolExecutionContext {
  return { toolCallId: "call-1", signal: new AbortController().signal };
}

function textOf(result: ToolResult): string {
  return result.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function toolWith(outcome: FetchOutcome): AgentTool {
  return createWebFetchTool({ fetch: async () => outcome });
}

function ok(overrides: Partial<Extract<FetchOutcome, { ok: true }>> = {}): FetchOutcome {
  return {
    ok: true,
    url: "https://example.com/doc",
    contentType: "text/plain",
    body: "문서 본문입니다",
    truncated: false,
    hops: 0,
    ...overrides,
  };
}

async function run(outcome: FetchOutcome): Promise<string> {
  return textOf(await toolWith(outcome).execute({ url: "https://example.com/" }, ctx()));
}

/** 결과에서 boundary 안쪽(모델이 데이터로 읽는 구간)만 꺼낸다 */
function insideMarkers(text: string): string {
  const begin = /^BEGIN (\S+)$/m.exec(text);
  expect(begin).not.toBeNull();
  const id = begin?.[1] ?? "";
  const body = new RegExp(`^BEGIN ${id}$\\n([\\s\\S]*)\\n^END ${id}$`, "m").exec(text);
  return body?.[1] ?? "";
}

/** 결과에서 boundary 바깥(우리가 말한 것)만 남긴다 */
function outsideMarkers(text: string): string {
  return text.split(/^BEGIN \S+$/m)[0] + (text.split(/^END \S+$/m)[1] ?? "");
}

/**
 * 본문 뒤에 붙는 대괄호 고지들(`[...]`)만 꺼낸다. 잘림·인코딩 고지가 쓰는 것과 같은
 * 형태다 — **고지가 존재하는지**를 헤더 문면과 섞이지 않게 보려면 이 분리가 필요하다.
 * 역검증에서 배운 것이 여기 반영돼 있다: 두 결과가 "다르다"만 재면 content-type이
 * 달라서 다른 것도 통과한다.
 */
function notesOf(text: string): string[] {
  return outsideMarkers(text)
    .split("\n")
    .filter((line) => line.startsWith("[") && line.endsWith("]"));
}

const HTML_NAV_ONLY = `<!doctype html><html><head><title>t</title>${"<style>.a{color:red}</style>".repeat(
  200,
)}</head><body><nav>홈 로그인 검색</nav><div id="root"></div>${"<script>var x=1;</script>".repeat(
  200,
)}</body></html>`;

describe("추출 회계 — 받은 분량과 나온 분량 (WEB-ACCESS §3 · §9 A-19)", () => {
  it("HTML이면 추출된 문자 수와 HTML 문자 수가 둘 다 결과에 있다", async () => {
    const html = "<html><body><p>본문 열두 자입니다</p></body></html>";
    const text = await run(ok({ contentType: "text/html", body: html }));
    const extracted = insideMarkers(text);

    // 두 수치가 **각각** 도달해야 한다. 하나만 있으면 비교가 성립하지 않는다.
    expect(outsideMarkers(text)).toContain(String(html.length));
    expect(outsideMarkers(text)).toContain(String(extracted.length));
    expect(extracted.length).toBeLessThan(html.length);
  });

  it("네비게이션만 남는 페이지에서 손실이 수치로 드러난다 — 이 판정의 출발점", async () => {
    // T-012 실측 재현: 큰 HTML에서 극히 적은 텍스트만 나온다. 예전에는 이 결과가
    // 성공한 조회와 구분되지 않았다(ARCHITECTURE §2.6의 최상위 심각도).
    const text = await run(ok({ contentType: "text/html", body: HTML_NAV_ONLY }));
    const extracted = insideMarkers(text);

    expect(extracted.length).toBeLessThan(HTML_NAV_ONLY.length / 20);
    expect(outsideMarkers(text)).toContain(String(HTML_NAV_ONLY.length));
    expect(outsideMarkers(text)).toContain(String(extracted.length));
  });

  it("원인을 추측하지 않는다 — JS·렌더링·가능성 표현이 없다", async () => {
    // 판정의 실질이 여기 있다. 수치는 우리가 아는 사실이고 원인은 모르는 것이다.
    const text = outsideMarkers(await run(ok({ contentType: "text/html", body: HTML_NAV_ONLY })));
    expect(text).not.toMatch(/javascript|\bjs\b|render|browser|dynamic/i);
    expect(text).not.toMatch(/probably|likely|may (need|require)|seems|appears|might/i);
    expect(text).not.toMatch(/자바스크립트|렌더링|아마|~?일 수 있|필요할/);
  });

  it("임계로 분류하지 않는다 — 짧은 페이지와 큰 페이지의 보고 형태가 같다", async () => {
    // "이 정도면 적다"를 우리가 정하면 정상적으로 짧은 페이지에서 틀린다. 그래서
    // 경고를 켜고 끄지 않고 **같은 회계를 항상** 낸다. 두 결과의 차이는 수치뿐이어야 한다.
    const short = outsideMarkers(await run(ok({ contentType: "text/html", body: "<p>짧다</p>" })));
    const long = outsideMarkers(await run(ok({ contentType: "text/html", body: HTML_NAV_ONLY })));

    const shape = (text: string): string => text.replaceAll(/\d+/g, "#");
    expect(shape(short)).toBe(shape(long));
  });

  it("추출하지 않은 타입은 추출했다고 말하지 않는다", async () => {
    // JSON·평문은 그대로 지나간다(§3). 여기에 "extracted from"을 붙이면 일어나지
    // 않은 일을 보고하는 것이다.
    const body = '{"a":1}';
    const text = outsideMarkers(await run(ok({ contentType: "application/json", body })));
    expect(text).toContain(String(body.length));
    expect(text).not.toMatch(/extracted/i);
  });
});

describe("빈 결과의 명시 (WEB-ACCESS §3 · §9 A-18)", () => {
  it("본문이 비면 고지가 하나 붙고, 비지 않으면 붙지 않는다", async () => {
    const empty = await run(ok({ body: "" }));
    const filled = await run(ok({ body: "내용" }));

    expect(insideMarkers(empty)).toBe("");
    // 회계의 `0`만으로는 부족하다는 것이 판정이다 — 고지가 하나 더 있어야 한다.
    expect(notesOf(empty)).toHaveLength(1);
    expect(notesOf(filled)).toHaveLength(0);
  });

  it("빈 본문과 추출 무산을 구분한다 — 모델의 다음 행동이 갈린다", async () => {
    // 전자는 URL이 빈 응답을 준 것, 후자는 이 추출기로 읽히지 않는 문서다.
    const emptyBody = await run(ok({ contentType: "text/plain", body: "" }));
    const nothingExtracted = await run(
      ok({ contentType: "text/html", body: "<script>var a=1;</script>" }),
    );

    expect(insideMarkers(nothingExtracted).trim()).toBe("");
    // **고지끼리** 비교한다. 결과 전체를 비교하면 content-type이 달라서 다른 것도
    // 통과한다(역검증에서 실제로 그랬다).
    const [first] = notesOf(emptyBody);
    const [second] = notesOf(nothingExtracted);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
  });

  it("공백만 있는 본문도 빈 것으로 다룬다", async () => {
    // 모델이 읽을 것이 없다는 점에서 같다. 여기서 갈리면 "보이는 결과"의 기준이
    // 문자 존재 여부가 되어 §2.6의 취지를 놓친다.
    const blank = await run(ok({ body: "   \n\t  " }));
    expect(notesOf(blank)).toHaveLength(1);
    expect(notesOf(blank)).toEqual(notesOf(await run(ok({ body: "" }))));
  });

  it("비어 있어도 이유를 추측하지 않는다", async () => {
    const text = outsideMarkers(await run(ok({ contentType: "text/html", body: HTML_NAV_ONLY })));
    expect(text).not.toMatch(/because|아마|때문일/i);
  });
});

describe("타임아웃 사유의 수치 (WEB-ACCESS §9 A-17)", () => {
  let server: TestHttpsServer;
  let restoreTls: () => void;

  beforeAll(async () => {
    restoreTls = relaxTlsForFixtureCert();
    server = await startTestHttpsServer();
  });

  afterAll(async () => {
    await server.close();
    restoreTls();
  });

  /**
   * 판정 단계에서 시간을 **확실히** 쓰게 만든다. 이것이 없으면 잔여분과 총 예산이
   * 같은 밀리초로 떨어져 테스트가 옛 구현에서도 통과한다 — 역검증이 실제로 그 공허함을
   * 잡아냈다. 실측에서 이 차이를 만든 것도 판정·DNS 시간이었다(1,500 → 1,178).
   */
  function slowVerify(delayMs: number): (url: string) => Promise<UrlVerdict> {
    const inner = loopbackVerifyFor(["a.test"], verifyUrl);
    return async (url) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return inner(url);
    };
  }

  it("사유가 **설정한 총 예산**을 보고한다 — 잔여분이 아니다", async () => {
    server.route("/slow-report", {
      headers: { "content-type": "text/plain" },
      body: "늦게",
      delayMs: 5_000,
    });
    const options: FetchOptions = { verify: slowVerify(250), timeoutMs: 900 };
    const outcome = await fetchUrl(`https://a.test:${server.port}/slow-report`, options);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("성공했다");

    // 사유에 등장하는 밀리초 수치는 전부 설정값이어야 한다. 문면이 바뀌어도
    // "보고되는 수치는 조정 가능한 손잡이의 단위"라는 판정은 지켜져야 한다.
    const millis = [...outcome.reason.matchAll(/(\d+)\s*ms/g)].map((match) => Number(match[1]));
    expect(millis.length).toBeGreaterThan(0);
    expect(millis).toEqual(millis.map(() => 900));
  });
});
