/**
 * SSRF 판정 `verifyUrl` — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처: `docs/WEB-ACCESS.md` §3(https 전용·userinfo 거부)·§4(판정 1~4단계,
 * **순서가 계약**·완화 설정 부재).
 *
 * ─── 주입점 요청 `[미규정 A-1]` ────────────────────────────────────────────────
 * 스케치의 `verifyUrl(url: string): Promise<UrlVerdict>`에는 **DNS를 결정론적으로
 * 만들 수단이 없다.** 외부 도메인에 의존하면 계약 테스트가 네트워크 상태로 깜빡이고,
 * 그 순간 게이트가 신뢰를 잃는다(플랜 T-002 지침).
 *
 * 이 파일은 두 번째 인자를 다음 모양으로 가정하고 쓴다:
 *
 *   verifyUrl(url: string, deps?: { resolveHostname?(hostname: string): Promise<string[]> })
 *
 * **이것은 완화 경로가 아니다.** 주입된 해석기가 무엇을 돌려주든 4단계(대역 대조)는
 * 그대로 돌고, 사설 대역은 여전히 버려진다 — 아래 "전부 차단이면 거부" 테스트가
 * 그 사실 자체를 고정한다. §4가 금지한 것은 `allow_private_urls` 류의 **설정 표면**이다.
 * 이름·모양은 시그니처 세부이므로 구현자가 바꿔도 되지만, **DNS 스텁 수단 자체는
 * 반드시 있어야 한다**(없으면 3~4단계가 영영 검증 불가).
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, it } from "vitest";
import { type UrlVerdict, verifyUrl } from "../src/index.ts";

/** 호출 기록을 남기는 DNS 스텁 — "IP 리터럴이면 DNS를 건너뛴다"(2단계)의 관측 수단이다 */
function resolverStub(table: Readonly<Record<string, readonly string[]>>): {
  calls: string[];
  resolveHostname: (hostname: string) => Promise<string[]>;
} {
  const calls: string[] = [];
  return {
    calls,
    async resolveHostname(hostname) {
      calls.push(hostname);
      const found = table[hostname];
      if (found === undefined) throw new Error(`스텁에 없는 호스트: ${hostname}`);
      return [...found];
    },
  };
}

function expectRejected(verdict: UrlVerdict): string {
  expect(verdict.ok).toBe(false);
  if (verdict.ok) throw new Error("통과했다");
  // 침묵 거부 금지(§4) — 사유는 모델이 읽고 다음 행동을 정정하는 데 쓰인다
  expect(verdict.reason.trim().length).toBeGreaterThan(0);
  return verdict.reason;
}

function expectPassed(verdict: UrlVerdict): readonly string[] {
  if (!verdict.ok) throw new Error(`거부됐다: ${verdict.reason}`);
  return verdict.addresses;
}

describe("1단계 — 스킴 (WEB-ACCESS §3·§4)", () => {
  const rejected = [
    "http://example.com/",
    "file:///etc/passwd",
    "ftp://example.com/x",
    "data:text/html,<b>hi</b>",
    "ws://example.com/socket",
    "wss://example.com/socket",
    "javascript:alert(1)",
    "gopher://example.com/",
  ];

  it.each(rejected)("%s 를 거부한다 — https만 허용이 계약", async (url) => {
    const dns = resolverStub({});
    expectRejected(await verifyUrl(url, { resolveHostname: dns.resolveHostname }));
    // 스킴 검사가 1단계이므로 DNS까지 가지 않는다. 순서가 뒤집히면 거부되는 URL로도
    // 이름 해석 트래픽이 나가고, 그것 자체가 정보 유출이다.
    expect(dns.calls).toEqual([]);
  });

  it("https는 통과한다", async () => {
    const dns = resolverStub({ "example.com": ["93.184.216.34"] });
    expect(expectPassed(await verifyUrl("https://example.com/", dns))).toEqual(["93.184.216.34"]);
  });

  it("URL로 파싱되지 않는 입력을 거부한다", async () => {
    for (const bad of ["", "not a url", "://example.com", "https://"]) {
      expectRejected(await verifyUrl(bad));
    }
  });
});

