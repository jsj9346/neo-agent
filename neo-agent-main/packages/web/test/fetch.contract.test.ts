/**
 * 피닝 연결·홉 루프·유계 `fetchUrl` — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처: `docs/WEB-ACCESS.md` §3(정직한 UA·쿠키/인증/리퍼러 없음·유계·
 * content-type 분기)·§4 5~7단계(피닝, Host/SNI 보존, 홉마다 1단계부터 재실행, 유계).
 *
 * ─── 주입점 요청 `[미규정 A-2]` ────────────────────────────────────────────────
 * §4의 차단 대역은 루프백을 포함하므로 **로컬 테스트 서버는 설계상 도달 불가능한
 * 주소에 있다.** 외부 도메인에 의존하지 않고 5~7단계를 검증하려면 판정 결과를
 * 주입하는 지점이 정확히 하나 필요하다:
 *
 *   FetchOptions.verify?: (url: string) => Promise<UrlVerdict>   // 기본값 = verifyUrl
 *
 * **완화 설정이 아니다.** 사용자 설정 키가 아니라 함수 인자이며, 프로덕션 배선에서는
 * 채우지 않는다 — `WEB-ACCESS.md` §7이 `AnthropicClientConfig.fetch`에 대해 내린
 * 판단("프로덕션에서 채우지 않는다")과 같은 성격이고, 스케치의
 * `createWebFetchTool({ fetch })`가 이미 같은 종류의 주입점이다.
 * 아래 테스트는 이 주입을 **테스트 호스트명에만** 걸고 나머지는 실제 `verifyUrl`로
 * 넘긴다 — 그래야 리다이렉트 재판정이 진짜로 돌아간다.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * 이 파일은 **피닝 누락을 자동으로 잡는다**: 서버 이름이 `a.test`(RFC 6761 예약 TLD)라
 * 실제 DNS로는 해석되지 않으므로, 구현이 `lookup` 훅으로 검증 IP를 넘기지 않으면
 * 연결 자체가 실패한다.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
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

let server: TestHttpsServer;
let restoreTls: () => void;

/** 판정 호출을 세는 래퍼 — "홉마다 1단계부터 재실행"(§4 6단계)의 관측 수단 */
function countingVerify(): {
  urls: string[];
  verify: (url: string) => Promise<UrlVerdict>;
} {
  const urls: string[] = [];
  const inner = loopbackVerifyFor(["a.test", "b.test"], verifyUrl);
  return {
    urls,
    async verify(url) {
      urls.push(url);
      return inner(url);
    },
  };
}

function base(path: string): string {
  return `https://a.test:${server.port}${path}`;
}

function opts(extra: FetchOptions = {}): FetchOptions {
  // `as` 캐스트를 쓰지 않는다 — `verify`가 `FetchOptions`에 없으면 **여기서 `tsc`가
  // 잡아야** 주입점 요청(A-2)이 명세로 작동한다.
  return { verify: loopbackVerifyFor(["a.test", "b.test"], verifyUrl), ...extra };
}

/** 판정만 갈아끼운 옵션 — 같은 이유로 캐스트 없이 리터럴로 만든다 */
function optsWithVerify(verify: (url: string) => Promise<UrlVerdict>): FetchOptions {
  return { verify };
}

function expectOk(outcome: FetchOutcome): Extract<FetchOutcome, { ok: true }> {
  if (!outcome.ok) throw new Error(`실패했다: ${outcome.reason}`);
  return outcome;
}

function expectFailed(outcome: FetchOutcome): string {
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error("성공했다");
  expect(outcome.reason.trim().length).toBeGreaterThan(0);
  return outcome.reason;
}

beforeAll(async () => {
  restoreTls = relaxTlsForFixtureCert();
  server = await startTestHttpsServer();
});

afterAll(async () => {
  await server.close();
  restoreTls();
});

// 라우트는 각 테스트가 자기 경로를 쓰므로 서버 인스턴스는 파일 전체에서 유지한다.

