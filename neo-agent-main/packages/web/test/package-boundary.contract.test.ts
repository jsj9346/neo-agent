/**
 * 패키지 경계와 공개 표면 — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처: `docs/WEB-ACCESS.md` §2(의존성 예산 2개, 허용/금지 내장 모듈,
 * `packages/tools`·`packages/gate`와 무의존)·§4(`node:https` 직접 사용은 전제,
 * 완화 표면 부재)·§7(`undici`·`ipaddr.js`·프록시 미도입).
 *
 * 소스 텍스트를 직접 읽는 이유: "임포트하지 않는다"는 **임포트 그래프의 성질**이라
 * 실행으로는 확인되지 않는다. 예산 게이트(`scripts/check-core-budget.mjs`)와 중복되는
 * 항목이 있지만, 그쪽은 통합 게이트에서만 돌고 이쪽은 패키지 스코프 테스트에서 돈다 —
 * 병렬 구간에서 경계 위반을 먼저 알아채는 것이 목적이다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as barrel from "../src/index.ts";

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

function sourceFiles(): { name: string; text: string }[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(join(SRC_DIR, name), "utf8") }));
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
    // `lookup` 훅을 준다). `ipaddr.js`는 `net.BlockList`가 대신한다.
    const forbidden = /from\s+["'](undici|ipaddr\.js|cheerio|jsdom|node-html-parser|turndown)["']/;
    for (const file of sourceFiles()) {
      expect(forbidden.test(file.text), `${file.name}이 외부 라이브러리를 쓴다`).toBe(false);
    }
  });
});

describe("금지 내장 모듈 (WEB-ACCESS §2 — tools와 정확히 역방향)", () => {
  it("파일·프로세스·DB·OS 모듈을 임포트하지 않는다", () => {
    // 웹 도구가 파일·프로세스·DB에 닿을 이유가 없다. 이 금지가 `packages/tools`의
    // 네트워크 금지와 **대칭**이라 두 패키지가 서로의 일을 대신할 수 없다.
    const forbidden =
      /from\s+["']node:(fs|fs\/promises|child_process|sqlite|os|worker_threads)["']/;
    for (const file of sourceFiles()) {
      expect(forbidden.test(file.text), `${file.name}이 금지 모듈을 임포트한다`).toBe(false);
    }
  });

  it("동적 임포트·require로 우회하지 않는다", () => {
    const sneaky = /(?:import|require)\s*\(\s*["']node:(fs|child_process|sqlite|os)/;
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
      expect(relaxation.test(file.text), `${file.name}에 완화 식별자가 있다`).toBe(false);
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
