/**
 * `webFetch` 분류 계약 — `docs/APPROVAL-GATE.md` §3·§4 + `docs/WEB-ACCESS.md` §6.
 *
 * 정본 문면:
 *   - APPROVAL-GATE §3 — "게이트의 URL 파싱은 학습 키 산출을 위한 것이지 보안
 *     판정이 아니다. … 게이트는 전역 `URL`로 파싱해 `origin`을 뽑을 뿐이고,
 *     **파싱 실패는 `unknown`(fail-closed)으로 떨어진다.**"
 *   - APPROVAL-GATE §3 — "**정책 매트릭스(계층 5)는 무변경이다** — `webFetch`는
 *     자동 허용 대상이 아니고, 학습은 계층 6에서만 일어난다. 최초 호스트는 항상
 *     프롬프트다." / "`webFetch`의 `scope` 판정은 없다."
 *   - APPROVAL-GATE §4 — "`webFetch`의 `allowAlwaysKey`는 `webFetch:<origin>`이다.
 *     `origin`은 스킴+호스트+포트이고 기본 포트는 정규화된다 … **경로·쿼리는 키에
 *     들어가지 않는다** … **도메인 접미사로 넓히지 않는다.**"
 *   - WEB-ACCESS §6 — 표: 최초 호스트 → 승인 / 학습된 호스트, 오염 없음 → 자동 허용.
 *
 * 구현 전 작성(T-004). 판정 계층이 보이는 `evaluate` 경로(`runWeb`)를 쓴다 —
 * 기존 계약 테스트의 관례 그대로다.
 */

import { describe, expect, it } from "vitest";
import { makePermissiveAllowlist, makeSeededAllowlist } from "./contract-helpers.ts";
import { makeAllowlist, makePrompt, ZERO_WIDTH_SPACE } from "./helpers.ts";
import {
  keyFor,
  makeExplodingClassifier,
  runWeb,
  subjectOf,
  WEB_FETCH_PROFILE,
} from "./web-taint-helpers.ts";

/** 프롬프트에 실린 판정 대상 — 분류 결과의 유일한 관측 지점 */
async function subjectFor(url: unknown): Promise<Record<string, unknown>> {
  const prompt = makePrompt({ response: "allow-once" });
  await runWeb({ prompt }, "web_fetch", { url });
  return subjectOf(prompt.last) as unknown as Record<string, unknown>;
}

describe("프로필 등록 시 판정 대상은 webFetch다 (APPROVAL-GATE §3)", () => {
  it("프로필 테이블의 `urlParam`으로 URL을 읽어 kind/url/origin을 채운다", async () => {
    expect(WEB_FETCH_PROFILE).toMatchObject({ kind: "webFetch", urlParam: "url" });

    const subject = await subjectFor("https://example.com/a?x=1");
    expect(subject["kind"]).toBe("webFetch");
    expect(subject["url"]).toBe("https://example.com/a?x=1");
    expect(String(subject["origin"])).toContain("example.com");
  });

  it("origin에는 경로·쿼리가 들어가지 않는다 — URL 전체가 아니다", async () => {
    const subject = await subjectFor("https://example.com/deep/path?q=v#frag");
    expect(subject["kind"]).toBe("webFetch");
    const origin = String(subject["origin"]);
    expect(origin).not.toContain("/deep");
    expect(origin).not.toContain("q=v");
    expect(origin).not.toContain("#frag");
  });

  it("scope 판정이 없다 — 경로 판정기의 관할이 아니다", async () => {
    const subject = await subjectFor("https://example.com/");
    expect(subject["kind"]).toBe("webFetch");
    expect(subject).not.toHaveProperty("scope");
  });

  it("경로 판정기를 호출하지 않는다 — URL은 경로가 아니다", async () => {
    // 판정기를 부르는 구현은 URL을 경로로 착각한 것이고, 그 경우 워크스페이스
    // 밖/안 판정이 URL 문자열에 붙어 매트릭스 판정이 오염된다
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await runWeb({ prompt, classifier: makeExplodingClassifier() }, "web_fetch", {
      url: "https://example.com/",
    });
    expect(verdict).toEqual({ decision: "allow", layer: "prompt" });
    expect(subjectOf(prompt.last).kind).toBe("webFetch");
  });
});