describe("요청 신원 (WEB-ACCESS §3)", () => {
  it("User-Agent가 `neo-agent/<version>`이고 다른 제품을 사칭하지 않는다", async () => {
    // 컴플라이언스(ARCHITECTURE §2.2)가 모델 프로바이더 밖으로 처음 확장되는 지점이다.
    // 레퍼런스 두 곳이 전부 UA 위조로 ToS를 위반한 자리이므로 여기서 못박는다.
    server.route("/ua", { body: "ok", headers: { "content-type": "text/plain" } });
    expectOk(await fetchUrl(base("/ua"), opts()));

    const recorded = server.requests.find((entry) => entry.path === "/ua");
    const ua = String(recorded?.headers["user-agent"] ?? "");
    expect(ua).toMatch(/^neo-agent\/\S+$/);
    expect(ua).not.toMatch(/claude|anthropic|chrome|mozilla|safari|curl|python|vscode|codex/i);
  });

  it("쿠키·Authorization·Referer를 보내지 않는다 — 혼동된 대리인 문제의 제거", async () => {
    server.route("/headers", { body: "ok", headers: { "content-type": "text/plain" } });
    expectOk(await fetchUrl(base("/headers"), opts()));

    const recorded = server.requests.find((entry) => entry.path === "/headers");
    expect(recorded).toBeDefined();
    for (const forbidden of ["cookie", "authorization", "proxy-authorization", "referer"]) {
      expect(recorded?.headers[forbidden], `${forbidden}가 실렸다`).toBeUndefined();
    }
  });
});

describe("5단계 — 피닝 연결 (WEB-ACCESS §4)", () => {
  it("Host 헤더가 원 호스트명이다 — 연결은 IP로, 신원은 이름으로", async () => {
    server.route("/host", { body: "ok", headers: { "content-type": "text/plain" } });
    expectOk(await fetchUrl(base("/host"), opts()));

    const recorded = server.requests.find((entry) => entry.path === "/host");
    const host = String(recorded?.headers.host ?? "");
    expect(host.startsWith("a.test")).toBe(true);
    // IP를 Host에 실으면 가상 호스팅된 대상이 다른 사이트를 준다 — 조용한 오조회다
    expect(host).not.toContain("127.0.0.1");
  });

  it("SNI(servername)가 원 호스트명이다", async () => {
    server.route("/sni", { body: "ok", headers: { "content-type": "text/plain" } });
    expectOk(await fetchUrl(base("/sni"), opts()));
    expect(server.requests.find((entry) => entry.path === "/sni")?.servername).toBe("a.test");
  });

  it("판정이 거부하면 연결 자체가 일어나지 않는다", async () => {
    // 주입된 판정기가 실제 `verifyUrl`에 위임하는 호스트(=사설 IP 리터럴)로 요청한다.
    const before = server.requests.length;
    expectFailed(await fetchUrl("https://127.0.0.1:1/x", opts()));
    expect(server.requests.length).toBe(before);
  });

  it("검증 통과 주소가 하나도 없으면 실패한다 — 전원 탈락은 연결 없음", async () => {
    const allBlocked = optsWithVerify(async () => ({ ok: false, reason: "전부 차단 대역" }));
    const before = server.requests.length;
    expectFailed(await fetchUrl(base("/never"), allBlocked));
    expect(server.requests.length).toBe(before);
  });

  it("판정이 통과시킨 주소로만 연결한다 — 빈 배열은 연결이 아니라 실패다", async () => {
    // [미규정 A-7] `{ ok: true, addresses: [] }`는 타입상 가능하지만 문서가 다루지 않는다.
    // 어느 판정으로 가든 **연결이 일어나서는 안 된다**는 결과만 고정한다.
    const emptyPass = optsWithVerify(async () => ({ ok: true, addresses: [] }));
    const before = server.requests.length;
    expectFailed(await fetchUrl(base("/never-2"), emptyPass));
    expect(server.requests.length).toBe(before);
  });
});