describe("1단계 — userinfo (WEB-ACCESS §3)", () => {
  // 자격증명 유출 경로인 동시에 **파서마다 호스트 해석이 갈리는 고전적 우회의 입구**다.
  // 판정기와 연결기가 호스트를 다르게 읽으면 §4 전체가 무의미해진다.
  const rejected = [
    "https://user:pass@example.com/",
    "https://user@example.com/",
    "https://trusted.com@evil.com/",
    "https://example.com%2f@evil.com/",
    "https://:pass@example.com/",
  ];

  it.each(rejected)("%s 를 거부한다", async (url) => {
    const dns = resolverStub({});
    expectRejected(await verifyUrl(url, { resolveHostname: dns.resolveHostname }));
    expect(dns.calls).toEqual([]);
  });

  it("`trusted.com@evil.com`의 실제 호스트는 evil.com이다 — 우회가 성립하지 않음을 못박는다", async () => {
    // 이 URL이 통과하면 게이트의 allowlist 학습 키(`webFetch:https://trusted.com:443`)와
    // 실제 접속처가 갈린다. 거부가 유일하게 안전한 결과다.
    const dns = resolverStub({ "trusted.com": ["93.184.216.34"], "evil.com": ["93.184.216.34"] });
    expectRejected(
      await verifyUrl("https://trusted.com@evil.com/", { resolveHostname: dns.resolveHostname }),
    );
  });
});

describe("2단계 — IP 리터럴은 DNS를 건너뛴다 (WEB-ACCESS §4)", () => {
  it("사설·루프백 IP 리터럴을 거부하고 DNS를 부르지 않는다", async () => {
    const cases = [
      "https://127.0.0.1/",
      "https://[::1]/",
      "https://10.0.0.1/",
      "https://192.168.1.1/",
      "https://169.254.169.254/latest/meta-data/",
      "https://[fe80::1]/",
      "https://[::ffff:169.254.169.254]/",
      "https://0.0.0.0/",
    ];
    for (const url of cases) {
      const dns = resolverStub({});
      expectRejected(await verifyUrl(url, { resolveHostname: dns.resolveHostname }));
      expect(dns.calls, `${url}에서 DNS를 불렀다`).toEqual([]);
    }
  });

  it("공개 IP 리터럴은 그 주소 그대로 통과한다", async () => {
    const dns = resolverStub({});
    const addresses = expectPassed(
      await verifyUrl("https://8.8.8.8/", { resolveHostname: dns.resolveHostname }),
    );
    expect(addresses).toEqual(["8.8.8.8"]);
    expect(dns.calls).toEqual([]);
  });

  it("포트가 붙어도 판정은 같다 — 포트는 대역 판정의 대상이 아니다", async () => {
    expectRejected(await verifyUrl("https://127.0.0.1:8443/"));
    expectPassed(await verifyUrl("https://8.8.8.8:8443/"));
  });
});