describe("allowlist 키는 스킴+호스트+포트다 (APPROVAL-GATE §4 · WEB-ACCESS §6)", () => {
  it("키는 `webFetch:<origin>` 형태다 — 판정 대상의 origin과 같은 값이다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await runWeb({ prompt }, "web_fetch", { url: "https://example.com/a?x=1" });
    const subject = subjectOf(prompt.last) as unknown as Record<string, unknown>;
    expect(prompt.last?.allowAlwaysKey).toBe(`webFetch:${String(subject["origin"])}`);
  });

  it("경로·쿼리가 달라도 같은 키다 — URL 전체면 아무것도 학습되지 않는다", async () => {
    const a = await keyFor("https://example.com/a?x=1");
    const b = await keyFor("https://example.com/b?y=2");
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(a).not.toContain("x=1");
  });

  it("프래그먼트·후행 슬래시·기본 경로도 같은 키다", async () => {
    const base = await keyFor("https://example.com/");
    expect(base).toBeDefined(); // 둘 다 undefined면 "같다"가 무의미해진다
    for (const url of [
      "https://example.com",
      "https://example.com/#top",
      "https://example.com/?",
    ]) {
      expect(await keyFor(url), url).toBe(base);
    }
  });

  it("기본 포트가 정규화된다 — `https://example.com`과 `https://example.com:443`이 같은 키", async () => {
    const https = await keyFor("https://example.com/");
    const http = await keyFor("http://example.com/");
    expect(https).toBeDefined();
    expect(http).toBeDefined();
    expect(await keyFor("https://example.com:443/")).toBe(https);
    expect(await keyFor("http://example.com:80/")).toBe(http);
  });

  it("origin 표기는 전역 `URL.origin` 직렬화 그대로다 — 기본 포트는 생략된다 (판정 C-3)", async () => {
    // 표기를 우리가 발명하지 않는다: 포트를 덧붙이는 코드가 그 자체로 또 하나의
    // 정규화 규칙이 되고, 이 키는 `~/.neo-agent/allowlist`에 **영속**되므로 나중에
    // 표기를 바꾸면 사용자의 학습이 이유 없이 통째로 무효가 된다(CLI-INTERFACE §10).
    expect(await keyFor("https://example.com/")).toBe("webFetch:https://example.com");
    expect(await keyFor("https://example.com:443/")).toBe("webFetch:https://example.com");
    expect(await keyFor("http://example.com/")).toBe("webFetch:http://example.com");
    // 비기본 포트는 나타난다
    expect(await keyFor("https://example.com:8443/")).toBe("webFetch:https://example.com:8443");
  });

  it("기본이 아닌 포트는 다른 키다 — 포트가 키의 일부다", async () => {
    const base = await keyFor("https://example.com/");
    expect(await keyFor("https://example.com:8443/")).not.toBe(base);
  });

  it("서브도메인은 다른 키다 — 도메인 접미사로 넓히지 않는다(서브도메인 탈취 방어)", async () => {
    const base = await keyFor("https://example.com/");
    for (const url of [
      "https://sub.example.com/",
      "https://a.b.example.com/",
      "https://example.com.attacker.test/",
      "https://notexample.com/",
    ]) {
      expect(await keyFor(url), url).not.toBe(base);
    }
  });

  it("스킴이 다르면 다른 키다 — 스킴이 키의 일부다", async () => {
    expect(await keyFor("http://example.com/")).not.toBe(await keyFor("https://example.com/"));
  });

  it("대소문자가 다른 호스트는 같은 대상이다 — 호스트는 대소문자를 구분하지 않는다", async () => {
    // 여기서 갈리면 `HTTPS://EXAMPLE.COM`이 학습을 우회하는 별도 키가 된다
    const base = await keyFor("https://example.com/");
    expect(base).toBeDefined();
    expect(await keyFor("https://EXAMPLE.com/")).toBe(base);
  });
});

