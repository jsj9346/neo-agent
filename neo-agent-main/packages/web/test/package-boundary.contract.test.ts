/**
 * 패키지 경계와 공개 표면 — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처: `docs/WEB-ACCESS.md` §2(의존성 예산 2개, **허용 내장 모듈**·**금지 모듈** 다섯,
 * `packages/tools`·`packages/gate`와 무의존)·§4(`node:https` 직접 사용은 전제,
 * 완화 표면 부재)·§7(`undici`·`ipaddr.js`·프록시 미도입).
 *
 * 소스 텍스트를 직접 읽는 이유: "임포트하지 않는다"는 **임포트 그래프의 성질**이라
 * 실행으로는 확인되지 않는다. 예산 게이트(`scripts/check-core-budget.mjs`)와 중복되는
 * 항목이 있지만, 그쪽은 통합 게이트에서만 돌고 이쪽은 패키지 스코프 테스트에서 돈다 —
 * 병렬 구간에서 경계 위반을 먼저 알아채는 것이 목적이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as barrel from "../src/index.ts";

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

/**
 * 주석 본문을 공백으로 지운다(줄 번호·열 폭 보존). **문자열 리터럴은 남긴다** — 아래
 * 경계 단정이 보는 것이 임포트 지정자와 환경 변수 이름, 즉 문자열 안이기 때문이다. 그래서
 * 이 함수가 하는 일은 «문자열을 건너뛰며 주석만 지운다»이고, 문자열 안의 `//`에 안 속는
 * 것이 요점이다(이 패키지의 소스는 URL 리터럴을 든다).
 *
 * **파일-로컬 복제다.** `packages/cli/test/package-boundary.contract.test.ts`에 같은
 * 술어가 있고 공유하지 않았다 — 그 파일의 머리가 적는 이유(계약 판정이 다른 테스트의 헬퍼
 * 변경에 끌려가지 않게 한다)가 여기에도 그대로 선다. 렉싱 정본(`scripts/comment-lexer.mjs`)을
 * 안 부르는 것은 그쪽이 `typescript` 파서를 세우기 때문이다 — 이 패키지의 런타임 예산은
 * 둘이고(위 `:38` 단정) 판정 하나를 위해 파서를 끌어올 자리가 아니다.
 */
function stripComments(source: string): string {
  let out = "";
  let index = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === "//") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) break;
        cursor += 1;
      }
      out += source.slice(index, Math.min(cursor + 1, source.length));
      index = Math.min(cursor + 1, source.length);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/**
 * `src/`의 모듈들.
 *
 * - `text` — **주석을 벗긴** 원문. 임포트 그래프와 실제 코드를 재는 단정이 쓴다.
 * - `raw` — 벗기지 않은 원문. **완화 표면 부재 검사 하나만** 쓴다(아래 `:118`).
 *
 * **두 필드를 나란히 두는 것이 이 파일의 판정이다.** 이 스위트의 단정 대부분은 «코드가
 * 무엇을 임포트·호출하는가»를 묻고, 그런 자리에서 주석 안의 언급은 답이 아니다 — 금지
 * 대상을 이름으로 부르며 «쓰지 않는다»고 적는 줄이 이 레포의 흔한 문체라 그대로 오탐이
 * 된다. 반대로 완화 표면 검사는 **주석까지가 검사 대상**이라고 그 자리가 스스로 계약을
 * 적었다. 그쪽에 주석 제거를 걸면 우회를 막는 것이 아니라 그 계약을 무르는 것이다.
 */
function sourceFiles(): { name: string; text: string; raw: string }[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => {
      const raw = readFileSync(join(SRC_DIR, name), "utf8");
      return { name, text: stripComments(raw), raw };
    });
}