describe("3~4단계 — DNS 해석과 대역 대조 (WEB-ACCESS §4)", () => {
  it("A/AAAA 전부를 대조해 **통과분만** 남긴다 — 첫 주소만 보는 구현을 잡는다", async () => {
    // 2026-08-08 실측이 발견한 함정: `lookup` 훅은 배열 전체를 요구한다. 4단계가
    // "모든 주소"이고 5단계가 "통과분만 돌려준다"인 이유가 이것이다. 첫 주소만
    // 검증하고 배열을 그대로 넘기면 **검증되지 않은 IP로 연결된다.**
    const dns = resolverStub({
      "mixed.example": [
        "93.184.216.34",
        "10.0.0.7",
        "2606:4700:4700::1111",
        "::1",
        "169.254.169.254",
      ],
    });
    const addresses = expectPassed(await verifyUrl("https://mixed.example/", dns));
    // 순서·중복 처리는 미규정이므로 집합으로 비교한다 `[미규정 A-4]`
    expect(new Set(addresses)).toEqual(new Set(["93.184.216.34", "2606:4700:4700::1111"]));
    expect(addresses).not.toContain("10.0.0.7");
    expect(addresses).not.toContain("::1");
    expect(addresses).not.toContain("169.254.169.254");
  });

  it("차단 대역이 앞에 와도 뒤의 공개 주소를 잃지 않는다", async () => {
    const dns = resolverStub({ "front.example": ["10.0.0.1", "93.184.216.34"] });
    expect(new Set(expectPassed(await verifyUrl("https://front.example/", dns)))).toEqual(
      new Set(["93.184.216.34"]),
    );
  });

  it("전부 차단 대역이면 거부한다", async () => {
    const dns = resolverStub({ "internal.example": ["10.0.0.1", "192.168.1.1", "::1"] });
    expectRejected(await verifyUrl("https://internal.example/", dns));
  });

  it("DNS 리바인딩 후보(공개 1 + 사설 1)에서 사설이 살아남지 않는다", async () => {
    const dns = resolverStub({ "rebind.example": ["93.184.216.34", "127.0.0.1"] });
    const addresses = expectPassed(await verifyUrl("https://rebind.example/", dns));
    expect(addresses).not.toContain("127.0.0.1");
  });

  it("해석 결과가 비면 거부한다", async () => {
    const dns = resolverStub({ "empty.example": [] });
    expectRejected(await verifyUrl("https://empty.example/", dns));
  });

  it("DNS 해석 실패는 사유가 있는 거부다 — throw가 아니다", async () => {
    // [미규정 A-5] 해석 실패의 표현이 `{ ok:false }`인지 throw인지 문서에 없다.
    // `UrlVerdict`가 "모델에게 보이는 사유"를 담는 형태이므로 값 반환이 계약에
    // 부합하지만, 어느 판정으로 가든 **사유 문자열이 관측된다**는 결과만 고정한다.
    const dns = resolverStub({});
    let reason = "";
    try {
      const verdict = await verifyUrl("https://nonexistent.example/", dns);
      reason = verdict.ok ? "" : verdict.reason;
      expect(verdict.ok).toBe(false);
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    expect(reason.trim().length).toBeGreaterThan(0);
  });
});

describe("거부 사유는 원인을 구분한다 (WEB-ACCESS §4 — 침묵 거부 없음)", () => {
  it("스킴·userinfo·대역 거부의 사유가 서로 다르다", async () => {
    // "사유가 존재한다"만 보면 전부 `"거부됨"` 한 문자열이어도 통과한다. 모델이
    // 다음 행동을 정정하려면 원인이 구분돼야 하므로 **서로 다름**을 본다.
    const scheme = expectRejected(await verifyUrl("http://example.com/"));
    const userinfo = expectRejected(await verifyUrl("https://user@example.com/"));
    const range = expectRejected(await verifyUrl("https://127.0.0.1/"));
    expect(new Set([scheme, userinfo, range]).size).toBe(3);
  });
});

describe("완화 경로 부재 (WEB-ACCESS §4 — 설정 표면이 없으면 약화 경로도 없다)", () => {
  it("사설 대역을 허용하는 옵션이 타입 수준에서 존재하지 않는다", async () => {
    // @ts-expect-error — 이런 이름의 옵션은 만들어지지 않는다. 두 번째 인자가
    // 아예 없어도, 있어도(A-1의 DNS 스텁), 이 줄은 컴파일 에러여야 한다.
    await verifyUrl("https://127.0.0.1/", { allowPrivateAddresses: true });
    // @ts-expect-error — hermes `security.allow_private_urls`의 이식을 명시적으로 막는다
    await verifyUrl("https://127.0.0.1/", { allowPrivateUrls: true });
    // @ts-expect-error — 판정 자체를 끄는 문도 없다
    await verifyUrl("https://127.0.0.1/", { skipSsrf: true });
  });

  it("옵션이 무엇이 오든 루프백 판정이 뒤집히지 않는다 — 런타임 확인", async () => {
    // 타입 수준 고정(@ts-expect-error)은 `tsc`를 돌릴 때만 의미가 있다. 런타임에서도
    // 미지의 옵션이 판정을 흔들지 않는지 결과로 확인한다.
    const sneaky = {
      allowPrivateAddresses: true,
      allowPrivateUrls: true,
      skipSsrf: true,
      allowLocalhost: true,
    } as never;
    expectRejected(await verifyUrl("https://127.0.0.1/", sneaky));
    expectRejected(await verifyUrl("https://169.254.169.254/", sneaky));
  });
});