describe("학습과 매칭 (계층 6)", () => {
  it("`allow-always`면 origin 키가 학습된다", async () => {
    const allowlist = makeAllowlist();
    const prompt = makePrompt({ response: "allow-always" });
    await runWeb({ allowlist, prompt }, "web_fetch", { url: "https://example.com/a?x=1" });
    expect(allowlist.added).toHaveLength(1);
    expect(allowlist.added[0]).toBe(prompt.last?.allowAlwaysKey);
  });

  it("학습된 호스트는 다른 경로·쿼리로도 자동 허용된다 (WEB-ACCESS §6 표)", async () => {
    const key = await keyFor("https://example.com/");
    if (key === undefined) throw new Error("학습 키가 없다");

    const prompt = makePrompt({ response: "deny" });
    const verdict = await runWeb({ allowlist: makeSeededAllowlist([key]), prompt }, "web_fetch", {
      url: "https://example.com/other?q=1",
    });
    expect(verdict).toEqual({ decision: "allow", layer: "allowlist" });
    expect(prompt.calls).toEqual([]);
  });

  it("학습된 호스트가 서브도메인까지 열어주지 않는다", async () => {
    const key = await keyFor("https://example.com/");
    if (key === undefined) throw new Error("학습 키가 없다");

    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await runWeb({ allowlist: makeSeededAllowlist([key]), prompt }, "web_fetch", {
      url: "https://evil.example.com/",
    });
    expect(verdict).toEqual({ decision: "allow", layer: "prompt" });
    expect(prompt.calls).toHaveLength(1);
  });
});

describe("정책 매트릭스는 webFetch를 자동 허용하지 않는다 (APPROVAL-GATE §3)", () => {
  it("최초 호스트는 항상 프롬프트다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await runWeb({ prompt }, "web_fetch", { url: "https://example.com/" });
    expect(verdict).toEqual({ decision: "allow", layer: "prompt" });
    expect(prompt.calls).toHaveLength(1);
  });

  it("어떤 URL도 매트릭스로 통과하지 않는다", async () => {
    for (const url of [
      "https://example.com/",
      "http://localhost:3000/",
      "https://127.0.0.1/",
      "https://example.com/robots.txt",
    ]) {
      const verdict = await runWeb(
        { prompt: makePrompt({ response: "allow-once" }) },
        "web_fetch",
        {
          url,
        },
      );
      expect(verdict, url).not.toMatchObject({ layer: "policy-matrix" });
    }
  });
});

