/**
 * 패키지 경계 — 계약 독립 검증 (QA-B, 구현보다 먼저 작성).
 *
 * 기대값의 출처:
 *   - `docs/SANDBOX.md` §2 (의존성 예산 정확히 2개, **허용 내장 모듈**·**금지 모듈** 여덟,
 *     `packages/tools` 미임포트, Docker HTTP API가 아니라 CLI)
 *
 * **소스 텍스트를 직접 읽는 이유**: "`packages/tools`를 임포트하지 않는다"와
 * "`node:net`을 쓰지 않는다"는 런타임 동작이 아니라 **임포트 그래프의 성질**이라
 * 실행으로는 확인되지 않는다. 예산 게이트(`scripts/check-core-budget.mjs`)와
 * 이중으로 두는 이유는, 게이트는 CI 스크립트라 이 패키지의 테스트만 돌리는 개발
 * 루프에서 빠지기 때문이다.
 *
 * 이 파일은 `src`를 **임포트하지 않는다** — 구현 전에도 실행되어 스캐폴드가
 * 경계를 지키는지 보게 하려는 의도다.
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

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

/**
 * 주석 본문을 공백으로 지운다(줄 번호·열 폭 보존). **문자열 리터럴은 남긴다** — 아래
 * 경계 단정이 보는 것이 임포트 지정자와 경로 문자열, 즉 문자열 안이기 때문이다. 그래서 이
 * 함수가 하는 일은 «문자열을 건너뛰며 주석만 지운다»이고, 문자열 안의 `//`에 안 속는 것이
 * 요점이다(`/var/run/docker` 같은 경로가 그 자리다).
 *
 * **파일-로컬 복제다.** `packages/cli/test/package-boundary.contract.test.ts`에 같은
 * 술어가 있고 공유하지 않았다 — 그 파일의 머리가 적는 이유(계약 판정이 다른 테스트의 헬퍼
 * 변경에 끌려가지 않게 한다)가 여기에도 그대로 선다. 렉싱 정본(`scripts/comment-lexer.mjs`)을
 * 안 부르는 것은 그쪽이 `typescript` 파서를 세우기 때문이다 — 이 파일은 `src`조차 임포트하지
 * 않는다는 것이 위 머리의 의도이고(구현 전에도 돈다), 판정 하나를 위해 파서를 끌어올 자리가
 * 아니다.
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
 * `src/`의 모듈들. `text`는 **주석을 벗긴** 원문이다 — 아래 단정들이 재는 것은 임포트
 * 그래프와 실제 코드이지 사람이 적어 둔 설명이 아니다. 이 파일의 주석 문체 자체가 반례를
 * 만든다: 금지 대상을 이름으로 부르며 «쓰지 않는다»고 적는 줄이 소스에 흔하다.
 */
function sourceFiles(): { name: string; text: string }[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: stripComments(readFileSync(join(SRC_DIR, name), "utf8")) }));
}

describe("의존성 예산 (SANDBOX §2)", () => {
  it("런타임 의존성은 `@neo-agent/core`와 `zod` 정확히 2개다", () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(["@neo-agent/core", "zod"]);
  });

  it("`@neo-agent/tools`는 devDependency다 — 타입 호환 확인용이지 런타임 결합이 아니다", () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies ?? {}).not.toHaveProperty("@neo-agent/tools");
    expect(manifest.devDependencies ?? {}).toHaveProperty("@neo-agent/tools");
  });
});

describe("임포트 경계 (SANDBOX §2)", () => {
  it("`src/**`가 `@neo-agent/tools`를 임포트하지 않는다 — 구조적 타입 호환만", () => {
    // 임포트가 생기면 `ShellExecutor` 계약이 "구조적 호환"에서 "상속"으로 바뀌고,
    // 게이트가 `PathClassifier`를 임포트 없이 만족시키는 패턴이 깨진다.
    for (const file of sourceFiles()) {
      expect(file.text.includes("@neo-agent/tools"), `${file.name}가 tools를 임포트한다`).toBe(
        false,
      );
    }
  });

  it("`src/**`가 `@neo-agent/gate`·`@neo-agent/web`을 임포트하지 않는다", () => {
    for (const file of sourceFiles()) {
      for (const forbidden of ["@neo-agent/gate", "@neo-agent/web", "@neo-agent/cli"]) {
        expect(file.text.includes(forbidden), `${file.name}가 ${forbidden}를 임포트한다`).toBe(
          false,
        );
      }
    }
  });

  it("금지 모듈(파일·네트워크·DB)을 임포트하지 않는다", () => {
    // 샌드박스가 파일이나 네트워크에 직접 닿을 이유가 없다(§2). 특히 `node:net`은
    // Docker **HTTP API**로 가는 문이고, 소켓 접근 코드를 갖는 것 자체가 §1의
    // 위험(데몬은 호스트 root 권한)을 우리 코드 안으로 들이는 일이다. `node:tls`가 함께
    // 드는 것은 같은 API가 원격 데몬 상대로 TCP+TLS로도 열리기 때문이고,
    // `node:dgram`·`node:worker_threads`는 그 금지를 돌아가는 자리다(2026-08-24 열거 편입).
    const forbidden =
      /from\s+["']node:(fs|fs\/promises|net|tls|http|https|sqlite|dgram|worker_threads)["']/;
    for (const file of sourceFiles()) {
      expect(forbidden.test(file.text), `${file.name}가 금지 모듈을 임포트한다`).toBe(false);
    }
  });

  it("Docker와의 접점은 CLI 호출뿐이다 — 소켓 경로 문자열이 소스에 없다", () => {
    for (const file of sourceFiles()) {
      expect(file.text.includes("docker.sock"), `${file.name}가 소켓 경로를 안다`).toBe(false);
      expect(file.text.includes("/var/run/docker"), `${file.name}가 소켓 경로를 안다`).toBe(false);
    }
  });

  it("`node:child_process`는 허용된다 — 다만 아는 파일은 하나여야 한다", () => {
    // 스폰 지점이 흩어지면 "docker CLI 호출이 본업"이라는 경계가 서서히 무너진다.
    // 구현 전에는 0개이므로 상한만 본다(1개 이하).
    const spawners = sourceFiles()
      .filter((file) => file.text.includes("node:child_process"))
      .map((file) => file.name);
    expect(spawners.length).toBeLessThanOrEqual(1);
  });
});