describe("의존성 예산 (WEB-ACCESS §2)", () => {
  it("런타임 의존성은 zod와 @neo-agent/core 정확히 2개다", () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(["@neo-agent/core", "zod"]);
  });

  it("`undici`·`ipaddr.js`·HTML 파서를 임포트하지 않는다 (§7 기판정)", () => {
    // `undici`는 의존성 문제가 아니라 **능력**의 문제로 기각됐다(`node:https`만
    // `lookup` 훅을 준다). `ipaddr.js`는 «대체»가 아니라 **수요 소멸**로 빠졌다
    // (2026-09-09 §7 근거 갱신, `K-599`): 이 라이브러리가 파는 값은 `range()` 분류와
    // 임베드 IPv4 추출인데, §4의 두 규칙 아래에서 재판정이 필요한 형식은 well-known
    // NAT64 하나뿐이고 그것은 표 확장으로 표현된다(`BLOCKED_NAT64_SHADOW` — 파싱 0줄).
    // 나머지는 통째 차단이라 추출할 대상이 없다.
    const forbidden = /from\s+["'](undici|ipaddr\.js|cheerio|jsdom|node-html-parser|turndown)["']/;
    for (const file of sourceFiles()) {
      expect(forbidden.test(file.text), `${file.name}이 외부 라이브러리를 쓴다`).toBe(false);
    }
  });
});