describe("fail-closed — 판독 불가는 unknown이다 (APPROVAL-GATE §3)", () => {
  it("URL 파싱에 실패하면 unknown으로 떨어지고 학습 키가 없다", async () => {
    for (const url of ["not a url", "://example.com", "https://", "", "   ", "/relative/path"]) {
      const prompt = makePrompt({ response: "allow-always" });
      const allowlist = makePermissiveAllowlist();
      const verdict = await runWeb({ prompt, allowlist }, "web_fetch", { url });

      expect(subjectOf(prompt.last).kind, url).toBe("unknown");
      expect(prompt.last?.allowAlwaysKey, url).toBeUndefined();
      expect(verdict, url).toEqual({ decision: "allow", layer: "prompt" });
      // 무엇이든 학습됐다고 답하는 allowlist를 끼워도 새지 않는다
      expect(allowlist.added, url).toEqual([]);
    }
  });

  it("인자를 문자열로 읽지 못해도 unknown이다 — 기존 fail-closed 규율과 같은 방향", async () => {
    for (const args of [
      { url: 42 },
      { url: null },
      { url: ["https://example.com"] },
      {},
      null,
      "s",
    ]) {
      const prompt = makePrompt({ response: "allow-always" });
      const allowlist = makeAllowlist();
      await runWeb({ prompt, allowlist }, "web_fetch", args);

      expect(subjectOf(prompt.last).kind, JSON.stringify(args)).toBe("unknown");
      expect(prompt.last?.allowAlwaysKey, JSON.stringify(args)).toBeUndefined();
      expect(allowlist.added).toEqual([]);
    }
  });

  it("판정 불가 사유가 경고로 전달된다 — 사용자가 이유를 알 수 있게", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await runWeb({ prompt }, "web_fetch", { url: "not a url" });
    expect(prompt.last?.warnings.length).toBeGreaterThan(0);
  });

  it("불투명 origin은 webFetch로 분류되고 학습 키만 없다 (판정 C-4)", async () => {
    // `file:///a`·`data:,x`는 전역 `URL`로 **파싱에 성공**하지만 `origin`이
    // `"null"`이라 대상을 식별하지 못한다. 셸 연산자 포함 명령과 **같은 기계**로
    // 다룬다 — 분류는 유지하고 `allowAlwaysKey`만 주지 않는다(§4).
    // `unknown`으로 떨어뜨리지 않는 이유는 그쪽 `display`가 "프로필에 등록되지
    // 않았다"는 **거짓 사유**를 보이고 URL이 화면에서 사라지기 때문이다.
    for (const url of ["file:///etc/passwd", "data:,alpha"]) {
      const prompt = makePrompt({ response: "allow-always" });
      const allowlist = makeAllowlist();
      const verdict = await runWeb({ prompt, allowlist }, "web_fetch", { url });

      expect(subjectOf(prompt.last).kind, url).toBe("webFetch");
      expect(prompt.last?.allowAlwaysKey, url).toBeUndefined();
      expect(allowlist.added, url).toEqual([]);
      expect(verdict, url).toEqual({ decision: "allow", layer: "prompt" });
      expect(prompt.last?.display, url).toContain(url);
    }
  });

  it("호스트가 없는 URL이 서로 다른 대상을 같은 키로 묶지 않는다 (판정 C-4의 귀결)", async () => {
    // 순진하게 `url.origin`을 키로 쓰면 모든 불투명 URL이 `webFetch:null` 한 키로
    // 묶여, `file:///a`를 한 번 허용한 사용자가 `~/.ssh/id_rsa`까지 허용한 셈이
    // 된다 — §7이 첫 토큰 키를 배제한 바로 그 실패 양태다. 원인(어떻게 분류하든)이
    // 아니라 **금지된 결과**를 잡는다.
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ["file:///etc/passwd", "file:///home/user/.ssh/id_rsa"],
      ["data:,alpha", "data:,beta"],
    ];
    for (const [first, second] of pairs) {
      const a = await keyFor(first);
      const b = await keyFor(second);
      const collided = a !== undefined && a === b;
      expect(collided, `${first} 와 ${second} 가 같은 학습 키(${String(a)})를 갖는다`).toBe(false);
    }
  });
});

describe("표시 — URL도 위조 탐지를 거친다 (APPROVAL-GATE §4)", () => {
  it("display에 URL이 담긴다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await runWeb({ prompt }, "web_fetch", { url: "https://example.com/a?x=1" });
    expect(prompt.last?.display).toContain("https://example.com/a?x=1");
  });

  it("비가시 문자가 가시 표기로 드러나고 원본은 남지 않는다", async () => {
    // 사용자가 `https://example.com`으로 읽은 것이 실제로는 다른 호스트일 수 있다.
    // 승인 UI가 거짓말하면 게이트 전체가 무의미하다
    const prompt = makePrompt({ response: "allow-once" });
    await runWeb({ prompt }, "web_fetch", {
      url: `https://exam${ZERO_WIDTH_SPACE}ple.com/`,
    });
    expect(prompt.last?.display).toContain("<U+200B>");
    expect(prompt.last?.display).not.toContain(ZERO_WIDTH_SPACE);
    expect(prompt.last?.warnings.length).toBeGreaterThan(0);
  });

  it("위조 흔적이 있으면 '항상 허용' 선택지가 없다 — 위조된 호스트가 학습되면 안 된다", async () => {
    const allowlist = makeAllowlist();
    const prompt = makePrompt({ response: "allow-always" });
    await runWeb({ prompt, allowlist }, "web_fetch", {
      url: `https://exam${ZERO_WIDTH_SPACE}ple.com/`,
    });
    expect(prompt.last?.allowAlwaysKey).toBeUndefined();
    expect(allowlist.added).toEqual([]);
  });
});