describe("6단계 — 리다이렉트는 홉마다 1단계부터 재실행 (WEB-ACCESS §4)", () => {
  it("공개 호스트 → 사설 IP 리다이렉트가 차단된다 (대표 시나리오)", async () => {
    // 이 플랜에서 가장 중요한 한 건이다. 최초 URL만 판정하고 리다이렉트를 따라가는
    // 구현은 **공개 도메인 하나로 내부망 전체가 열린다.**
    server.route("/to-private", {
      status: 302,
      headers: { location: "https://169.254.169.254/latest/meta-data/" },
    });
    const counter = countingVerify();
    const outcome = await fetchUrl(base("/to-private"), optsWithVerify(counter.verify));
    expectFailed(outcome);
    // 홉마다 판정이 다시 돌았다는 증거: 리다이렉트 목적지도 판정 대상이 됐다
    expect(counter.urls.some((url) => url.includes("169.254.169.254"))).toBe(true);
  });

  it("사설 대역으로의 리다이렉트는 루프백·10/8·192.168/16 어디든 차단된다", async () => {
    const targets = ["https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.0.9/x"];
    for (const [index, target] of targets.entries()) {
      const path = `/to-private-${index}`;
      server.route(path, { status: 302, headers: { location: target } });
      expectFailed(await fetchUrl(base(path), opts()));
    }
  });

  it("공개 대상으로의 리다이렉트는 따라간다 — 홉이 하나 늘어난다", async () => {
    server.route("/direct", { body: "final", headers: { "content-type": "text/plain" } });
    server.route("/redirect-once", {
      status: 302,
      headers: { location: `https://a.test:${server.port}/direct` },
    });

    const straight = expectOk(await fetchUrl(base("/direct"), opts()));
    const redirected = expectOk(await fetchUrl(base("/redirect-once"), opts()));

    expect(redirected.body).toContain("final");
    // [미규정 A-8] `hops`의 기준점(첫 요청 포함 여부)이 미규정이다. **차이가 1**이라는
    // 결과만 고정한다 — 어느 기준을 택해도 성립한다.
    expect(redirected.hops - straight.hops).toBe(1);
    // 최종 URL은 리다이렉트 목적지다 — 모델이 실제로 무엇을 읽었는지 알아야 한다
    expect(redirected.url).toContain("/direct");
  });

  it("홉 상한을 넘기면 실패한다", async () => {
    for (let index = 0; index < 8; index += 1) {
      server.route(`/chain/${index}`, {
        status: 302,
        headers: { location: `https://a.test:${server.port}/chain/${index + 1}` },
      });
    }
    expectFailed(await fetchUrl(base("/chain/0"), opts({ maxRedirects: 2 })));
  });

  it("옵션 없이도 홉 상한이 있다 — 기본값 존재가 계약이다 (§8: 수치가 아니라 유계)", async () => {
    // 무한 리다이렉트 루프. 기본 상한이 없으면 이 테스트가 끝나지 않는다(= 실패로 보인다).
    server.route("/loop", {
      status: 302,
      headers: { location: `https://a.test:${server.port}/loop` },
    });
    expectFailed(await fetchUrl(base("/loop"), opts()));
  });
});