describe("금지 모듈 (WEB-ACCESS §2 — tools와 정확히 역방향)", () => {
  it("파일·프로세스·DB·OS 모듈과 그 우회로를 임포트하지 않는다", () => {
    // 웹 도구가 파일·프로세스·DB에 닿을 이유가 없다. 이 금지가 `packages/tools`의
    // 네트워크 금지와 **대칭**이라 두 패키지가 서로의 일을 대신할 수 없다.
    // `node:worker_threads`는 그 넷을 되돌리는 자리라 함께 든다 — 워커는 자기 컨텍스트에서
    // `node:fs`·`node:child_process`를 그대로 열 수 있다(2026-08-24 열거 편입).
    const forbidden =
      /from\s+["']node:(fs|fs\/promises|child_process|sqlite|os|worker_threads)["']/;
    for (const file of sourceFiles()) {
      expect(forbidden.test(file.text), `${file.name}이 금지 모듈을 임포트한다`).toBe(false);
    }
  });

  it("동적 임포트·require로 우회하지 않는다", () => {
    // 정적 임포트 단정과 **같은 집합**을 든다 — 두 단정이 다른 목록을 들면 한쪽이 낡아도
    // 다른 쪽이 그린이라 낡음이 안 보인다.
    const sneaky = /(?:import|require)\s*\(\s*["']node:(fs|child_process|sqlite|os|worker_threads)/;
    for (const file of sourceFiles()) {
      expect(sneaky.test(file.text), `${file.name}이 동적 임포트로 우회한다`).toBe(false);
    }
  });
});

describe("패키지 무의존 (WEB-ACCESS §2)", () => {
  it("`@neo-agent/tools`·`@neo-agent/gate`를 임포트하지 않는다", () => {
    // 결합은 호스트(CLI)의 배선 한 곳에서만 일어난다. 게이트 프로필 타입을
    // `packages/web`이 자체 정의하는 이유가 이것이다(TOOLS-INTERFACE §5).
    for (const file of sourceFiles()) {
      expect(file.text.includes("@neo-agent/tools"), `${file.name}`).toBe(false);
      expect(file.text.includes("@neo-agent/gate"), `${file.name}`).toBe(false);
    }
  });
});

describe("전송 계층의 전제 (WEB-ACCESS §4·§7)", () => {
  it("`node:https`를 직접 쓴다 — 내장 fetch로는 4~5단계가 불가능하다", () => {
    const files = sourceFiles();
    expect(files.some((file) => /from\s+["']node:https["']/.test(file.text))).toBe(true);
  });

  it("전역 `fetch`를 쓰지 않는다 — dispatcher에 `lookup`을 꽂을 수 없다(실측 확정)", () => {
    for (const file of sourceFiles()) {
      expect(file.text.includes("globalThis.fetch"), `${file.name}`).toBe(false);
      expect(/\bnew\s+Request\s*\(/.test(file.text), `${file.name}`).toBe(false);
    }
  });

  it("HTTP 프록시 설정을 읽지 않는다 — 프록시는 IP 피닝을 무력화한다 (§7)", () => {
    const proxyEnv = /HTTPS?_PROXY|https?_proxy|NO_PROXY/;
    for (const file of sourceFiles()) {
      expect(proxyEnv.test(file.text), `${file.name}이 프록시 설정을 읽는다`).toBe(false);
    }
  });

  it("TLS 검증을 끄지 않는다", () => {
    // 계약 테스트는 자체 서명 인증서를 쓰려고 `NODE_TLS_REJECT_UNAUTHORIZED`를
    // 프로세스 수준에서 완화한다(fixtures/https-server.ts). 그 완화가 구현의 TLS
    // 검증 누락을 가려버리므로, **여기서 소스로 보상 검증**한다.
    for (const file of sourceFiles()) {
      expect(/rejectUnauthorized\s*:\s*false/.test(file.text), `${file.name}`).toBe(false);
      expect(file.text.includes("NODE_TLS_REJECT_UNAUTHORIZED"), `${file.name}`).toBe(false);
      expect(/checkServerIdentity\s*:/.test(file.text), `${file.name}`).toBe(false);
    }
  });
});

describe("완화 표면 부재 (WEB-ACCESS §4)", () => {
  it("사설 대역 허용·판정 우회를 뜻하는 식별자가 소스에 없다", () => {
    // 플랜 T-005의 검증 조건과 같은 검사다:
    //   grep -rn "allow.*private\|allowPrivate\|skipSsrf" packages/web/src/  → 0건
    // **주석도 포함이다.** hermes의 `allow_private_urls`를 언급하려면 그 문자열을
    // 쓰지 말고 "완화 설정(레퍼런스의 사설 대역 허용 옵션)"처럼 풀어 쓴다 —
    // 검사를 통과하기 위한 회피가 아니라, 이 표면이 코드에 존재하지 않는다는 것을
    // 기계로 말할 수 있게 유지하기 위한 규율이다.
    const relaxation = /allow[_-]?[Pp]rivate|allowLocalhost|skipSsrf|disableSsrf|bypassSsrf/;
    for (const file of sourceFiles()) {
      // **이 스위트에서 유일하게 `raw`를 쓰는 자리다.** 다른 단정은 주석을 벗긴 `text`를
      // 보지만 여기서는 주석이 곧 검사 대상이므로 벗기면 위 규율이 사라진다.
      expect(relaxation.test(file.raw), `${file.name}에 완화 식별자가 있다`).toBe(false);
    }
  });

  it("설정 파일·환경 변수에서 차단 대역을 읽지 않는다", () => {
    // 설정 표면이 없으면 약화 경로도 없다(§4). `node:fs` 금지가 이미 파일 경로를
    // 막으므로 남는 구멍은 환경 변수다.
    for (const file of sourceFiles()) {
      expect(/process\.env/.test(file.text), `${file.name}이 환경 변수를 읽는다`).toBe(false);
    }
  });
});

describe("공개 배럴 (T-001 모듈 배치 스케치)", () => {
  it("계약이 요구하는 이름을 전부 내보낸다", () => {
    // 이름이 다르면 호스트(CLI) 배선과 이 테스트 스위트가 동시에 깨진다 —
    // 공개 표면은 조정 가능한 세부가 아니라 계약이다.
    for (const name of [
      "createBlockList",
      "verifyUrl",
      "fetchUrl",
      "extractText",
      "createWebFetchTool",
      "WEB_TOOL_GATE_PROFILES",
    ]) {
      expect(barrel, `배럴에 ${name}이 없다`).toHaveProperty(name);
    }
  });

  it("자리표시자가 아니다 — 실제 구현이 붙어 있다", () => {
    expect(Object.keys(barrel).length).toBeGreaterThan(0);
    expect(typeof barrel.createBlockList).toBe("function");
    expect(typeof barrel.verifyUrl).toBe("function");
    expect(typeof barrel.fetchUrl).toBe("function");
    expect(typeof barrel.extractText).toBe("function");
    expect(typeof barrel.createWebFetchTool).toBe("function");
  });
});

/**
 * 이 아래 두 스위트는 2026-09-02에 붙었다(`K-412` T-010).
 *
 * 기대값의 출처는 `docs/WEB-ACCESS.md` §3.2 「종단의 신원은 TLS가 진다」·「요청 신원은
 * 정직하다」, `docs/ARCHITECTURE.md` §2.2, `docs/DISTRIBUTION.md` §4다.
 *
 * **§4 면제의 전제 셋과 같은 목록에 넣지 않는다.** §3.2가 명시로 가른다 — 저 셋은
 * *"면제가 성립하는 전제"*를 재고 이 축들은 *"종단이 누구인가"*를 재는 다른 물음이다.
 * 그래서 여기는 `web-search.contract.test.ts`가 아니라 이 파일이고, 대상도 검색 경로가
 * 아니라 `packages/web` 전체다.
 *
 * **역검증 완료 (2026-09-02).** 합성 소스 트리로 위반을 넣어 실제로 붉어지는 것을 확인했다 —
 * TLS 축 셋은 기존 축이 못 잡는 형태(`opts.rejectUnauthorized = 변수` · `opts.checkServerIdentity = () => undefined` ·
 * 문자열 리터럴 안의 `NODE_TLS_REJECT_UNAUTHORIZED`)에서 셋 다 붉었고, UA 축은 버전 갈림 ·
 * 사칭 문자열 · 조립 줄 부재에서 붉었다. **빈 디렉터리를 물리면 TLS 축 셋은 초록으로 남고
 * 「검사 대상이 비어 있지 않다」만 붉는다** — 그 자리가 이 스위트의 조용한 초록을 막는
 * 유일한 것이라 함께 확인했다. 세 번째 손복사(버전이 갈린 `third-transport.ts`)를 넣으면
 * **대조 축 둘은 초록으로 남고 「UA 리터럴을 든 파일이 그 둘뿐이다」만 붉는다** — 파일
 * 이름을 손으로 드는 축이 미래에 비어 가는 경로가 그 자리 하나다.
 */

/** 정규식이 정확히 한 번 맞는지 확인하고 첫 캡처를 돌려준다. */
function soleCapture(source: string, pattern: RegExp, label: string): string {
  const matches = [...source.matchAll(pattern)];
  expect(matches.length, `${label}이 정확히 1건이 아니다 (실측 ${matches.length}건)`).toBe(1);
  const captured = matches[0]?.[1];
  expect(typeof captured, `${label}의 캡처가 비었다`).toBe("string");
  return captured as string;
}

describe("종단의 신원은 TLS가 진다 (WEB-ACCESS §3.2)", () => {
  /**
   * **[문서 부정확 — 판정 필요]** §3.2가 이 계약을 세우며 든 전제 *"오늘 실물은 안전하나
   * 그것은 계약이 아니라 우연이다"*는 테스트 층에 대해서는 정확하지 않다. 이 파일 위쪽의
   * 「TLS 검증을 끄지 않는다」 축이 2026-08-09(`9281265`)부터 세 문자열을 **부분적으로**
   * 재고 있었다 — 즉 실물이 안전했던 것은 우연이 아니라 그 축이 절반쯤 지켰기 때문이다.
   *
   * 그럼에도 §3.2의 **판정 자체는 옳다**: 그 축이 재는 형태가 계약이 요구하는 부재보다
   * 좁고(아래 축의 주석이 셋을 든다), 무엇보다 그 축은 **어느 정본 문서에도 근거가 없는
   * 채로** 서 있었다 — 근거를 잃은 축은 다음 사이클이 "이건 왜 있지"로 지운다.
   * 고칠 방향은 §3.2의 저 문장을 「축은 있었으나 계약이 없었고 축도 좁았다」로 좁히는 것.
   */
  /**
   * **먼저 읽는 대상이 비지 않았음을 단정한다.** 아래 축은 「문자열이 없다」는 부재 단정이라
   * 목록이 비면 조용히 초록이 된다 — 이 파일의 다른 부재 단정 전부가 같은 형태이고,
   * 그것들이 오늘 그 보호를 갖고 있지 않다(발견 사항으로 보고했다).
   */
  it("검사 대상이 비어 있지 않다 — 부재 단정의 전제", () => {
    const names = sourceFiles().map((file) => file.name);
    expect(names.length).toBeGreaterThan(0);
    // 두 전송 파일이 대상에 반드시 든다. 보증이 두 경로 공통이라는 것이 §3.2가 대상을
    // 검색 경로가 아니라 패키지 전체로 잡은 근거다.
    expect(names).toContain("fetch.ts");
    expect(names).toContain("search-transport.ts");
  });

  /**
   * §3.2가 축의 형태를 축자로 지정한다 — TLS 검증을 무르는 문자열 셋이 `packages/web/src`에
   * 없다는 **소스 텍스트 단정**이다. 셋을 개별 이름으로 든다: 한 정규식으로 묶으면 실패
   * 문면이 어느 문자열인지 말하지 못한다.
   *
   * **`raw`를 본다 — 주석까지가 검사 대상이다.** 근거는 이 파일의 완화 표면 축과 같다:
   * §3.2가 요구한 것은 「그 문자열이 소스에 없다」이고, 주석에 적힌 이름은 소스에 있는
   * 것이다. 금지 대상을 언급해야 하면 풀어 쓴다(그 규율이 이미 `allow_private_urls`에
   * 대해 서 있다). **오늘 `src/`에는 주석에도 0건이라 이 엄격도가 값을 치르지 않는다.**
   *
   * 같은 파일 위쪽의 「TLS 검증을 끄지 않는다」 축과 중복이 아니다 — 그쪽은 `rejectUnauthorized`를
   * `: false` 형태에서만, `checkServerIdentity`를 `:` 형태에서만 잡고 주석을 벗긴 본문을 본다.
   * 즉 계약이 요구하는 부재보다 **좁다**. 그쪽을 지우지 않는 것은 그 자리가 픽스처의
   * 프로세스 수준 TLS 완화를 보상한다는 별도 근거를 들기 때문이다.
   */
  it.each(["rejectUnauthorized", "checkServerIdentity", "NODE_TLS_REJECT_UNAUTHORIZED"])(
    "`%s`가 packages/web/src 전체에 0건이다",
    (needle) => {
      for (const file of sourceFiles()) {
        expect(file.raw.includes(needle), `${file.name}에 \`${needle}\`이 있다`).toBe(false);
      }
    },
  );
});

describe("요청 신원은 정직하다 — UA 3자 대조 (WEB-ACCESS §3.1·§3.2 · ARCHITECTURE §2.2 · DISTRIBUTION §4)", () => {
  /**
   * **정본은 `packages/providers`에 있다.** `DISTRIBUTION.md` §4 — *"`NEO_AGENT_USER_AGENT`
   * (`packages/providers/src/anthropic/registration.ts`)가 버전의 정본이고, `package.json`의
   * `version`은 파생이다."* 예산 게이트는 그 리터럴과 `package.json`들만 대조한다.
   * **`packages/web`의 손복사 둘은 그 게이트 밖이다** — 이 스위트가 그 구멍을 닫는다.
   */
  const CANON = fileURLToPath(
    new URL("../../providers/src/anthropic/registration.ts", import.meta.url),
  );
  const TRANSPORTS = ["fetch.ts", "search-transport.ts"] as const;

  function canonicalUserAgent(): string {
    // 게이트(`scripts/check-core-budget.mjs`)가 쓰는 것과 같은 앵커. 파일이 사라지면
    // `readFileSync`가 던진다 — 조용한 초록으로 빠지지 않는다.
    return soleCapture(
      readFileSync(CANON, "utf8"),
      /^export const NEO_AGENT_USER_AGENT = "(neo-agent\/[^"]+)"/gm,
      "registration.ts의 NEO_AGENT_USER_AGENT 리터럴",
    );
  }

  /**
   * 손복사 파일의 UA를 **조립 형태까지 확인하고** 돌려준다.
   *
   * 템플릿 줄의 존재를 함께 단정하는 것이 요점이다 — 버전 리터럴만 비교하면 그 파일이
   * UA를 다른 데서 만들어도 축이 초록이라, 재는 것이 실제로 나가는 문자열이 아니게 된다.
   */
  function handCopiedUserAgent(name: string): string {
    const source = readFileSync(join(SRC_DIR, name), "utf8");
    const version = soleCapture(
      source,
      /^const VERSION = "([^"]+)";$/gm,
      `${name}의 VERSION 리터럴`,
    );
    soleCapture(
      source,
      /^const (USER_AGENT) = `neo-agent\/\$\{VERSION\}`;$/gm,
      `${name}의 USER_AGENT 조립 줄`,
    );
    return `neo-agent/${version}`;
  }

  it("UA 리터럴을 든 파일이 그 둘뿐이다 — 손복사가 셋째로 늘면 붉는다", () => {
    // **이 축이 없으면 위 대조가 미래에 조용히 비어 간다.** 아래 둘은 파일 이름을 손으로
    // 들므로, 세 번째 전송 파일이 자기 UA 리터럴을 들고 들어와도 대조 대상이 아니다 —
    // 정본이 하나라는 계약(`DISTRIBUTION.md` §4)은 그 순간 조용히 깨진다.
    const declaring = sourceFiles()
      .filter((file) => /^const USER_AGENT = /m.test(file.text))
      .map((file) => file.name)
      .sort();
    expect(declaring).toEqual([...TRANSPORTS].sort());
  });

  it("두 전송 파일의 UA 리터럴이 서로 같다", () => {
    // 둘 다 버전을 손으로 든다(`node:fs` 금지의 귀결 — §2). 갈려도 오늘 붉어지는 것이
    // 없다는 것이 이 축의 존재 이유다.
    const [fetchUa, searchUa] = TRANSPORTS.map((name) => handCopiedUserAgent(name));
    expect(searchUa, "fetch.ts와 search-transport.ts의 UA가 갈렸다").toBe(fetchUa);
  });

  it("두 전송 파일의 UA가 버전 정본과 같다 (DISTRIBUTION §4)", () => {
    const canonical = canonicalUserAgent();
    for (const name of TRANSPORTS) {
      expect(handCopiedUserAgent(name), `${name}의 UA가 버전 정본과 어긋난다`).toBe(canonical);
    }
  });

  it("UA가 `neo-agent/<version>` 모양이고 다른 제품을 사칭하지 않는다 (ARCHITECTURE §2.2)", () => {
    // 컴플라이언스가 모델 프로바이더 밖으로 확장되는 지점이다. 사칭 토큰 목록은
    // `fetch.contract.test.ts`의 런타임 축과 같은 것을 쓴다 — 두 축이 다른 목록을 들면
    // 한쪽이 낡아도 다른 쪽이 초록이라 낡음이 안 보인다.
    const impersonation = /claude|anthropic|chrome|mozilla|safari|curl|python|vscode|codex/i;
    for (const name of [...TRANSPORTS]) {
      const ua = handCopiedUserAgent(name);
      expect(ua, `${name}`).toMatch(/^neo-agent\/\S+$/);
      expect(impersonation.test(ua), `${name}의 UA가 다른 제품을 사칭한다`).toBe(false);
    }
    expect(impersonation.test(canonicalUserAgent()), "버전 정본이 다른 제품을 사칭한다").toBe(
      false,
    );
  });
});
