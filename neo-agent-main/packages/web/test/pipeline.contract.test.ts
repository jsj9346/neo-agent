/**
 * 전송 + 도구를 이어 붙인 종단 계약 — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처: `docs/WEB-ACCESS.md` §3(콘텐츠 타입 분기·HTML 추출·유계 표시)·
 * §4(홉별 재판정)·§5(`source: "network"`·무작위 boundary).
 *
 * **왜 이 파일이 따로 있는가.** 계약이 정하지 않은 것 하나가 계층 단위 테스트를
 * 무디게 만든다 — `[미규정 A-6] HTML 텍스트 추출이 `fetchUrl` 안에서 일어나는지
 * 도구에서 일어나는지가 문서에 없다.* `fetch.contract.test.ts`는 스텁 도구를 안 쓰고,
 * `web-fetch.contract.test.ts`는 스텁 전송을 쓰므로 **어느 쪽도 "스크립트가 모델에게
 * 도달하지 않는다"를 판정 중립으로 확인할 수 없다.** 여기서는 진짜 `fetchUrl`과 진짜
 * 도구를 이어 붙여, 추출이 어느 층에 있든 **결과로** 판정한다.
 *
 * 주입은 `[미규정 A-2]`의 `FetchOptions.verify` 하나뿐이며 이유는
 * `fetch.contract.test.ts` 머리에 적었다(루프백은 설계상 차단 대역이다).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type { ToolExecutionContext, ToolResult } from "@neo-agent/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createWebFetchTool,
  type FetchOptions,
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

let server: TestHttpsServer;
let restoreTls: () => void;

function ctx(): ToolExecutionContext {
  return { toolCallId: "call-1", signal: new AbortController().signal };
}

function textOf(result: ToolResult): string {
  return result.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/** 실 `fetchUrl` + 실 도구. 판정만 테스트 호스트명에 대해 루프백으로 고정한다 */
function wiredTool(extra: FetchOptions = {}): ReturnType<typeof createWebFetchTool> {
  const verify: (url: string) => Promise<UrlVerdict> = loopbackVerifyFor(["a.test"], verifyUrl);
  return createWebFetchTool({
    fetch: (url, options) => fetchUrl(url, { ...options, ...extra, verify }),
  });
}

function base(path: string): string {
  return `https://a.test:${server.port}${path}`;
}

async function runOrCatch(
  tool: ReturnType<typeof createWebFetchTool>,
  url: string,
): Promise<{ text: string; result: ToolResult | undefined }> {
  // 실패 표현(throw vs 에러 결과)은 미규정이다 `[미규정 A-14]` — 둘 다 받는다
  try {
    const result = await tool.execute({ url }, ctx());
    return { text: textOf(result), result };
  } catch (error) {
    return { text: error instanceof Error ? error.message : String(error), result: undefined };
  }
}

beforeAll(async () => {
  restoreTls = relaxTlsForFixtureCert();
  server = await startTestHttpsServer();
});

afterAll(async () => {
  await server.close();
  restoreTls();
});

describe("HTML 페이지 종단 (WEB-ACCESS §3)", () => {
  it("스크립트·스타일·주석이 모델에게 도달하지 않고 본문은 도달한다", async () => {
    // 추출이 `fetchUrl`에 있든 도구에 있든 이 결과는 같아야 한다 — 그것이
    // 이 테스트를 A-6 판정에 중립으로 만든다.
    server.route("/page", {
      headers: { "content-type": "text/html; charset=utf-8" },
      body: [
        "<html><head><title>제목</title>",
        `<style>.x{content:"LEAKED_CSS"}</style>`,
        `<script>var a="LEAKED_JS";</script>`,
        "</head><body><!-- LEAKED_COMMENT -->",
        "<h1>기사 제목</h1><p>기사 본문입니다.</p></body></html>",
      ].join(""),
    });

    const { text } = await runOrCatch(wiredTool(), base("/page"));
    expect(text).toContain("기사 제목");
    expect(text).toContain("기사 본문입니다");
    expect(text).not.toContain("LEAKED_JS");
    expect(text).not.toContain("LEAKED_CSS");
    expect(text).not.toContain("LEAKED_COMMENT");
    expect(text).not.toMatch(/<\/?(script|style|p|h1|html|body)\b/i);
  });

  it('결과가 `source: "network"`로 표시된다 — 오염 정책이 발동할 유일한 근거', async () => {
    server.route("/net", { headers: { "content-type": "text/plain" }, body: "평문" });
    const { result } = await runOrCatch(wiredTool(), base("/net"));
    expect(result?.source).toBe("network");
  });

  it("본문이 무작위 boundary로 감싸인 채 도착한다", async () => {
    server.route("/wrap", { headers: { "content-type": "text/plain" }, body: "감쌀 본문" });
    const first = await runOrCatch(wiredTool(), base("/wrap"));
    const second = await runOrCatch(wiredTool(), base("/wrap"));
    expect(first.text).toContain("감쌀 본문");
    expect(first.text).not.toBe(second.text);
  });
});

describe("거부가 모델에게 도달한다 (WEB-ACCESS §3·§4)", () => {
  it("사설 IP로의 리다이렉트가 차단되고 사유가 결과에 보인다", async () => {
    server.route("/redirect-private", {
      status: 302,
      headers: { location: "https://169.254.169.254/latest/meta-data/" },
    });
    const { text } = await runOrCatch(wiredTool(), base("/redirect-private"));
    expect(text.trim().length).toBeGreaterThan(0);
    // 침묵 거부 금지 — 모델이 왜 못 읽었는지 알아야 다른 URL을 시도한다
    expect(text).not.toContain("기사");
  });

  it("바이너리 타입 거부의 사유에 받은 content-type이 실린다", async () => {
    server.route("/binary", { headers: { "content-type": "image/png" }, body: "PNGDATA" });
    const { text } = await runOrCatch(wiredTool(), base("/binary"));
    expect(text).toContain("image/png");
    expect(text).not.toContain("PNGDATA");
  });

  it("스킴 위반은 연결 없이 거부된다", async () => {
    const before = server.requests.length;
    const { text } = await runOrCatch(wiredTool(), `http://a.test:${server.port}/page`);
    expect(text.trim().length).toBeGreaterThan(0);
    expect(server.requests.length).toBe(before);
  });
});

describe("유계가 종단까지 전달된다 (WEB-ACCESS §3)", () => {
  it("잘린 응답의 결과 텍스트가 잘리지 않은 것과 다르다", async () => {
    server.route("/long", {
      headers: { "content-type": "text/plain" },
      body: "가나다라마바사아자차",
      repeatToBytes: 256 * 1024,
    });
    const full = await runOrCatch(wiredTool({ maxBytes: 512 * 1024 }), base("/long"));
    const cut = await runOrCatch(wiredTool({ maxBytes: 2048 }), base("/long"));
    expect(cut.text).not.toBe(full.text);
    expect(cut.text.length).toBeLessThan(full.text.length);
  });

  it("잘렸다는 사실을 알리되 이어 읽는 방법은 알리지 않는다", async () => {
    server.route("/long2", {
      headers: { "content-type": "text/plain" },
      body: "abcdefghij",
      repeatToBytes: 256 * 1024,
    });
    const { text } = await runOrCatch(wiredTool({ maxBytes: 2048 }), base("/long2"));
    expect(text).not.toMatch(/offset/i);
    expect(text).not.toMatch(/이어\s*읽|계속\s*읽|재호출|다시\s*호출/);
  });
});