describe("7단계 — 응답 유계 (WEB-ACCESS §3)", () => {
  it("크기 상한을 넘기면 끊고 잘림을 표시한다", async () => {
    server.route("/big", {
      headers: { "content-type": "text/plain" },
      body: "0123456789abcdef",
      repeatToBytes: 512 * 1024,
    });
    const outcome = expectOk(await fetchUrl(base("/big"), opts({ maxBytes: 4096 })));
    expect(outcome.truncated).toBe(true);
    // 상한의 의미가 raw 바이트인지 추출 후 텍스트인지는 미규정이므로 넉넉한 상한으로
    // "끊겼다"만 본다 `[미규정 A-9]`
    expect(outcome.body.length).toBeLessThan(512 * 1024);
  });

  it("상한 안의 응답은 잘리지 않는다", async () => {
    server.route("/small", { headers: { "content-type": "text/plain" }, body: "짧은 본문" });
    const outcome = expectOk(await fetchUrl(base("/small"), opts({ maxBytes: 64 * 1024 })));
    expect(outcome.truncated).toBe(false);
    expect(outcome.body).toContain("짧은 본문");
  });

  it("시간 상한을 넘기면 끊는다 — 무한 대기는 silent hang이다", async () => {
    server.route("/slow", {
      headers: { "content-type": "text/plain" },
      body: "늦게",
      delayMs: 5_000,
    });
    const started = Date.now();
    expectFailed(await fetchUrl(base("/slow"), opts({ timeoutMs: 300 })));
    // 상한이 실제로 끊었는지 — 값만 돌려주고 소켓이 살아 있으면 상한이 무의미하다
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("abort 시그널을 존중한다 (CORE-INTERFACE §6의 존중 의무 전파)", async () => {
    server.route("/abort", {
      headers: { "content-type": "text/plain" },
      body: "x",
      delayMs: 5_000,
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const started = Date.now();
    // [미규정 A-10] abort의 표현이 `{ ok:false }`인지 throw(AbortError)인지 미규정이다.
    // 어느 쪽이든 **빠르게 돌아온다**는 결과만 고정한다.
    try {
      const outcome = await fetchUrl(base("/abort"), opts({ signal: controller.signal }));
      expect(outcome.ok).toBe(false);
    } catch {
      /* throw도 허용되는 판정이다 */
    }
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});

describe("콘텐츠 타입 분기 (WEB-ACCESS §3)", () => {
  it("text/* 와 application/json은 통과한다", async () => {
    const cases: readonly (readonly [string, string, string, string])[] = [
      ["/ct-plain", "text/plain; charset=utf-8", "text/plain", "평문 본문"],
      ["/ct-md", "text/markdown", "text/markdown", "# 제목"],
      ["/ct-json", "application/json", "application/json", '{"key":"value"}'],
      ["/ct-json-charset", "application/json; charset=utf-8", "application/json", '{"a":1}'],
    ];
    for (const [path, contentType, bare, body] of cases) {
      server.route(path, { headers: { "content-type": contentType }, body });
      const outcome = expectOk(await fetchUrl(base(path), opts()));
      expect(outcome.contentType.toLowerCase(), path).toContain(bare);
      expect(outcome.body, path).toContain(body);
    }
  });

  it("그 외 타입은 거부하고 **받은 content-type을 사유에 명시**한다", async () => {
    // 모델이 다른 URL을 시도할 수 있어야 한다 — 사유에 타입이 없으면 재시도가 눈먼다
    const cases: readonly (readonly [string, string])[] = [
      ["/ct-png", "image/png"],
      ["/ct-pdf", "application/pdf"],
      ["/ct-bin", "application/octet-stream"],
      ["/ct-zip", "application/zip"],
    ];
    for (const [path, contentType] of cases) {
      server.route(path, { headers: { "content-type": contentType }, body: "binary-ish" });
      const reason = expectFailed(await fetchUrl(base(path), opts()));
      expect(reason, `${path}의 사유에 타입이 없다`).toContain(contentType);
    }
  });

  it("text/html은 통과한다 — 추출 여부와 무관하게 거부 대상이 아니다", async () => {
    server.route("/ct-html", {
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "<html><body><p>본문</p></body></html>",
    });
    const outcome = expectOk(await fetchUrl(base("/ct-html"), opts()));
    expect(outcome.contentType.toLowerCase()).toContain("text/html");
  });
});

describe("시그니처 (WEB-ACCESS §3·§8)", () => {
  it("옵션은 선택적이다 — 기본 상한 3종이 존재한다는 것이 계약", () => {
    // 런타임 호출 없이 타입만 본다(네트워크 의존 금지). 옵션이 필수가 되면
    // "기본값 존재"라는 §8의 계약이 성립하지 않는다.
    const assignable: (url: string) => Promise<FetchOutcome> = fetchUrl;
    expect(typeof assignable).toBe("function");
  });
});
